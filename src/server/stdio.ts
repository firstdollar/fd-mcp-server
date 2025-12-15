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
 *   FD_API_KEY - Partner API key in format "clientId:clientSecret" (required)
 *   PARTNER_API_URL - Partner API URL for OAuth and GraphQL queries (optional)
 *
 * Note: This file avoids dotenv to prevent stdout pollution that breaks MCP protocol.
 * All configuration must be passed via environment variables from Claude Desktop.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const PARTNER_API_URL = process.env.PARTNER_API_URL || 'https://api.dev.firstdollar.com';
const OAUTH_TOKEN_PATH = '/v0/auth/token';

interface OAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
}

interface TokenExchangeResult {
    token: string;
    partnerCode: string;
    expiresIn: number;
}

/**
 * Exchange an API key for a Partner API token using OAuth2 client_credentials flow
 */
async function exchangeApiKeyForToken(apiKey: string): Promise<TokenExchangeResult | null> {
    // Parse API key (format: clientId:clientSecret)
    const colonIndex = apiKey.indexOf(':');
    if (colonIndex === -1) {
        console.error('[Stdio] Invalid API key format. Expected: clientId:clientSecret');
        return null;
    }

    const clientId = apiKey.substring(0, colonIndex);
    const clientSecret = apiKey.substring(colonIndex + 1);

    if (!clientId || !clientSecret) {
        console.error('[Stdio] Invalid API key: missing clientId or clientSecret');
        return null;
    }

    // Extract partner code from clientId (format: partner_PARTNERCODE_...)
    const partnerMatch = clientId.match(/^partner_([^_]+)_/);
    const partnerCode = partnerMatch ? partnerMatch[1] : 'unknown';

    try {
        const response = await fetch(`${PARTNER_API_URL}${OAUTH_TOKEN_PATH}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
            }).toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Stdio] OAuth token request failed: ${response.status} - ${errorText}`);
            return null;
        }

        const data = (await response.json()) as OAuthTokenResponse;

        if (!data.access_token) {
            console.error('[Stdio] Invalid OAuth response: missing access_token');
            return null;
        }

        console.error(`[Stdio] Authenticated as partner: ${partnerCode}`);
        return {
            token: data.access_token,
            partnerCode,
            expiresIn: data.expires_in,
        };
    } catch (error) {
        console.error('[Stdio] OAuth token request error:', error);
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
    registerTools(server, tokenResult.token);

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
