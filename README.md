# Link Shortener

A self-hosted URL shortener built with Vue 3, Cloudflare Pages, and D1. Free hosting forever on Cloudflare's free tier.

## Features

- Custom and auto-generated short slugs
- Click tracking with referrer analytics
- Admin dashboard for managing links
- **MCP server** so AI agents (Claude, Hermes, and other MCP clients) can create and manage links
- **API token management** in the admin dashboard (create, list, revoke)
- Edge-powered redirects (300+ locations worldwide, <50ms)
- Protected admin and API via Cloudflare Access (Zero Trust)
- SQLite database on Cloudflare D1

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Tailwind CSS v4
- **Backend:** Cloudflare Pages Functions
- **Database:** Cloudflare D1 (SQLite at the edge)
- **Auth:** Cloudflare Access (Zero Trust) for the dashboard and API, bearer tokens for MCP
- **AI integration:** [Model Context Protocol](https://modelcontextprotocol.io) TypeScript SDK
- **Hosting:** Cloudflare Pages

## Quick Start

> Requires Node.js 22 or later.

```bash
# Install dependencies
npm install

# Copy config template
cp wrangler.toml.example wrangler.toml

# Login to Cloudflare
npx wrangler login

# Create the D1 database
npx wrangler d1 create link-shortener-db

# Update wrangler.toml with the database_id from the previous step

# Initialize the database schema
npm run db:init:remote

# Deploy
npm run deploy
```

> **Upgrading an existing install?** Follow these steps in order:
>
> 1. Add `api` to your Cloudflare Access application, alongside `admin` (see [docs/06-ZERO-TRUST.md](docs/06-ZERO-TRUST.md)). Confirm it worked: in a private window, `/api/links` should redirect to the Access login page, not return JSON.
> 2. Run `npm run db:init:remote`. Every statement uses `IF NOT EXISTS`, so it only adds the new `api_tokens` table and leaves your links untouched.
> 3. Deploy.
>
> After enabling Access, open **API Tokens** in `/admin` and revoke any token you don't recognize.
>
> A link with the slug `mcp` stops working after upgrading, because `/mcp` is now the MCP endpoint.

## Local Development

```bash
# Initialize local database
npm run db:init

# Start dev server with Wrangler (includes D1 binding)
npm run dev:wrangler

# Run tests (runs inside the Workers runtime with a local D1)
npm test

# Type-check Pages Functions and shared server code
npm run typecheck:worker
```

## Project Structure

```
link-shortener/
├── src/                    # Vue 3 frontend (admin dashboard)
├── functions/              # Cloudflare Pages Functions
│   ├── api/links/          # CRUD API for links
│   ├── api/tokens/         # API token management
│   ├── mcp.ts              # MCP endpoint for AI agents
│   └── [[slug]].ts         # Catch-all redirect handler
├── lib/                    # Server code shared by the API and MCP
├── test/                   # Vitest tests (Workers runtime)
├── db/                     # Database schema
├── docs/                   # Documentation
├── public/                 # Static assets
├── wrangler.toml.example   # Wrangler config template
└── package.json
```

## Configuration

### `wrangler.toml`

Copy `wrangler.toml.example` and fill in your D1 database ID:

```toml
name = "link-shortener"
compatibility_date = "2024-12-01"
pages_build_output_dir = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "link-shortener-db"
database_id = "YOUR_DATABASE_ID"
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ROOT_REDIRECT_URL` | URL to redirect when visiting the root path (`/`) | Serves the SPA |

Set environment variables via the Cloudflare dashboard or `wrangler pages secret put`.

## MCP Server

The site exposes an [MCP](https://modelcontextprotocol.io) endpoint so AI agents can shorten links for you, for example "shorten https://example.com/very/long/url" in a chat.

**Endpoint:** `https://go.yourdomain.com/mcp` (Streamable HTTP, stateless)

### 1. Create a token

1. Open `https://go.yourdomain.com/admin`
2. In **API Tokens**, enter a name (e.g. `hermes`) and click **Create Token**
3. Copy the token (starts with `lsk_`). It is shown only once.

### 2. Connect your agent

Any MCP client that supports remote HTTP servers with custom headers works. Send the token as a bearer token:

```
URL:     https://go.yourdomain.com/mcp
Header:  Authorization: Bearer lsk_your_token
```

Claude Code:

```bash
claude mcp add --transport http link-shortener https://go.yourdomain.com/mcp \
  --header "Authorization: Bearer lsk_your_token"
```

More clients (including Hermes Agent) in [docs/09-MCP.md](docs/09-MCP.md).

### Tools

| Tool | What it does |
|------|--------------|
| `create_short_link` | Shorten a URL, with an optional custom slug |
| `list_links` | List recent links, optionally filtered by text |
| `get_link_stats` | Click count, top referrers, and recent clicks for a slug |
| `update_link` | Change a link's destination or slug |
| `delete_link` | Delete a link (requires repeating the slug in `confirm_slug`) |

Revoke a token from the admin dashboard at any time; the agent loses access immediately.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/links` | Access | List all links |
| `POST` | `/api/links` | Access | Create a new link |
| `GET` | `/api/links/:id` | Access | Get link details with click analytics |
| `PUT` | `/api/links/:id` | Access | Update a link |
| `DELETE` | `/api/links/:id` | Access | Delete a link |
| `GET` | `/api/tokens` | Access | List API tokens (hashes are never returned) |
| `POST` | `/api/tokens` | Access | Create a token; the raw token is returned once |
| `DELETE` | `/api/tokens/:id` | Access | Revoke a token |
| `POST` | `/mcp` | Bearer token | MCP endpoint for AI agents |

### Create Link

```json
POST /api/links
{
  "destination_url": "https://example.com",
  "slug": "my-link"          // optional, auto-generated if omitted
}
```

## Securing Your Deployment

> ⚠️ **Protect both `/admin` and `/api` with Cloudflare Access.** Without it, anyone who finds your domain can create, edit, and delete links, and mint API tokens that grant the same access over MCP.

Access for `/api` must be configured **before you deploy this version**. Otherwise, anyone can mint an API token while `/api` is briefly public, and that token keeps working even after you enable Access.

- Add **both** `admin` and `api` paths to your Cloudflare Access application. See [docs/06-ZERO-TRUST.md](docs/06-ZERO-TRUST.md).
- Do **not** put `/mcp` behind Access. It is protected by bearer tokens.
- Tokens are stored as SHA-256 hashes. Only the first 8 characters are kept for display.
- Optional: add a Cloudflare WAF rate-limiting rule for `/mcp` (see [docs/09-MCP.md](docs/09-MCP.md)).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request. Run `npm test` and `npm run typecheck:worker` before opening a PR.

## License

[MIT](LICENSE)
