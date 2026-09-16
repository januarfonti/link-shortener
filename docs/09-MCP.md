# 09 - MCP Server for AI Agents

Connect an AI agent to your link shortener so it can create and manage short links for you.

---

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) is a standard way for AI agents to call tools. This project exposes an MCP server at `/mcp`, so any MCP client (Claude, Hermes Agent, and others) can shorten links on request.

| Property | Value |
|----------|-------|
| Endpoint | `https://go.yourdomain.com/mcp` |
| Transport | Streamable HTTP (stateless, JSON responses) |
| Auth | `Authorization: Bearer <token>` |
| Methods | `POST` only (`GET`/`DELETE` return `405`) |

---

## 1. Before You Start

Make sure `/api` is protected by Cloudflare Access (see [06-ZERO-TRUST.md](./06-ZERO-TRUST.md)). The token management API lives under `/api/tokens`; if it is public, anyone can create a token.

If you are upgrading an existing install, add the new table:

```bash
npm run db:init:remote
```

> Existing links with the slug `mcp` are no longer reachable, because `/mcp` is now the MCP endpoint. `mcp` is a reserved slug from now on.

---

## 2. Create a Token

1. Open `https://go.yourdomain.com/admin`
2. Scroll to **API Tokens**
3. Enter a name that identifies the agent, e.g. `hermes`
4. Click **Create Token**
5. Copy the token (starts with `lsk_`)

**The token is shown only once.** If you lose it, revoke it and create a new one.

---

## 3. Connect Your Agent

### Hermes Agent

Hermes reads MCP servers from `~/.hermes/config.yaml`.

1. Add the token to `~/.hermes/.env`:

```bash
LINK_SHORTENER_TOKEN=lsk_your_token
```

2. Add the server to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  link_shortener:
    url: "https://go.yourdomain.com/mcp"
    headers:
      Authorization: "Bearer ${LINK_SHORTENER_TOKEN}"
```

3. Restart Hermes (or edit the config from inside a running session; Hermes reloads MCP connections).
4. Send your bot a message: `shorten https://example.com`

See the [Hermes MCP config reference](https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference/) for more options.

### Claude Code

```bash
claude mcp add --transport http link-shortener https://go.yourdomain.com/mcp \
  --header "Authorization: Bearer lsk_your_token"
```

### Other MCP Clients

Use a "remote HTTP" or "Streamable HTTP" server entry with:

```
URL:     https://go.yourdomain.com/mcp
Header:  Authorization: Bearer lsk_your_token
```

The client must send `Accept: application/json, text/event-stream`. Standard MCP clients do this automatically.

---

## 4. Tools

### `create_short_link`

| Input | Required | Description |
|-------|----------|-------------|
| `url` | Yes | Destination URL (`http://` or `https://`) |
| `slug` | No | Custom slug, 3-50 letters, numbers, or hyphens |

Returns `short_url`, `slug`, `destination_url`, `created_at`.

### `list_links`

| Input | Required | Description |
|-------|----------|-------------|
| `limit` | No | 1-100, default 20 |
| `search` | No | Text to match in the slug or destination |

Returns `links`, newest first.

### `get_link_stats`

| Input | Required | Description |
|-------|----------|-------------|
| `slug` | Yes | Slug of the link |

Returns `click_count`, `top_referrers` (top 5, `direct` when there was no referrer), and `recent_clicks` (last 20).

### `update_link`

| Input | Required | Description |
|-------|----------|-------------|
| `slug` | Yes | Current slug |
| `new_destination_url` | One of these | New destination |
| `new_slug` | One of these | New slug |

Marked `destructiveHint`: clients that honor it ask before running.

### `delete_link`

| Input | Required | Description |
|-------|----------|-------------|
| `slug` | Yes | Slug to delete |
| `confirm_slug` | Yes | Must exactly match `slug` |

Deletes the link and its click history. Marked `destructiveHint`.

### Errors

Business errors come back as tool results with `isError: true` and a plain message the agent can act on, for example:

- `Slug "promo" is already taken. Try another slug or omit it to auto-generate.`
- `No link with slug "abc".`
- `Invalid URL. Must start with http:// or https://.`

---

## 5. Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

1. Transport: **Streamable HTTP**
2. URL: `https://go.yourdomain.com/mcp` (or `http://localhost:8788/mcp` with `npm run dev:wrangler`)
3. Add header `Authorization: Bearer lsk_your_token`
4. Click **Connect**, then **List Tools**

---

## 6. Revoking Access

1. Open **API Tokens** in the admin dashboard
2. Click **Revoke** next to the token

The agent gets `401 Unauthorized` on its next request. Revoked tokens stay in the list so you can see when they were last used.

---

## 7. Optional: Rate Limiting

Cloudflare's free plan includes one WAF rate-limiting rule.

1. Cloudflare Dashboard → your domain → **Security** → **WAF** → **Rate limiting rules**
2. **Create rule**
3. If incoming requests match: **URI Path** equals `/mcp`
4. Rate: e.g. `60` requests per `1 minute` per IP
5. Action: **Block**
6. **Deploy**

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | Missing, wrong, or revoked token | Check the `Authorization: Bearer lsk_...` header; create a new token if needed |
| `406 Not Acceptable` | Client does not send `Accept: application/json, text/event-stream` | Use a standard MCP client, or add the header |
| `405 Method Not Allowed` | Client tried `GET` (SSE) or `DELETE` | Configure the client for Streamable HTTP; this server is stateless |
| Redirected to a Cloudflare login page | `/mcp` is behind Access | Remove `/mcp` from the Access application; only `admin` and `api` should be protected |
| `no such table: api_tokens` | Schema not updated | Run `npm run db:init:remote` |

---

## Checklist

- [ ] `/admin` and `/api` protected by Access
- [ ] `api_tokens` table created
- [ ] Token created in the admin dashboard
- [ ] Agent configured with URL and `Authorization` header
- [ ] Test message creates a short link
