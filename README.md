# First Dollar MCP Server

Exposes First Dollar Partner APIs to AI agents via the Model Context Protocol (MCP).

## Components

1. **MCP Server** (Express, port 3001) - Streamable HTTP endpoint for AI agents (Claude Desktop)
2. **Web UI** (Next.js, port 3000) - Dashboard with chat interface for humans

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file and add your Anthropic API key
cp .env.example .env.local

# Development
npm run dev          # Web UI on :3000
npm run dev:mcp      # MCP server on :3001

# Production build
npm run build
npm run start:mcp    # MCP server
npm run start        # Web UI
```

## Deployment (Cloud Run)

Deployments happen automatically via GitHub Actions when you push to `main`. Both the MCP server and Web UI deploy in parallel to Cloud Run.

**Manual deployment** (if needed):
```bash
# Deploy MCP server
./deploy.sh first-dollar-hackathon

# Deploy Web UI
./deploy-web.sh first-dollar-hackathon
```

## MCP Client Configuration (Claude Desktop)

The MCP server uses API key authentication via the standard Partner API OAuth2 `client_credentials` flow. Use your Partner API credentials in the format `clientId:clientSecret`.

**Claude Desktop Configuration** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "fd-partner-api": {
      "url": "https://mcp.dev.firstdollar.com/mcp/partner",
      "transport": "streamable-http",
      "headers": {
        "X-API-Key": "partner_YOURPARTNER_api@partner.firstdollar.com:your-client-secret"
      }
    }
  }
}
```

**Environment-specific URLs:**
- Development: `https://mcp.dev.firstdollar.com/mcp/partner`
- Staging: `https://mcp.staging.firstdollar.com/mcp/partner`
- Production: `https://mcp.firstdollar.com/mcp/partner`

## Web UI Chat

The web UI chat interface authenticates users via Firebase and makes requests to the Manager API. Users see data based on their actual permissions (org admin, partner admin, etc.).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | **Required** for web UI chat | - |
| `PARTNER_API_URL` | Partner API for OAuth auth and GraphQL queries | `https://api.dev.firstdollar.com` |
| `MANAGER_API_URL` | Manager GraphQL API (web UI chat) | `https://manager.dev.firstdollar.com` |
| `MCP_PORT` | MCP server port | `3001` |
| `MCP_HOST` | MCP server bind address | `0.0.0.0` |

## Available Tools

- `list_organizations` - List organizations
- `get_organization` - Get organization details
- `list_individuals` - List individuals
- `get_individual` - Get individual details
- `create_individual` - Create a new individual
- `update_individual` - Update an individual
- `list_benefits_programs` - List benefits programs
- `enroll_individual_in_benefit` - Enroll an individual in a benefit
- And more...

See `src/lib/tools/definitions.ts` for the complete list.

## TODO - Potential Enhancements

<!-- Add enhancement ideas here -->
- [ ]
