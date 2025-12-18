# First Dollar MCP Server - Codebase Overview

This document provides a comprehensive overview of the First Dollar MCP Server codebase, which exposes Partner APIs to both human users (via web UI) and AI assistants (via MCP protocol).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [Configuration](#configuration)
4. [Deployment Infrastructure](#deployment-infrastructure)
5. [Web UI (Next.js)](#web-ui-nextjs)
6. [MCP Server (Express)](#mcp-server-express)
7. [Tool Definitions](#tool-definitions)
8. [Authentication](#authentication)
9. [Data Flow](#data-flow)

---

## Architecture Overview

The MCP Server consists of two independent components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MCP Server Application                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐      ┌─────────────────────────────────┐   │
│  │   Next.js Web UI (port 3000) │      │   Express MCP Server (port 3001) │   │
│  ├─────────────────────────────┤      ├─────────────────────────────────┤   │
│  │  Dashboard                   │      │  Streamable HTTP Transport       │   │
│  │  - Tool Execution UI         │      │  - POST /mcp/partner (JSON-RPC)  │   │
│  │  - Chat Interface (Claude)   │      │  - GET /mcp/partner (SSE)        │   │
│  │                              │      │  - DELETE /mcp/partner (session) │   │
│  │  API Routes                  │      │                                   │   │
│  │  - /api/tools/execute        │      │  Stdio Transport                  │   │
│  │  - /api/chat                 │      │  - For Claude Desktop             │   │
│  └───────────────┬─────────────┘      └──────────────┬──────────────────┘   │
│                  │                                    │                      │
│                  ▼                                    ▼                      │
│           Manager GraphQL API                  Partner GraphQL API           │
│     (manager.api.*.firstdollar.com)         (api.*.firstdollar.com)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Web UI**: Human-facing dashboard with Firebase authentication, tool execution, and AI-powered chat.

**MCP Server**: AI agent-facing endpoint implementing the Model Context Protocol with API key authentication.

---

## Directory Structure

```
fd-mcp-server/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions CI/CD
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Landing/login page (MFA support)
│   │   ├── layout.tsx          # Root layout with AuthProvider
│   │   ├── globals.css         # Tailwind CSS + design tokens
│   │   ├── dashboard/
│   │   │   ├── page.tsx        # Tool execution UI
│   │   │   ├── layout.tsx      # Sidebar navigation + AdminProvider
│   │   │   └── chat/
│   │   │       └── page.tsx    # AI chat interface
│   │   └── api/
│   │       ├── chat/route.ts   # Claude-powered chat endpoint
│   │       └── tools/execute/route.ts  # Direct tool execution
│   ├── server/                 # Express MCP Server
│   │   ├── index.ts            # Streamable HTTP transport
│   │   ├── stdio.ts            # Stdio transport for Claude Desktop
│   │   ├── auth.ts             # API key → OAuth token exchange
│   │   └── tools.ts            # Tool registration + GraphQL execution
│   ├── components/
│   │   └── ui/                 # shadcn/ui components
│   │       ├── button.tsx      # Button with variants
│   │       ├── card.tsx        # Card composition components
│   │       ├── input.tsx       # Form input
│   │       ├── select.tsx      # Select dropdown (Radix UI)
│   │       └── textarea.tsx    # Multiline text input
│   └── lib/
│       ├── utils.ts            # cn() class merge utility
│       ├── firebase.ts         # Firebase app initialization
│       ├── auth-context.tsx    # Auth context + MFA support
│       ├── admin-context.tsx   # Admin role context
│       ├── api-client.ts       # HTTP client for tool execution
│       ├── claude-client.ts    # Anthropic SDK wrapper
│       └── tools/
│           ├── definitions.ts  # Manager API tools (Web UI)
│           └── partner-definitions.ts  # Partner API tools (MCP)
├── Dockerfile                  # MCP server container
├── Dockerfile.web              # Web UI container
├── deploy.sh                   # Manual MCP deployment script
├── deploy-web.sh               # Manual web deployment script
├── cloudbuild.yaml             # Cloud Build for MCP
├── cloudbuild-web.yaml         # Cloud Build for web
├── package.json                # Dependencies + scripts
├── tsconfig.json               # TypeScript config (Next.js)
├── tsconfig.server.json        # TypeScript config (Express)
└── tailwind.config.ts          # Tailwind + design system
```

---

## Configuration

### package.json

| Category | Details |
|----------|---------|
| **Name** | @fd-backend/mcp-server |
| **Node Version** | 22 (required) |
| **Module Type** | ES Module |

**Key Scripts:**
```bash
npm run dev           # Next.js on port 3000
npm run dev:mcp       # Express MCP on port 3001 (watch mode)
npm run build         # Build both applications
npm run start         # Production Next.js
npm run start:mcp     # Production MCP server
```

**Core Dependencies:**
- `@modelcontextprotocol/sdk` (1.24.2) - MCP protocol implementation
- `@anthropic-ai/sdk` (0.39.0) - Claude AI integration
- `next` (15.5.7) + `react` (19.2.1) - Web framework
- `express` (4.21.2) - MCP HTTP server
- `firebase` (11.8.1) - Authentication
- `zod` (3.25.67) - Schema validation
- Radix UI components - Accessible primitives
- `tailwindcss` (3.4.17) + `class-variance-authority` - Styling

### TypeScript Configuration

**tsconfig.json** (Web UI):
- Target: ES2017
- Module: esnext with bundler resolution
- Strict mode enabled
- Path alias: `@/*` → `./src/*`

**tsconfig.server.json** (MCP Server):
- Target: ES2022 (Node 22 native)
- Module: NodeNext
- Output: `./dist/`
- Includes only server code + tool definitions

### Tailwind Configuration

- Dark mode: Class-based (`.dark`)
- Color system: HSL CSS variables
- Design tokens: primary, secondary, destructive, muted, accent
- Border radius: CSS variable-based scaling

---

## Deployment Infrastructure

### Container Architecture

**MCP Server (Dockerfile):**
```dockerfile
# Multi-stage build
FROM node:22-alpine AS builder  # Build TypeScript
FROM node:22-alpine AS runner   # Production runtime

# Non-root user: mcpserver (uid 1001)
# Port: 8080
# Health check: GET /health (30s interval)
# Entry: node dist/server/index.js
```

**Web UI (Dockerfile.web):**
```dockerfile
# Multi-stage build
FROM node:22-alpine AS builder  # Build Next.js
FROM node:22-alpine AS runner   # Standalone server

# Non-root user: nextjs (uid 1001)
# Port: 3000
# Entry: node server.js (Next.js standalone)
```

### Deployment Methods

**1. GitHub Actions (Primary)** - `.github/workflows/deploy.yml`
- Triggers on push to `main` branch
- Two parallel jobs: `deploy-mcp` and `deploy-web`
- Workload Identity Federation for GCP auth (no stored credentials)
- Builds Docker images tagged with commit SHA
- Deploys to Cloud Run in `us-central1`

**2. Manual Scripts:**
```bash
./deploy.sh [project-id]      # MCP server
./deploy-web.sh [project-id]  # Web UI
```

### Cloud Run Configuration

| Setting | MCP Server | Web UI |
|---------|-----------|--------|
| **Service Name** | fd-mcp-server | fd-mcp-web |
| **Memory** | 512Mi | 512Mi |
| **CPU** | 1 | 1 |
| **Min Instances** | 0 | 0 |
| **Max Instances** | 10 | 10 |
| **Port** | 8080 | 3000 |
| **Auth** | Unauthenticated | Unauthenticated |

### Required Secrets (GitHub Actions)

| Secret | Purpose |
|--------|---------|
| `WIF_PROVIDER` | Workload Identity Federation provider |
| `WIF_SERVICE_ACCOUNT` | GCP service account email |
| `PARTNER_API_URL` | Partner API endpoint (MCP) |
| `ANTHROPIC_API_KEY` | Claude API key (Web UI) |
| `MANAGER_API_URL` | Manager API endpoint (Web UI) |

---

## Web UI (Next.js)

### Page Structure

**Landing Page** (`/`) - `src/app/page.tsx`
- Email/password authentication form
- Sign-in/sign-up toggle
- MFA support (SMS and TOTP authenticator)
- Redirects to `/dashboard` on successful auth

**Dashboard Layout** (`/dashboard`) - `src/app/dashboard/layout.tsx`
- Protected route (requires authentication)
- Fixed sidebar with navigation (Dashboard, Chat)
- Admin context display (Partner/Org admin type)
- User profile with sign-out

**Tool Execution** (`/dashboard`) - `src/app/dashboard/page.tsx`
- Tools organized by category in left panel
- Dynamic form generation from Zod schemas
- Role-based tool filtering (PARTNER vs ORG admins)
- Auto-fills organization code for org-scoped tools
- JSON result display with success/error states

**Chat Interface** (`/dashboard/chat`) - `src/app/dashboard/chat/page.tsx`
- Natural language interface for API operations
- Claude-powered tool selection
- Markdown rendering with GFM support
- Message history with timestamps
- Tool usage indicators

### API Routes

**Chat Endpoint** (`/api/chat`) - `src/app/api/chat/route.ts`
```
POST /api/chat
Authorization: Bearer <firebase_token>
{ "message": "List all members in ACME" }

Response:
{
  "response": "formatted markdown response",
  "toolUsed": "list_organization_members",
  "reasoning": "explanation",
  "confidence": 0.95
}
```

Flow:
1. Authenticate request
2. Fetch admin context (non-blocking)
3. Claude selects appropriate tool
4. Execute tool via Manager API GraphQL
5. Claude formats response

**Tool Execute Endpoint** (`/api/tools/execute`) - `src/app/api/tools/execute/route.ts`
```
POST /api/tools/execute
Authorization: Bearer <firebase_token>
{ "toolName": "list_users", "args": { "organizationCodes": ["ACME"] } }

Response:
{ "success": true, "data": { ... } }
```

Flow:
1. Authenticate request
2. Look up tool definition
3. Transform arguments for GraphQL
4. Execute against Manager API
5. Extract result using resultPath

### Shared Libraries

**auth-context.tsx** - Authentication Provider
- Firebase auth state management
- Sign in/up/out methods
- MFA support (phone, TOTP)
- ID token retrieval for API calls

**admin-context.tsx** - Admin Role Provider
- Fetches admin details on auth
- Provides `isPartnerAdmin` / `isOrgAdmin` helpers
- Organization code for org admins

**api-client.ts** - HTTP Client
- `executeTool()` - Calls `/api/tools/execute`
- `graphql()` - Direct GraphQL queries

**claude-client.ts** - Anthropic Integration
- `selectToolWithClaude()` - AI tool selection with fallback
- `generateResponseWithClaude()` - Format tool results

### UI Components (shadcn/ui)

| Component | Features |
|-----------|----------|
| **Button** | 6 variants (default, destructive, outline, secondary, ghost, link), 4 sizes |
| **Card** | Composable (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter) |
| **Input** | Standard text input with file upload styling |
| **Select** | Radix-based dropdown with search, groups, portal rendering |
| **Textarea** | Multiline input with min-height |

All components use:
- `class-variance-authority` for variants
- `cn()` utility for class merging
- Forward refs for DOM access
- Consistent focus ring styling

---

## MCP Server (Express)

### Transport: Streamable HTTP

**Endpoint:** `/mcp/partner`

| Method | Purpose |
|--------|---------|
| POST | JSON-RPC 2.0 messages (initialize, tools/list, tools/call) |
| GET | SSE streaming for server notifications |
| DELETE | Terminate session |

**Session Management:**
- Sessions created on `initialize` request
- UUID-based session IDs
- `mcp-session-id` header for subsequent requests
- In-memory storage (Map of sessionId → transport)
- Graceful shutdown closes all sessions

**Security:**
- DNS rebinding protection via host header validation
- Allowed hosts: localhost, 127.0.0.1, mcp.*.firstdollar.com
- Disabled in Cloud Run (platform handles security)

### Transport: Stdio

**File:** `src/server/stdio.ts`

For Claude Desktop subprocess spawning:
```bash
FD_API_KEY=clientId:clientSecret npm run start:stdio
```

Flow:
1. Read API key from environment
2. Buffer stdin (Claude sends initialize immediately)
3. Exchange API key for OAuth token
4. Connect StdioServerTransport
5. Replay buffered messages

### Authentication (`src/server/auth.ts`)

**API Key Format:** `clientId:clientSecret`

**Token Exchange:**
1. Extract API key from `X-API-Key` header
2. Check in-memory cache (55-minute TTL)
3. If miss: POST to `/v0/auth/token` (OAuth2 client_credentials)
4. Cache token and return

**Functions:**
- `authenticateRequest(req)` → `AuthResult | AuthError`
- `isAuthError(result)` - Type guard
- `clearTokenCache()` / `getTokenCacheSize()` - Cache management

### Tool Execution (`src/server/tools.ts`)

**GraphQL Execution:**
```typescript
executeGraphQL(token, query, variables)
// POST to PARTNER_API_URL/graphql with Bearer token
```

**Argument Transformation:**
- Query tools: Build `where` clauses, pagination
- Mutation tools: Nested input structures
- Dollar amounts converted to cents (×100)

**Result Extraction:**
- Uses `resultPath` (dot notation)
- Navigates response structure to extract data

**Tool Handler:**
```typescript
createToolHandler(tool, tokenOrGetter)
// Returns async (args) => MCP response
// Supports lazy token evaluation
```

---

## Tool Definitions

### Manager API Tools (Web UI)

15 tools across 6 categories:

**Organizations (3):**
- `list_organizations` - List all partner organizations (PARTNER only)
- `get_organization` - Get org by short code (org-scoped)
- `list_organization_members` - List org members with filters

**Users (3):**
- `list_users` - List users with multiple filters
- `get_user_details` - Get user by UID
- `bulk_create_individuals` - Create multiple members

**Benefits (4):**
- `list_benefits_programs` - Programs for an org
- `list_offering_templates` - Available templates (PARTNER only)
- `create_or_return_root_benefits_program` - Create/get root program
- `create_benefits_offering` - Create offering in program

**Enrollments (2):**
- `bulk_enroll_in_offerings` - Enroll individuals
- `unenroll_participant_from_offerings` - Remove from offerings

**Claims (1):**
- `list_claims` - List claims with filters

**Partner/Admin (2):**
- `get_current_partner` - Partner context (PARTNER only)
- `get_current_administrator` - Current admin details

### Partner API Tools (MCP Server)

13 tools across 5 categories:

**System (1):**
- `ping` - Health check

**Organizations (3):**
- `list_organizations` - List with ID filter
- `get_organization` - Get by ID
- `create_organization` - Create new org

**Individuals (4):**
- `list_individuals` - List with multiple filters
- `create_individual` - Create in org
- `update_individual` - Update existing
- `verify_individual` - Initiate KYC

**Benefits (4):**
- `list_benefits_programs` - List by org
- `list_benefit_templates` - Available templates
- `create_benefits_program` - Create program
- `create_benefit` - Create benefit in program

**Enrollments (1):**
- `enroll_individual_in_benefit` - Enroll individual

### Key Differences

| Aspect | Manager API (Web UI) | Partner API (MCP) |
|--------|---------------------|-------------------|
| **Auth** | Firebase ID token | API key → OAuth |
| **Role Filtering** | PARTNER vs ORG admin | None (token-based) |
| **Bulk Operations** | Yes | No |
| **Claims** | Yes | No |
| **KYC Verification** | No | Yes |

---

## Authentication

### Web UI (Firebase)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Browser    │───▶│   Firebase   │───▶│  Next.js API │
│              │    │   Auth       │    │   Routes     │
│  - Sign in   │◀───│  - ID Token  │    │  - Bearer    │
│  - MFA       │    │  - User info │    │    Token     │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │  Manager API │
                                        │  (GraphQL)   │
                                        └──────────────┘
```

- Firebase project: `first-dollar-app-dev`
- Google SSO + email/password
- MFA: SMS (PhoneAuthProvider) and TOTP (TotpMultiFactorGenerator)
- Domain restriction: @firstdollar.com

### MCP Server (API Key)

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  MCP Client  │───▶│  Express MCP │───▶│  Partner API │
│  (Claude)    │    │   Server     │    │  (GraphQL)   │
│              │    │              │    │              │
│  X-API-Key   │───▶│  OAuth2      │───▶│  Bearer      │
│  header      │    │  Exchange    │    │  Token       │
└──────────────┘    └──────────────┘    └──────────────┘
```

- API key format: `partner_PARTNERCODE_clientId:clientSecret`
- OAuth2 client_credentials flow
- Token cached for 55 minutes
- Partner code extracted from client ID

---

## Data Flow

### Chat Interface Flow

```
User Message
     │
     ▼
┌─────────────────┐
│ POST /api/chat  │
└────────┬────────┘
         │
         ├──▶ Get Firebase ID Token
         │
         ├──▶ Fetch Admin Context (Manager API)
         │    └── Determines PARTNER vs ORG role
         │
         ├──▶ Claude: Select Tool
         │    └── Returns { tool, params, reasoning, confidence }
         │
         ├──▶ Transform Arguments
         │    └── Flat args → nested GraphQL input
         │
         ├──▶ Execute Tool (Manager API GraphQL)
         │
         └──▶ Claude: Generate Response
              └── Returns markdown-formatted response
```

### MCP Server Flow

```
MCP Client Request
     │
     ▼
┌─────────────────────┐
│ POST /mcp/partner   │
└────────┬────────────┘
         │
         ├──▶ Extract X-API-Key header
         │
         ├──▶ Check Token Cache
         │    └── Hit: Use cached token
         │    └── Miss: OAuth2 exchange
         │
         ├──▶ Session Management
         │    └── Create or reuse transport
         │
         ├──▶ MCP Message Processing
         │    └── initialize / tools/list / tools/call
         │
         └──▶ Tool Execution (if tools/call)
              ├── Transform arguments
              ├── GraphQL query to Partner API
              └── Extract and return result
```

---

## Environment Variables

### Web UI (Next.js)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | No | (dev key) | Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | No | first-dollar-app-dev.firebaseapp.com | Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No | first-dollar-app-dev | Project ID |
| `MANAGER_API_URL` | No | https://manager.api.dev.firstdollar.com | Manager API |
| `ANTHROPIC_API_KEY` | Yes | - | Claude API key |

### MCP Server (Express)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_PORT` | No | 3001 | Server port |
| `MCP_HOST` | No | 0.0.0.0 | Bind address |
| `PARTNER_API_URL` | No | https://api.dev.firstdollar.com | Partner API |
| `FD_API_KEY` | Stdio only | - | API key for stdio transport |

---

## Quick Reference

### Development
```bash
npm run dev           # Web UI on :3000
npm run dev:mcp       # MCP server on :3001
```

### Production
```bash
npm run build && npm run start      # Web UI
npm run build && npm run start:mcp  # MCP server
```

### MCP Client Configuration
```json
{
  "mcpServers": {
    "fd-partner-api": {
      "url": "http://localhost:3001/mcp/partner",
      "transport": "streamable-http",
      "headers": {
        "X-API-Key": "partner_CODE_clientId:clientSecret"
      }
    }
  }
}
```

### Health Check
```bash
curl http://localhost:3001/health
# {"status":"ok","activeSessions":0,"cachedApiKeys":0}
```

---

*Generated: December 2024*
