/**
 * First Dollar MCP Server
 *
 * Express-based MCP server implementing the Streamable HTTP transport
 * per the MCP specification (2025-06-18).
 *
 * This server exposes Partner API tools via the /mcp/partner endpoint
 * with API key authentication for Claude Desktop and other MCP clients.
 */

// Load environment variables from .env.local (for local development)
import { config } from 'dotenv';
config({ path: '.env.local' });

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { registerTools } from './tools.js';
import { authenticateRequest, isAuthError, getTokenCacheSize } from './auth.js';

const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const HOST = process.env.MCP_HOST || '0.0.0.0';

// Session storage
const transports: Record<string, StreamableHTTPServerTransport> = {};
const sessionTokens: Record<string, string> = {};

// Create Express app with MCP defaults
const allowedHosts = [
    'localhost',
    '127.0.0.1',
    'mcp.dev.firstdollar.com',
    'mcp.staging.firstdollar.com',
    'mcp.firstdollar.com',
];

const app = createMcpExpressApp({
    host: HOST,
    // If running in Cloud Run, disable host checking (Cloud Run handles security)
    ...(process.env.K_SERVICE ? {} : { allowedHosts }),
});

/**
 * Create and configure a new MCP server instance
 */
function createMcpServer(token: string): McpServer {
    const server = new McpServer({
        name: 'fd-mcp-server',
        version: '1.0.0',
    });

    // Register Partner API tools
    registerTools(server, token);

    return server;
}

// ============================================================================
// MCP Endpoint (/mcp/partner)
// Uses API key authentication for Claude Desktop and other headless clients
// ============================================================================

/**
 * POST /mcp/partner - Handle MCP requests
 */
app.post('/mcp/partner', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Authenticate the request
    const authResult = await authenticateRequest(req);

    if (isAuthError(authResult)) {
        res.status(401).json({
            jsonrpc: '2.0',
            error: {
                code: authResult.code,
                message: authResult.message,
            },
            id: null,
        });
        return;
    }

    const { token } = authResult;

    try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
            // Reuse existing transport for this session
            transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
            // New session - create transport and server
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                enableJsonResponse: true,
                onsessioninitialized: (newSessionId) => {
                    transports[newSessionId] = transport;
                    sessionTokens[newSessionId] = token;
                    console.log(`[MCP] New session initialized: ${newSessionId}`);
                },
            });

            // Clean up when transport closes
            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid) {
                    delete transports[sid];
                    delete sessionTokens[sid];
                    console.log(`[MCP] Session closed: ${sid}`);
                }
            };

            // Create and connect MCP server
            const server = createMcpServer(token);
            await server.connect(transport);
        } else if (sessionId && !transports[sessionId]) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Invalid or expired session',
                },
                id: null,
            });
            return;
        } else {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Invalid request: session ID required or initialize first',
                },
                id: null,
            });
            return;
        }

        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('[MCP] Error handling request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : 'Internal server error',
                },
                id: null,
            });
        }
    }
});

/**
 * GET /mcp/partner - Handle SSE connections
 */
app.get('/mcp/partner', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Invalid or missing session ID',
            },
            id: null,
        });
        return;
    }

    const transport = transports[sessionId];

    try {
        await transport.handleRequest(req, res);
    } catch (error) {
        console.error('[MCP] Error handling SSE request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

/**
 * DELETE /mcp/partner - Close a session
 */
app.delete('/mcp/partner', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
        res.status(404).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Session not found',
            },
            id: null,
        });
        return;
    }

    const transport = transports[sessionId];

    try {
        await transport.close();
        delete transports[sessionId];
        delete sessionTokens[sessionId];
        console.log(`[MCP] Session terminated by client: ${sessionId}`);
        res.status(204).send();
    } catch (error) {
        console.error('[MCP] Error closing session:', error);
        res.status(500).json({
            jsonrpc: '2.0',
            error: {
                code: -32603,
                message: 'Error closing session',
            },
            id: null,
        });
    }
});

// ============================================================================
// Utility Endpoints
// ============================================================================

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        server: 'fd-mcp-server',
        version: '1.0.0',
        protocol: 'MCP',
        protocolVersion: '2025-06-18',
        sessions: Object.keys(transports).length,
        cachedApiKeys: getTokenCacheSize(),
    });
});

/**
 * GET / - Server info endpoint
 */
app.get('/', (_req: Request, res: Response) => {
    res.json({
        name: 'fd-mcp-server',
        version: '1.0.0',
        description: 'First Dollar MCP Server',
        protocol: 'MCP',
        protocolVersion: '2025-06-18',
        transport: 'Streamable HTTP',
        endpoints: {
            mcp: {
                path: '/mcp/partner',
                description: 'MCP endpoint (API key auth)',
                methods: ['POST', 'GET', 'DELETE'],
            },
            health: '/health',
        },
        documentation: 'https://developer.firstdollar.com',
    });
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGINT', async () => {
    console.log('\n[MCP] Shutting down...');

    for (const [sessionId, transport] of Object.entries(transports)) {
        try {
            await transport.close();
            delete transports[sessionId];
            delete sessionTokens[sessionId];
            console.log(`[MCP] Closed session: ${sessionId}`);
        } catch (error) {
            console.error(`[MCP] Error closing session ${sessionId}:`, error);
        }
    }

    process.exit(0);
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, HOST, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           First Dollar MCP Server                         ║
╠═══════════════════════════════════════════════════════════╣
║  Status:    Running                                       ║
║  Host:      ${HOST.padEnd(45)}║
║  Port:      ${PORT.toString().padEnd(45)}║
║  Protocol:  MCP (Streamable HTTP)                         ║
║  Version:   2025-06-18                                    ║
╠═══════════════════════════════════════════════════════════╣
║  Endpoints:                                               ║
║    /mcp/partner  - MCP endpoint (API key auth)            ║
║    /health       - Health check                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
