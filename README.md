# First Dollar MCP Server

Exposes First Dollar Partner APIs to AI agents via the Model Context Protocol (MCP).

## Components

1. **MCP Server** (Express, port 8080) - Streamable HTTP endpoint for AI agents
2. **Web UI** (Next.js, port 3000) - Dashboard for humans to execute tools and chat

## Quick Start

```bash
# Install dependencies
npm install

# Development
npm run dev          # Web UI on :3000
npm run dev:mcp      # MCP server on :3001

# Production build
npm run build
npm run start:mcp    # MCP server
npm run start        # Web UI
```

## Deployment (Cloud Run)

```bash
# Deploy MCP server
./deploy.sh first-dollar-hackathon

# Deploy Web UI
./deploy-web.sh first-dollar-hackathon
```

## MCP Client Configuration

The MCP server supports two authentication methods.

> **Note:** The MCP server and token exchange endpoints are currently only available in development and staging environments. Production access is not yet enabled.

### Option 1: API Key Authentication (Recommended for Claude Desktop)

Use your Partner API credentials (clientId:clientSecret) as an API key. This is the recommended approach for headless clients like Claude Desktop that don't support browser-based OAuth flows.

**Claude Desktop Configuration** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "fd-partner-api": {
      "url": "https://mcp.dev.firstdollar.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "X-API-Key": "your-client-id@partner.firstdollar.com:your-client-secret"
      }
    }
  }
}
```

**Environment-specific URLs:**
- Development: `https://mcp.dev.firstdollar.com/mcp`
- Staging: `https://mcp.staging.firstdollar.com/mcp`
- Production: Not yet available

### Option 2: Bearer Token Authentication (For Web UI)

If you have a Firebase ID token (e.g., from the web UI authentication flow), you can use it directly:

```json
{
  "mcpServers": {
    "fd-partner-api": {
      "url": "https://mcp.firstdollar.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_FIREBASE_ID_TOKEN"
      }
    }
  }
}
```

Note: Firebase tokens expire after 1 hour. For long-running sessions, use API key authentication.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PARTNER_API_URL` | Partner GraphQL API endpoint | `https://api.dev.firstdollar.com` |
| `FD_BACKEND_API_URL` | Backend API for token exchange | `https://api.dev.firstdollar.com` |
| `MCP_PORT` | MCP server port | `3001` (dev) / `8080` (prod) |
| `MCP_HOST` | MCP server bind address | `0.0.0.0` |
| `ANTHROPIC_API_KEY` | For chat functionality | - |

## Available Tools

- `search_organizations` - Search for organizations
- `get_organization` - Get organization details
- `list_benefit_offerings` - List benefit offerings for an organization
- `search_users` - Search for users
- `get_user` - Get user details
- `get_user_benefits` - Get user's benefits
- And more...

See `src/lib/tools/definitions.ts` for the complete list.
