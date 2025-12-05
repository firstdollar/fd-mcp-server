/**
 * First Dollar MCP Server - Stdio Transport
 *
 * Stdio-based MCP server for Claude Desktop and other MCP clients
 * that spawn the server as a subprocess.
 *
 * Usage:
 *   node dist/server/stdio.js
 *
 * Environment variables:
 *   FD_API_KEY - Partner API key (required)
 *   FD_BACKEND_API_URL - Backend API URL for token exchange (optional)
 *   PARTNER_API_URL - Partner API URL for GraphQL queries (optional)
 *
 * Note: This file avoids dotenv to prevent stdout pollution that breaks MCP protocol.
 * All configuration must be passed via environment variables from Claude Desktop.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const FD_BACKEND_API_URL = process.env.FD_BACKEND_API_URL || 'https://api.dev.firstdollar.com';

interface TokenExchangeResponse {
    idToken: string;
    partnerCode: string;
    expiresIn: number;
}

/**
 * Exchange an API key for a Partner API token
 */
async function exchangeApiKeyForToken(apiKey: string): Promise<TokenExchangeResponse | null> {
    try {
        const response = await fetch(`${FD_BACKEND_API_URL}/mcp/api-key-exchange`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            console.error(`[Stdio] API key exchange failed: ${response.status}`);
            return null;
        }

        const data = (await response.json()) as TokenExchangeResponse;

        if (!data.idToken || !data.partnerCode) {
            console.error('[Stdio] Invalid response from API key exchange');
            return null;
        }

        console.error(`[Stdio] Authenticated as partner: ${data.partnerCode}`);
        return data;
    } catch (error) {
        console.error('[Stdio] API key exchange error:', error);
        return null;
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    console.error(`[Stdio] Starting First Dollar MCP Server (Node ${process.version})`);

    const apiKey = process.env.FD_API_KEY;
    if (!apiKey) {
        console.error('[Stdio] Error: FD_API_KEY environment variable is required');
        process.exit(1);
    }

    // Buffer stdin data that arrives during authentication
    // Claude Desktop sends 'initialize' immediately after spawning
    const stdinBuffer: Buffer[] = [];
    const bufferData = (chunk: Buffer) => stdinBuffer.push(chunk);
    process.stdin.on('data', bufferData);

    // Authenticate before connecting transport
    const tokenResult = await exchangeApiKeyForToken(apiKey);
    if (!tokenResult) {
        console.error('[Stdio] Error: Failed to authenticate with API key');
        process.exit(1);
    }

    // Create MCP server and register tools
    const server = new McpServer({
        name: 'fd-mcp-server',
        version: '1.0.0',
    });
    registerTools(server, tokenResult.idToken);

    // Stop buffering and connect transport
    process.stdin.off('data', bufferData);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Replay any buffered stdin data
    if (stdinBuffer.length > 0) {
        console.error(`[Stdio] Replaying ${stdinBuffer.length} buffered message(s)`);
        const transportAny = transport as unknown as { _ondata: (chunk: Buffer) => void };
        for (const chunk of stdinBuffer) {
            transportAny._ondata(chunk);
        }
    }

    console.error('[Stdio] First Dollar MCP Server ready');
}

main().catch((error) => {
    console.error('[Stdio] Fatal error:', error);
    process.exit(1);
});
