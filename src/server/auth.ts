/**
 * Authentication module for MCP Server
 *
 * Supports API key authentication (X-API-Key header) for Claude Desktop and other API clients.
 * API keys are exchanged for Partner API tokens via the fd-backend token exchange endpoint.
 */

import type { Request } from 'express';

const FD_BACKEND_API_URL = process.env.FD_BACKEND_API_URL || 'https://api.dev.firstdollar.com';

export interface AuthResult {
    /** The API token to use for GraphQL queries */
    token: string;
    /** The partner code */
    partnerCode: string;
}

export interface AuthError {
    code: number;
    message: string;
}

/**
 * Extract API key from X-API-Key header
 */
function extractApiKey(req: Request): string | null {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
        return null;
    }
    return apiKey;
}

// Cache for API key to token mappings (with expiration)
interface CachedToken {
    token: string;
    partnerCode: string;
    expiresAt: number;
}

const tokenCache: Map<string, CachedToken> = new Map();

// Token cache TTL: 55 minutes (Firebase tokens expire in 1 hour)
const TOKEN_CACHE_TTL_MS = 55 * 60 * 1000;

/**
 * Exchange an API key for a Partner API token
 *
 * The API key should be a pre-generated token that the fd-backend can validate
 * and exchange for a Partner API user's Firebase token.
 */
async function exchangeApiKeyForToken(
    apiKey: string,
): Promise<{ token: string; partnerCode: string } | null> {
    // Check cache first
    const cached = tokenCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
        console.log('[Auth] Using cached token for API key');
        return { token: cached.token, partnerCode: cached.partnerCode };
    }

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
            console.error(`[Auth] API key exchange failed: ${response.status}`);
            return null;
        }

        const data = (await response.json()) as { idToken: string; partnerCode: string };

        if (!data.idToken || !data.partnerCode) {
            console.error('[Auth] Invalid response from API key exchange');
            return null;
        }

        // Cache the token
        tokenCache.set(apiKey, {
            token: data.idToken,
            partnerCode: data.partnerCode,
            expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
        });

        console.log(`[Auth] API key exchanged for token (partner: ${data.partnerCode})`);
        return { token: data.idToken, partnerCode: data.partnerCode };
    } catch (error) {
        console.error('[Auth] API key exchange error:', error);
        return null;
    }
}

/**
 * Authenticate a request using API key
 *
 * @param req - Express request object
 * @returns AuthResult on success, AuthError on failure
 */
export async function authenticateRequest(req: Request): Promise<AuthResult | AuthError> {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
        return {
            code: -32000,
            message: 'Unauthorized: X-API-Key header required',
        };
    }

    const result = await exchangeApiKeyForToken(apiKey);
    if (result) {
        return {
            token: result.token,
            partnerCode: result.partnerCode,
        };
    }

    return {
        code: -32000,
        message: 'Invalid API key',
    };
}

/**
 * Check if the result is an authentication error
 */
export function isAuthError(result: AuthResult | AuthError): result is AuthError {
    return 'code' in result && 'message' in result && !('token' in result);
}

/**
 * Clear the token cache (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
    tokenCache.clear();
}

/**
 * Get the size of the token cache (useful for monitoring)
 */
export function getTokenCacheSize(): number {
    return tokenCache.size;
}
