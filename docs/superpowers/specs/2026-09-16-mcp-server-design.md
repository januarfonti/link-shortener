# MCP Server + API Token Management — Design

Date: 2026-09-16
Status: Approved in brainstorming, pending spec review

## Goal

Let an AI agent (Hermes Agent, used via a Telegram gateway) create and manage short links by calling an MCP server hosted inside this site. Tokens for the agent are created, listed, and revoked from the admin dashboard.

## Decisions

| Topic | Decision |
|---|---|
| Host | `/mcp` route inside the existing Cloudflare Pages Functions, direct D1 access |
| Protocol implementation | Official `@modelcontextprotocol/sdk` (1.30.x), `WebStandardStreamableHTTPServerTransport`, stateless, JSON responses |
| Client auth | `Authorization: Bearer <token>`, tokens stored hashed in D1 |
| Token management | Admin UI section in `/admin` (create, list, revoke) |
| Tools | `create_short_link`, `list_links`, `get_link_stats`, `update_link`, `delete_link` |
| Link identifier in tools | Slug (not numeric id) |
| Duplicate URLs | `create_short_link` always creates a new link |
| `/api/*` protection | Added to the Cloudflare Access application (config + docs, no code) |
| Access JWT verification in code | Not included; relies on Access configuration |

Out of scope: OAuth, rate limiting in code, SSE/streaming sessions, per-token permission scopes.

## Architecture

```
Hermes ──POST /mcp  Authorization: Bearer lsk_…
   │
functions/_middleware.ts   (CORS, unchanged)
   │
functions/mcp.ts ── verifyToken() → 401 on missing/invalid/revoked
   │                 waitUntil(update last_used_at)
   │                 new McpServer + stateless transport per request
   ▼
lib/mcp-tools.ts → lib/links.ts → D1 (links, clicks)

Admin browser (/admin, behind Access) ── /api/tokens ── lib/tokens.ts → D1 (api_tokens)
```

`functions/mcp.ts` is a specific route, so Pages routes `/mcp` to it before the catch-all `functions/[[slug]].ts`.

## Components

### `lib/links.ts` (new)

Shared link logic extracted from `functions/api/links/index.ts` and `[id].ts`.

- `RESERVED_SLUGS`: existing list plus `mcp`.
- `isValidUrl(url)`, `isValidSlug(slug)`, `generateSlug(length = 6)`: moved verbatim.
- `createLink(db, { destination_url, slug? })` → `Link`
- `listLinks(db, { limit, search? })` → `Link[]`, newest first. `search` matches substring in `slug` or `destination_url` (SQL `LIKE`, bound parameter, `%` and `_` escaped).
- `getLinkBySlug(db, slug)` → `Link`
- `getLinkById(db, id)` → `Link` (used by REST)
- `getLinkStats(db, slug)` → `Link` + `top_referrers` (top 5 `{ referrer, count }`, null referrer reported as `"direct"`) + `recent_clicks` (last 20 `{ clicked_at, referrer }`)
- `updateLink(db, id, { destination_url?, slug? })` → `Link`
- `deleteLink(db, id)` → `void`
- Errors: `class LinkError extends Error { code: 'invalid_url' | 'invalid_slug' | 'slug_taken' | 'not_found' | 'slug_generation_failed' }`

REST handlers in `functions/api/links/` call these functions and map `LinkError` codes to the existing status codes and messages (400, 400, 409, 404, 500). REST responses keep today's status codes, error messages, and `{ success, data | error }` shape.

`update_link` and `delete_link` MCP tools resolve slug → id via `getLinkBySlug`, then call the id-based functions.

### `lib/tokens.ts` (new)

- Token format: `lsk_` + 32 cryptographically random bytes encoded base62 (`crypto.getRandomValues`).
- `hashToken(raw)`: SHA-256 hex via `crypto.subtle.digest`.
- `createToken(db, name)` → `{ token: string, record: ApiTokenPublic }`. Raw token is returned only here.
- `listTokens(db)` → `ApiTokenPublic[]` (`id, name, prefix, created_at, last_used_at, revoked_at`); never includes `token_hash`.
- `revokeToken(db, id)` → sets `revoked_at = CURRENT_TIMESTAMP`; throws `TokenError('not_found')` if missing or already revoked.
- `verifyToken(db, raw)` → `ApiTokenPublic | null`; null for unknown or revoked.
- `touchToken(db, id)` → sets `last_used_at = CURRENT_TIMESTAMP`.
- Name validation: trimmed, 1–50 chars, else `TokenError('invalid_name')`.
- `prefix`: first 8 characters of the raw token (e.g. `lsk_a1B2`).

### Database (`db/schema.sql`, appended)

```sql
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  prefix TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  revoked_at DATETIME
);
```

Lookup is by `token_hash`, which is covered by the UNIQUE index. Re-running `npm run db:init:remote` is safe because every statement uses `IF NOT EXISTS`.

### `lib/mcp-tools.ts` (new)

`registerTools(server: McpServer, deps: { db: D1Database, origin: string })`. `short_url` is `${origin}/${slug}`, where `origin` is `new URL(request.url).origin`.

| Tool | Input (zod) | Output | Annotations |
|---|---|---|---|
| `create_short_link` | `url: string` (http/https), `slug?: string` | `{ short_url, slug, destination_url, created_at }` | — |
| `list_links` | `limit?: int 1–100 (default 20)`, `search?: string` | `{ links: [{ short_url, slug, destination_url, click_count, created_at }] }` | `readOnlyHint: true` |
| `get_link_stats` | `slug: string` | `{ short_url, slug, destination_url, click_count, created_at, top_referrers, recent_clicks }` | `readOnlyHint: true` |
| `update_link` | `slug: string`, `new_destination_url?: string`, `new_slug?: string` (at least one required) | updated link with `short_url` | `destructiveHint: true` |
| `delete_link` | `slug: string`, `confirm_slug: string` (must equal `slug`) | `{ deleted: slug }` | `destructiveHint: true` |

Each tool returns both `structuredContent` and a `text` content block containing the same JSON.

Tool error messages (returned as `isError: true` results):

| Condition | Message |
|---|---|
| `invalid_url` | `Invalid URL. Must start with http:// or https://.` |
| `invalid_slug` | `Invalid slug. Use 3-50 letters, numbers, or hyphens, and not a reserved word.` |
| `slug_taken` | `Slug "<slug>" is already taken. Try another slug or omit it to auto-generate.` |
| `not_found` | `No link with slug "<slug>".` |
| `update_link` with no changes | `Provide new_destination_url or new_slug.` |
| `confirm_slug` mismatch | `confirm_slug must exactly match slug. Nothing was deleted.` |
| Unexpected error | `Internal error.` (details only in `console.error`) |

### `functions/mcp.ts` (new)

- `onRequestPost`:
  1. Read `Authorization`. Missing, not `Bearer`, or `verifyToken` returns null → `401` JSON `{ error: 'Unauthorized' }` with `WWW-Authenticate: Bearer`. Same body for every failure case.
  2. `context.waitUntil(touchToken(db, token.id))`.
  3. Create `McpServer({ name: 'link-shortener', version })`, call `registerTools`, create `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`, connect, return `transport.handleRequest(request)`.
- `onRequestGet`, `onRequestDelete` → `405` with `Allow: POST`.
- Uncaught exceptions → `console.error` + `500` generic body. The raw token is never logged.

### `functions/api/tokens/index.ts` and `[id].ts` (new)

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/tokens` | `{ success: true, data: ApiTokenPublic[] }` |
| `POST` | `/api/tokens` | Body `{ name }` → `201 { success: true, data: { token, record } }`; invalid name → `400` |
| `DELETE` | `/api/tokens/:id` | Revoke → `{ success: true }`; missing or already revoked → `404` |

### Frontend (new + modified)

- `src/types/index.ts`: add `ApiToken` type.
- `src/composables/useTokens.ts`: `tokens`, `loading`, `error`, `fetchTokens`, `createToken(name)` (returns raw token), `revokeToken(id)`. Follows `useLinks.ts` patterns.
- `src/components/TokenManager.vue`:
  - Create form (name input + button).
  - One-time dialog showing the full token with a copy button and the warning "You won't see this token again."
  - Table: name, prefix, created, last used ("Never" if null), status (Active / Revoked).
  - Revoke button on active rows with a confirm step.
- `src/views/AdminDashboard.vue`: add an "API Tokens" section rendering `TokenManager`.
- Styling matches existing Tailwind components.

### Docs

- `docs/06-ZERO-TRUST.md`: add `/api/*` to the Access application alongside `/admin`, with a verification step (private window → `/api/links` redirects to Access login). Add a note that this must be done before deploying the token endpoints.
- New `docs/09-MCP.md` (linked from `docs/README.md`): MCP endpoint URL, creating a token, Hermes MCP config example (keys verified against Hermes docs during implementation), tool reference, optional WAF rate-limit rule on `/mcp`.
- `README.md` (the repo is open source, so this is the entry point for self-hosters):
  - Features: add "MCP server for AI agents" and "API token management".
  - Tech Stack: add MCP SDK.
  - Quick Start: note that re-running `npm run db:init:remote` adds the `api_tokens` table for existing installs.
  - New "MCP Server" section: what it does, endpoint URL, create a token in `/admin`, generic client config (URL + `Authorization: Bearer` header), tool list table, link to `docs/09-MCP.md`.
  - API Endpoints: add `/api/tokens` rows and `POST /mcp`.
  - "Protecting the Admin Dashboard" becomes "Securing Your Deployment": Access must cover both `/admin` and `/api/*`, with a warning that without it anyone can manage links and mint tokens.
  - Project Structure: add `lib/`, and `npm test` under Local Development.

## Security

- Raw tokens are never stored or logged. Only the SHA-256 hash and an 8-character prefix are kept.
- SHA-256 without a slow KDF is acceptable because tokens carry 256 bits of randomness.
- All 401 responses are identical regardless of the failure reason.
- `_middleware.ts` CORS stays unchanged. `Authorization` is not in `Access-Control-Allow-Headers`, so browsers on other origins cannot call `/mcp` with credentials.
- Token management endpoints rely on Cloudflare Access for `/api/*`. **Deployment order:** configure Access for `/api/*` before deploying this change.
- No in-code rate limiting. The docs describe an optional Cloudflare WAF rate-limit rule.

## Testing

Tooling: `vitest` + `@cloudflare/vitest-pool-workers`, running in `workerd` with a local D1 binding. `db/schema.sql` is applied before each test file. Script: `npm test`. Implementation is test-first.

| File | Covers |
|---|---|
| `lib/links.test.ts` | URL/slug validation, reserved `mcp`, CRUD, stats aggregation, `slug_taken` / `not_found` |
| `lib/tokens.test.ts` | create → verify succeeds; wrong token fails; revoked token fails; `token_hash` ≠ raw token; name validation |
| `functions/mcp.test.ts` | 401 (missing / wrong / revoked); 405 on GET; `tools/list` returns 5 tools; create → stats → update → delete via `tools/call`; `confirm_slug` mismatch refused; `isError` results; `last_used_at` updated |
| `functions/api/links.test.ts` | REST status codes and response shapes unchanged after the refactor |
| `functions/api/tokens.test.ts` | create returns token once; list omits hashes; revoke; double revoke → 404 |

Manual checks:

1. `npm run dev:wrangler` + MCP Inspector against `http://localhost:8788/mcp` with a locally created token; call each tool.
2. After configuring Access and deploying: private window → `/api/links` redirects to Access login.
3. Configure Hermes with the URL and `Authorization` header; send "shorten https://example.com" via Telegram.

## Estimate

About 1 working day: roughly half a day for the shared lib, MCP endpoint and tests; half a day for the token UI and docs.
