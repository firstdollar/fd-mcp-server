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

## Recipes

### Adding a New Tool

This codebase has **two separate tool systems** that serve different purposes:

| System | File | API | Auth | Consumer |
|--------|------|-----|------|----------|
| **Manager API Tools** | `src/lib/tools/definitions.ts` | Manager GraphQL API | Firebase ID token | Web UI dashboard |
| **Partner API Tools** | `src/lib/tools/partner-definitions.ts` | Partner GraphQL API | API key → OAuth | MCP server (AI agents) |

Choose the right system based on your use case:
- **Manager API Tools**: For internal administrators using the web dashboard
- **Partner API Tools**: For external API integrations via MCP protocol

---

#### Recipe: Add a Manager API Tool (Web UI)

**File:** `src/lib/tools/definitions.ts`

**Step 1:** Define the tool object with the `ToolDefinition` interface:

```typescript
export const myNewTool: ToolDefinition = {
    name: 'my_new_tool',                    // Snake_case, unique identifier
    description: 'What this tool does',     // Shown in UI and to Claude
    category: 'Category Name',              // Groups tools in sidebar
    inputSchema: z.object({                 // Zod schema for parameters
        requiredParam: z.string().describe('Description for UI/AI'),
        optionalParam: z.number().optional().describe('Optional parameter'),
    }),
    graphqlQuery: `
    query MyQuery($input: MyQueryInput!) {
      myQuery(input: $input) {
        field1
        field2
      }
    }
  `,
    resultPath: 'myQuery',                  // Dot notation path to extract result

    // Optional fields:
    allowedAdminTypes: ['PARTNER'],         // Restrict to PARTNER or ORGANIZATION admins
    orgScoped: true,                        // Auto-fill organizationCode for org admins
};
```

**Step 2:** Add to the `tools` array at the bottom of the file:

```typescript
export const tools: ToolDefinition[] = [
    // ... existing tools ...
    myNewTool,  // Add your tool here
];
```

**Step 3:** Done. The tool automatically appears in:
- Web UI dashboard (filtered by admin type)
- Chat interface (Claude can select it)

**Manager Tool Fields Reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique snake_case identifier |
| `description` | Yes | Human-readable description |
| `category` | Yes | UI grouping (Organizations, Users, Benefits, etc.) |
| `inputSchema` | Yes | Zod object schema defining parameters |
| `graphqlQuery` | Yes | GraphQL query/mutation string |
| `resultPath` | Yes | Dot notation path to extract from response |
| `allowedAdminTypes` | No | `['PARTNER']`, `['ORGANIZATION']`, or omit for both |
| `orgScoped` | No | If `true`, auto-fills `organizationCode` for org admins |

---

#### Recipe: Add a Partner API Tool (MCP Server)

**File:** `src/lib/tools/partner-definitions.ts`

**Step 1:** Define the tool object with the `PartnerToolDefinition` interface:

```typescript
export const myPartnerTool: PartnerToolDefinition = {
    name: 'my_partner_tool',                // Snake_case, unique identifier
    description: 'What this tool does',     // Exposed to MCP clients
    category: 'Category Name',              // Organizational grouping
    inputSchema: z.object({                 // Zod schema for parameters
        requiredParam: z.string().describe('Parameter description'),
        optionalParam: z.number().optional().describe('Optional parameter'),
    }),
    graphqlQuery: `
    query MyQuery($where: MyFilterInput, $first: Int, $after: String) {
      myQuery(where: $where, first: $first, after: $after) {
        ... on MyResults {
          nodes {
            id
            name
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
        ... on BadRequestError {
          code
          message
        }
      }
    }
  `,
    resultPath: 'myQuery',                  // Path to extract from response
};
```

**Step 2:** Add to the `partnerTools` array at the bottom of the file:

```typescript
export const partnerTools: PartnerToolDefinition[] = [
    // ... existing tools ...
    myPartnerTool,  // Add your tool here
];
```

**Step 3:** Done. The tool automatically:
- Registers with the MCP server on startup
- Appears in `tools/list` responses
- Can be called via `tools/call`

**Partner Tool Fields Reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique snake_case identifier |
| `description` | Yes | Shown to MCP clients |
| `category` | Yes | Organizational grouping |
| `inputSchema` | Yes | Zod object schema defining parameters |
| `graphqlQuery` | Yes | GraphQL query/mutation string |
| `resultPath` | Yes | Dot notation path to extract from response |

---

#### Key Differences Between Manager and Partner Tools

| Aspect | Manager API Tools | Partner API Tools |
|--------|-------------------|-------------------|
| **Interface** | `ToolDefinition` | `PartnerToolDefinition` |
| **Extra fields** | `allowedAdminTypes`, `orgScoped` | None |
| **GraphQL input** | Usually `$input: XxxInput!` | Often `$where: XxxFilterInput` |
| **Error handling** | Varies | Union types with `BadRequestError` |
| **Pagination** | `first`, `after` in input | `$first`, `$after` as separate params |
| **ID field names** | `organizationCode`, `uid` | `id` (ULIDs) |

---

#### GraphQL Query Patterns

**Manager API Query (input object pattern):**
```graphql
query ListUsers($input: FilteredPartnerUsersInput!) {
  filteredPartnerUsers(input: $input) {
    pageInfo { hasNextPage endCursor }
    userResults {
      node { uid name }
    }
  }
}
```

**Partner API Query (separate params pattern):**
```graphql
query GetIndividuals($where: IndividualsFilterInput, $after: String, $first: Int) {
  individuals(where: $where, after: $after, first: $first) {
    ... on IndividualsResults {
      nodes { id name }
      pageInfo { hasNextPage endCursor }
    }
    ... on BadRequestError { code message }
  }
}
```

**Mutation pattern (both APIs):**
```graphql
mutation CreateThing($input: CreateThingInput!) {
  createThing(input: $input) {
    ... on CreateThingResult {
      thing { id name }
    }
    ... on BadRequestError { code message }
  }
}
```

---

#### Argument Transformation

The tool execution layer (`src/server/tools.ts` for MCP, `src/app/api/tools/execute/route.ts` for web) transforms flat Zod schema parameters into nested GraphQL input structures:

**Flat parameters (Zod schema):**
```typescript
inputSchema: z.object({
    firstName: z.string(),
    lastName: z.string(),
    city: z.string(),
})
```

**Transformed to nested GraphQL input:**
```json
{
  "input": {
    "name": { "firstName": "John", "lastName": "Doe" },
    "address": { "city": "Austin" }
  }
}
```

Review existing tools for transformation patterns. For Partner API tools, the transformation logic is in `src/server/tools.ts`.

---

#### Testing Your Tool

**Manager API Tool:**
1. Start the web UI: `npm run dev`
2. Sign in at `http://localhost:3000`
3. Navigate to Dashboard
4. Find your tool in the category sidebar
5. Fill in parameters and execute

**Partner API Tool:**
1. Start the MCP server: `npm run dev:mcp`
2. Test with curl:
```bash
# List tools
curl -X POST http://localhost:3001/mcp/partner \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Call your tool
curl -X POST http://localhost:3001/mcp/partner \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -H "mcp-session-id: your_session_id" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"my_partner_tool","arguments":{"requiredParam":"value"}}}'
```

## Related Documentation

- [MCP Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http)
