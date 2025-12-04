/**
 * First Dollar MCP Server
 *
 * Express-based MCP server implementing the Streamable HTTP transport
 * per the MCP specification (2025-06-18).
 *
 * This server exposes two MCP endpoints:
 * - /mcp/partner - Partner API tools (API key auth for Claude Desktop)
 * - /mcp/manager - Manager API tools (Bearer token auth for web UI)
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
import { registerManagerTools } from './manager-tools.js';
import {
    authenticateApiKeyRequest,
    authenticateBearerRequest,
    isAuthError,
    getTokenCacheSize,
} from './auth.js';

const PORT = parseInt(process.env.MCP_PORT || '3001', 10);
const HOST = process.env.MCP_HOST || '0.0.0.0';

// Session storage - shared across both endpoints
// Prefix session IDs with endpoint type to avoid collisions
const transports: Record<string, StreamableHTTPServerTransport> = {};
const sessionTokens: Record<string, string> = {};
const sessionAuthMethods: Record<string, 'bearer' | 'api-key'> = {};
const sessionEndpointTypes: Record<string, 'partner' | 'manager'> = {};

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
 * Create and configure a new MCP server instance for Partner API
 */
function createPartnerMcpServer(token: string): McpServer {
    const server = new McpServer({
        name: 'fd-mcp-server-partner',
        version: '1.0.0',
    });

    // Register Partner API tools
    registerTools(server, token);

    return server;
}

/**
 * Create and configure a new MCP server instance for Manager API
 */
function createManagerMcpServer(token: string): McpServer {
    const server = new McpServer({
        name: 'fd-mcp-server-manager',
        version: '1.0.0',
    });

    // Register Manager API tools
    registerManagerTools(server, token);

    return server;
}

/**
 * Generic MCP POST handler factory
 */
function createMcpPostHandler(
    endpointType: 'partner' | 'manager',
    authenticateFn: (req: Request) => ReturnType<typeof authenticateApiKeyRequest>,
    createServerFn: (token: string) => McpServer,
) {
    return async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // Authenticate the request
        const authResult = await authenticateFn(req);

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

        const { token, method: authMethod } = authResult;

        try {
            let transport: StreamableHTTPServerTransport;

            if (sessionId && transports[sessionId]) {
                // Verify session is for the correct endpoint type
                if (sessionEndpointTypes[sessionId] !== endpointType) {
                    res.status(400).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32000,
                            message: `Session belongs to ${sessionEndpointTypes[sessionId]} endpoint, not ${endpointType}`,
                        },
                        id: null,
                    });
                    return;
                }
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
                        sessionAuthMethods[newSessionId] = authMethod;
                        sessionEndpointTypes[newSessionId] = endpointType;
                        console.log(
                            `[MCP ${endpointType}] New session initialized: ${newSessionId} (auth: ${authMethod})`,
                        );
                    },
                });

                // Clean up when transport closes
                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid) {
                        delete transports[sid];
                        delete sessionTokens[sid];
                        delete sessionAuthMethods[sid];
                        delete sessionEndpointTypes[sid];
                        console.log(`[MCP ${endpointType}] Session closed: ${sid}`);
                    }
                };

                // Create and connect MCP server
                const server = createServerFn(token);
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
            console.error(`[MCP ${endpointType}] Error handling request:`, error);
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
    };
}

/**
 * Generic MCP GET handler (SSE) factory
 */
function createMcpGetHandler(endpointType: 'partner' | 'manager') {
    return async (req: Request, res: Response) => {
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

        // Verify session is for the correct endpoint type
        if (sessionEndpointTypes[sessionId] !== endpointType) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: `Session belongs to ${sessionEndpointTypes[sessionId]} endpoint, not ${endpointType}`,
                },
                id: null,
            });
            return;
        }

        const transport = transports[sessionId];

        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            console.error(`[MCP ${endpointType}] Error handling SSE request:`, error);
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
    };
}

/**
 * Generic MCP DELETE handler factory
 */
function createMcpDeleteHandler(endpointType: 'partner' | 'manager') {
    return async (req: Request, res: Response) => {
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

        // Verify session is for the correct endpoint type
        if (sessionEndpointTypes[sessionId] !== endpointType) {
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: `Session belongs to ${sessionEndpointTypes[sessionId]} endpoint, not ${endpointType}`,
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
            delete sessionAuthMethods[sessionId];
            delete sessionEndpointTypes[sessionId];
            console.log(`[MCP ${endpointType}] Session terminated by client: ${sessionId}`);
            res.status(204).send();
        } catch (error) {
            console.error(`[MCP ${endpointType}] Error closing session:`, error);
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Error closing session',
                },
                id: null,
            });
        }
    };
}

// ============================================================================
// Partner API MCP Endpoints (/mcp/partner)
// Uses API key authentication for Claude Desktop and other headless clients
// ============================================================================

app.post(
    '/mcp/partner',
    createMcpPostHandler('partner', authenticateApiKeyRequest, createPartnerMcpServer),
);
app.get('/mcp/partner', createMcpGetHandler('partner'));
app.delete('/mcp/partner', createMcpDeleteHandler('partner'));

// ============================================================================
// Manager API MCP Endpoints (/mcp/manager)
// Uses Bearer token authentication for web UI users
// ============================================================================

app.post(
    '/mcp/manager',
    createMcpPostHandler('manager', authenticateBearerRequest, createManagerMcpServer),
);
app.get('/mcp/manager', createMcpGetHandler('manager'));
app.delete('/mcp/manager', createMcpDeleteHandler('manager'));

// ============================================================================
// Utility Endpoints
// ============================================================================

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
    const partnerSessions = Object.values(sessionEndpointTypes).filter((t) => t === 'partner').length;
    const managerSessions = Object.values(sessionEndpointTypes).filter((t) => t === 'manager').length;

    res.json({
        status: 'healthy',
        server: 'fd-mcp-server',
        version: '1.0.0',
        protocol: 'MCP',
        protocolVersion: '2025-06-18',
        sessions: {
            total: Object.keys(transports).length,
            partner: partnerSessions,
            manager: managerSessions,
        },
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
            partner: {
                path: '/mcp/partner',
                description: 'Partner API MCP endpoint (API key auth)',
                methods: ['POST', 'GET', 'DELETE'],
            },
            manager: {
                path: '/mcp/manager',
                description: 'Manager API MCP endpoint (Bearer token auth)',
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
            delete sessionAuthMethods[sessionId];
            delete sessionEndpointTypes[sessionId];
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
║    /mcp/partner  - Partner API (API key auth)             ║
║    /mcp/manager  - Manager API (Bearer token auth)        ║
║    /health       - Health check                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
