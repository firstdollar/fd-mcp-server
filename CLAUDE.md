# MCP Server - CLAUDE.md

This repository contains the First Dollar MCP Server - exposing Partner APIs to both human users (via web UI) and AI assistants (via MCP protocol).

## Overview

The MCP Server has two components:

1. **Next.js Web UI** (port 3000) - Dashboard for humans
2. **Express MCP Server** (port 3001) - Streamable HTTP MCP endpoint for AI agents

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   MCP Server Application                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐ │
│  │    Next.js (port 3000)   │    │   Express MCP (port 3001)   │ │
│  ├─────────────────────────┤    ├─────────────────────────────┤ │
│  │  Web UI                  │    │  MCP Endpoint               │ │
│  │  - Dashboard             │    │  - POST /mcp (JSON-RPC)     │ │
│  │  - Chat                  │    │  - GET /mcp (SSE streaming) │ │
│  │  - /api/tools/execute    │    │  - DELETE /mcp (session)    │ │
│  │  - /api/mcp (legacy)     │    │  - GET /health              │ │
│  └───────────┬─────────────┘    └──────────────┬──────────────┘ │
│              │                                  │                │
│              └──────────────┬───────────────────┘                │
│                             │                                    │
│                             ▼                                    │
│                    Partner GraphQL API                           │
│                    (api.*.firstdollar.com/graphql)               │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page (login)
│   ├── layout.tsx          # Root layout with auth provider
│   ├── globals.css         # Tailwind styles
│   ├── dashboard/          # Dashboard pages
│   │   ├── layout.tsx      # Sidebar navigation
│   │   ├── page.tsx        # Tool execution UI
│   │   └── chat/
│   │       └── page.tsx    # Chat interface for natural language tool usage
│   └── api/                # API routes
│       ├── tools/execute/route.ts  # Execute tools via Partner API
│       └── chat/route.ts           # Chat with Claude + tool execution
├── server/                 # Express MCP Server (for AI agents)
│   ├── index.ts            # HTTP server entry point
│   ├── stdio.ts            # Stdio transport for Claude Desktop
│   ├── auth.ts             # API key authentication
│   └── tools.ts            # Tool registration
├── components/             # React components
│   └── ui/                 # shadcn/ui components
└── lib/                    # Shared utilities
    ├── utils.ts            # cn() helper
    ├── firebase.ts         # Firebase initialization
    ├── auth-context.tsx    # Auth provider and hooks
    ├── api-client.ts       # API client for tool execution
    ├── claude-client.ts    # Anthropic SDK client for chat
    └── tools/
        ├── definitions.ts  # Manager API tool schemas (web UI)
        └── partner-definitions.ts  # Partner API tool schemas (MCP server)
```

## Commands

```bash
# Development
npm run dev           # Start Next.js web UI on port 3000
npm run dev:mcp       # Start Express MCP server on port 3001 (with watch)
npm run compile       # TypeScript type check

# Production Build
npm run build         # Build both Next.js and MCP server
npm run build:mcp     # Build only the MCP server

# Production Run
npm run start         # Start Next.js production server
npm run start:mcp     # Start Express MCP server (production)

# Linting
npm run lint          # Run ESLint
```

## MCP Server (Express)

The Express-based MCP server implements the **Streamable HTTP** transport per the MCP specification (2025-06-18).

### Features

- **Streamable HTTP Transport** - Modern MCP protocol with optional SSE
- **Session Management** - `Mcp-Session-Id` header for stateful connections
- **DNS Rebinding Protection** - Built-in host header validation
- **Bearer Token Auth** - Firebase ID token authentication

### Endpoints

| Method | Path      | Description                                                |
| ------ | --------- | ---------------------------------------------------------- |
| POST   | `/mcp`    | JSON-RPC 2.0 messages (initialize, tools/list, tools/call) |
| GET    | `/mcp`    | SSE stream for server-to-client notifications              |
| DELETE | `/mcp`    | Terminate session                                          |
| GET    | `/health` | Health check                                               |
| GET    | `/`       | Server info                                                |

### Environment Variables

```bash
# MCP Server
MCP_PORT=3001                                    # MCP server port
MCP_HOST=0.0.0.0                                 # Bind address
PARTNER_API_URL=https://api.dev.firstdollar.com  # Partner API for OAuth auth and GraphQL

# Web UI
ANTHROPIC_API_KEY=sk-...                         # Required for chat feature
MANAGER_API_URL=https://manager.api.dev.firstdollar.com  # Manager API for tools
```

## MCP Client Configuration

### For Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "fd-partner-api": {
      "url": "http://localhost:3001/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_FIREBASE_TOKEN"
      }
    }
  }
}
```

### For Production

```json
{
  "mcpServers": {
    "fd-partner-api": {
      "url": "https://mcp.firstdollar.com/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer YOUR_FIREBASE_TOKEN"
      }
    }
  }
}
```

## Adding New Tools

1. Add tool definition to `src/lib/tools/definitions.ts`:

```typescript
export const newTool: ToolDefinition = {
  name: 'new_tool_name',
  description: 'What this tool does',
  category: 'Category Name',
  inputSchema: z.object({
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional().describe('Optional param'),
  }),
  graphqlQuery: `
    query NewQuery($param1: String!, $param2: Int) {
      someQuery(param1: $param1, param2: $param2) {
        field1
        field2
      }
    }
  `,
  resultPath: 'someQuery',
};
```

2. Add to the `tools` array in the same file.
3. The tool is automatically registered with both the web UI and MCP server.

## Authentication

### Web UI (Next.js)

- Firebase Authentication with Google SSO
- Restricted to @firstdollar.com domain
- Token stored in browser and passed to API routes

### MCP Server (Express)

- Bearer token authentication via `Authorization` header
- Token validated per-session on initialization
- Same Firebase ID tokens used for Partner API

## Deployment

### Development

```bash
# Web UI only (calls Partner API directly)
npm run dev          # Web UI on :3000

# MCP Server for AI agents (optional, separate process)
npm run dev:mcp      # MCP server on :3001
```

### Production (Cloud Run)

Deployments happen automatically via GitHub Actions when you push to `main`. Both the MCP server and Web UI deploy in parallel to Cloud Run.

See `.github/workflows/deploy.yml` for the deployment configuration.

**Manual deployment** (if needed):
```bash
./deploy.sh first-dollar-hackathon      # MCP server
./deploy-web.sh first-dollar-hackathon  # Web UI
```

## Related Documentation

- [MCP Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http)
