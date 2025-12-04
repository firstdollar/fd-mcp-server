/**
 * Authentication module for MCP Server
 *
 * Supports two authentication methods:
 * 1. Bearer token (Firebase ID token) - for Manager API (web UI users)
 * 2. API key (X-API-Key header) - for Partner API (Claude Desktop and API clients)
 *
 * API keys are exchanged for Partner API tokens via the fd-backend token exchange endpoint.
 * Bearer tokens are passed directly to the Manager API.
 */

import type { Request } from 'express';

const FD_BACKEND_API_URL = process.env.FD_BACKEND_API_URL || 'https://api.dev.firstdollar.com';

export interface AuthResult {
    /** The API token to use for GraphQL queries */
    token: string;
    /** The authentication method used */
    method: 'bearer' | 'api-key';
    /** The partner code (only available for API key auth) */
    partnerCode?: string;
}

export interface AuthError {
    code: number;
    message: string;
}

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
 * Authenticate a request using API key (for Partner API / Claude Desktop)
 *
 * @param req - Express request object
 * @returns AuthResult on success, AuthError on failure
 */
export async function authenticateApiKeyRequest(
    req: Request,
): Promise<AuthResult | AuthError> {
    const apiKey = extractApiKey(req);
    if (!apiKey) {
        return {
            code: -32000,
            message: 'Unauthorized: X-API-Key header required for Partner API',
        };
    }

    const result = await exchangeApiKeyForToken(apiKey);
    if (result) {
        return {
            token: result.token,
            method: 'api-key',
            partnerCode: result.partnerCode,
        };
    }

    return {
        code: -32000,
        message: 'Invalid API key',
    };
}

/**
 * Authenticate a request using Bearer token (for Manager API / web UI)
 *
 * @param req - Express request object
 * @returns AuthResult on success, AuthError on failure
 */
export async function authenticateBearerRequest(
    req: Request,
): Promise<AuthResult | AuthError> {
    const bearerToken = extractBearerToken(req);
    if (!bearerToken) {
        return {
            code: -32000,
            message: 'Unauthorized: Bearer token required for Manager API',
        };
    }

    return {
        token: bearerToken,
        method: 'bearer',
    };
}

/**
 * Authenticate a request using either Bearer token or API key (legacy, for backwards compatibility)
 *
 * @param req - Express request object
 * @returns AuthResult on success, AuthError on failure
 */
export async function authenticateRequest(
    req: Request,
): Promise<AuthResult | AuthError> {
    // Try Bearer token first (for web UI users)
    const bearerToken = extractBearerToken(req);
    if (bearerToken) {
        return {
            token: bearerToken,
            method: 'bearer',
        };
    }

    // Try API key (for Claude Desktop and other API clients)
    const apiKey = extractApiKey(req);
    if (apiKey) {
        const result = await exchangeApiKeyForToken(apiKey);
        if (result) {
            return {
                token: result.token,
                method: 'api-key',
                partnerCode: result.partnerCode,
            };
        }
        return {
            code: -32000,
            message: 'Invalid API key',
        };
    }

    // No authentication provided
    return {
        code: -32000,
        message: 'Unauthorized: Bearer token or X-API-Key required',
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
