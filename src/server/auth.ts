/**
 * Authentication module for MCP Server
 *
 * Supports API key authentication (X-API-Key header) for Claude Desktop and other API clients.
 * API keys are exchanged for Partner API tokens via the standard OAuth2 client_credentials flow.
 */

import type { Request } from 'express';

const PARTNER_API_URL = process.env.PARTNER_API_URL || 'https://api.dev.firstdollar.com';
const OAUTH_TOKEN_PATH = '/v0/auth/token';

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
 * OAuth2 token response from the Partner API
 */
interface OAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
}

/**
 * Exchange an API key for a Partner API token using OAuth2 client_credentials flow
 *
 * The API key should be in the format "clientId:clientSecret" which maps to
 * the Partner API OAuth credentials.
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

    // Parse API key (format: clientId:clientSecret)
    const colonIndex = apiKey.indexOf(':');
    if (colonIndex === -1) {
        console.error('[Auth] Invalid API key format. Expected: clientId:clientSecret');
        return null;
    }

    const clientId = apiKey.substring(0, colonIndex);
    const clientSecret = apiKey.substring(colonIndex + 1);

    if (!clientId || !clientSecret) {
        console.error('[Auth] Invalid API key: missing clientId or clientSecret');
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
            console.error(`[Auth] OAuth token request failed: ${response.status} - ${errorText}`);
            return null;
        }

        const data = (await response.json()) as OAuthTokenResponse;

        if (!data.access_token) {
            console.error('[Auth] Invalid OAuth response: missing access_token');
            return null;
        }

        // Calculate cache expiration (use expires_in from response, default to 55 min)
        const expiresInMs = (data.expires_in || 3300) * 1000;
        // Cache for slightly less than expiration to avoid edge cases
        const cacheExpiresAt = Date.now() + Math.min(expiresInMs - 60000, TOKEN_CACHE_TTL_MS);

        // Cache the token
        tokenCache.set(apiKey, {
            token: data.access_token,
            partnerCode,
            expiresAt: cacheExpiresAt,
        });

        console.log(`[Auth] OAuth token obtained (partner: ${partnerCode})`);
        return { token: data.access_token, partnerCode };
    } catch (error) {
        console.error('[Auth] OAuth token request error:', error);
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
