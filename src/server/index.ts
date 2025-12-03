/**
 * First Dollar MCP Server
 *
 * Express-based MCP server implementing the Streamable HTTP transport
 * per the MCP specification (2025-06-18).
 *
 * This server exposes Partner API operations as MCP tools for AI agents.
 */

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { registerTools } from './tools.js';

const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const HOST = process.env.MCP_HOST || '0.0.0.0';

// Store active transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// Store token per session for tool execution
const sessionTokens: Record<string, string> = {};

// Create Express app with MCP defaults (includes DNS rebinding protection for localhost)
// Note: allowedHosts only accepts strings, so we need to list specific domains
// or disable DNS rebinding protection for production Cloud Run deployments
const allowedHosts = [
    'localhost',
    '127.0.0.1',
    'mcp.dev.firstdollar.com',
    'mcp.staging.firstdollar.com',
    'mcp.firstdollar.com',
];

// In production (Cloud Run), add the Cloud Run domain from environment
// Cloud Run sets K_SERVICE and K_REVISION environment variables
if (process.env.K_SERVICE) {
    // Allow any host in Cloud Run (it handles its own security)
    // We'll validate hosts ourselves if needed
}

const app = createMcpExpressApp({
    host: HOST,
    // If running in Cloud Run, disable host checking (Cloud Run handles security)
    // Otherwise use our allowedHosts list
    ...(process.env.K_SERVICE ? {} : { allowedHosts }),
});

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

/**
 * Create and configure a new MCP server instance
 */
function createMcpServer(token: string): McpServer {
    const server = new McpServer({
        name: 'fd-mcp-server',
        version: '1.0.0',
    });

    // Register all Partner API tools
    registerTools(server, token);

    return server;
}

/**
 * POST /mcp - Main MCP endpoint for JSON-RPC messages
 *
 * Handles both new session initialization and existing session messages.
 * Supports Streamable HTTP with optional SSE for streaming responses.
 */
app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const token = extractBearerToken(req);

    if (!token) {
        res.status(401).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Unauthorized: Bearer token required',
            },
            id: null,
        });
        return;
    }

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
                    // Store the transport and token once session is initialized
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
            // Session expired or invalid
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
            // No session ID and not an initialize request
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

        // Handle the request through the transport
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
 * GET /mcp - SSE endpoint for server-to-client streaming
 *
 * Allows clients to receive server-sent events for long-running operations.
 * Supports resumability via Last-Event-ID header.
 */
app.get('/mcp', async (req: Request, res: Response) => {
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
 * DELETE /mcp - Session termination endpoint
 *
 * Allows clients to explicitly close their session per MCP specification.
 */
app.delete('/mcp', async (req: Request, res: Response) => {
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
        activeSessions: Object.keys(transports).length,
    });
});

/**
 * GET / - Server info endpoint
 */
app.get('/', (_req: Request, res: Response) => {
    res.json({
        name: 'fd-mcp-server',
        version: '1.0.0',
        description: 'First Dollar Partner API MCP Server',
        protocol: 'MCP',
        protocolVersion: '2025-06-18',
        transport: 'Streamable HTTP',
        endpoints: {
            mcp: '/mcp',
            health: '/health',
        },
        documentation: 'https://developer.firstdollar.com',
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[MCP] Shutting down...');

    // Close all active transports
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

// Start server
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
║    POST   /mcp     - JSON-RPC messages                    ║
║    GET    /mcp     - SSE streaming                        ║
║    DELETE /mcp     - Session termination                  ║
║    GET    /health  - Health check                         ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
