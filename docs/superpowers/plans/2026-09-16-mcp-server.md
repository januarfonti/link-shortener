# MCP Server + API Token Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let AI agents (Hermes via Telegram first) create and manage short links through a token-protected MCP endpoint at `/mcp`, with tokens managed from the admin dashboard.

**Architecture:** Link logic moves from the REST handlers into `lib/links.ts`, which both `functions/api/links/*` and the new MCP tools call. `functions/mcp.ts` checks a bearer token against hashed tokens in D1 (`lib/tokens.ts`), then serves a stateless MCP server built with the official SDK's web-standard transport. Tokens are created, listed, and revoked through `/api/tokens` and a new `TokenManager.vue` section in `/admin`.

**Tech Stack:** Cloudflare Pages Functions, D1, `@modelcontextprotocol/sdk` 1.30 (`WebStandardStreamableHTTPServerTransport`, `CfWorkerJsonSchemaValidator`), zod 4, Vue 3 + Tailwind v4, Vitest 4.1 + `@cloudflare/vitest-plugin` (tests run inside workerd with a real local D1).

**Spec:** `docs/superpowers/specs/2026-09-16-mcp-server-design.md`

## Global Constraints

- Commit messages: plain conventional messages. **Never** add a `Co-Authored-By` trailer or any Claude attribution.
- The repo is open source: user-facing changes must be reflected in `README.md` (Task 8).
- Tests live in `test/`, **never** in `functions/`. Every file under `functions/` becomes a Pages route (e.g. `functions/mcp.test.ts` would be served at `/mcp.test`). This deviates from the spec's example test paths on purpose.
- Shared server code lives in `lib/` at the repo root (outside `functions/` for the same reason).
- `@modelcontextprotocol/sdk` pinned to `^1.30.0`; `zod` `^4.6.5`; `@cfworker/json-schema` `^4.1.1`.
- `vitest` `~4.1.0` (the Cloudflare plugin requires `^4.1.0`, not 5); `@cloudflare/vitest-plugin` `^1.1.10`; `wrangler` `^4.132.0`; `@cloudflare/workers-types` `^5.20260916.1`.
- The McpServer must use `CfWorkerJsonSchemaValidator` (Workers block the code generation that the default ajv validator uses).
- MCP transport: stateless (`sessionIdGenerator: undefined`), `enableJsonResponse: true`, new server + transport per request.
- Tokens: `lsk_` + 43 base62 chars; only the SHA-256 hex hash and the first 8 chars (`prefix`) are stored; the raw token is never logged.
- All `/mcp` auth failures return the identical `401` body `{"error":"Unauthorized"}` with `WWW-Authenticate: Bearer`.
- REST `/api/links` responses keep today's status codes, error messages, and `{ success, data | error }` shape.
- `mcp` is added to `RESERVED_SLUGS`.
- Run all commands from the repo root: `/Users/januarfonti/Developer/Personal/link-shortener`.

## File Map

| File | Responsibility |
|---|---|
| `lib/env.ts` | `Env` bindings type shared by all functions |
| `lib/links.ts` | Link validation + D1 queries, throws `LinkError` |
| `lib/tokens.ts` | Token generation, hashing, CRUD, verification, throws `TokenError` |
| `lib/mcp-tools.ts` | Registers the 5 MCP tools on a `McpServer` |
| `functions/mcp.ts` | `/mcp` route: auth, per-request MCP server |
| `functions/api/links/index.ts`, `[id].ts` | REST link API, now thin wrappers over `lib/links.ts` |
| `functions/api/tokens/index.ts`, `[id].ts` | REST token API |
| `db/schema.sql` | Adds `api_tokens` table |
| `src/types/index.ts` | Adds `ApiToken`, `CreatedApiToken` |
| `src/composables/useTokens.ts` | Token API client state |
| `src/components/TokenManager.vue` | Token list, create form, one-time dialog, revoke |
| `src/views/AdminDashboard.vue` | Renders `TokenManager` |
| `vitest.config.ts`, `tsconfig.worker.json`, `test/*` | Test harness and worker type-checking |
| `README.md`, `docs/06-ZERO-TRUST.md`, `docs/09-MCP.md`, `docs/README.md` | Open-source documentation |

---

### Task 1: Test harness and dependency upgrades

Sets up Vitest running inside workerd with a local D1 that has `db/schema.sql` applied, plus a type-check for server code.

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `vitest.config.ts`, `tsconfig.worker.json`, `lib/env.ts`, `test/env.d.ts`, `test/setup.ts`, `test/helpers.ts`, `test/smoke.test.ts`

**Interfaces:**
- Produces: `Env` (`lib/env.ts`): `{ DB: D1Database; ROOT_REDIRECT_URL?: string }`
- Produces: `makeContext(request: Request, params?: Record<string, string>): { context: EventContext; settle(): Promise<unknown[]> }` — a fake Pages Functions context; `settle()` awaits everything passed to `waitUntil`.
- Produces: `jsonRequest(method: string, path: string, body?: unknown, headers?: Record<string, string>): Request` — builds `https://go.example.com${path}` with a JSON body.
- Produces: `npm test` and `npm run typecheck:worker` scripts. `beforeEach` in `test/setup.ts` empties tables, so every test starts from an empty DB.

- [ ] **Step 1: Confirm you are on the feature branch**

Run: `git status -sb`
Expected: `## feat/mcp-server` with a clean tree. If not on `feat/mcp-server`, run `git checkout feat/mcp-server`.

- [ ] **Step 2: Upgrade wrangler and workers-types**

The new test plugin depends on wrangler 4.132, which expects workers-types v5. Upgrading first avoids a peer-dependency conflict.

Run: `npm install -D wrangler@^4.132.0 @cloudflare/workers-types@^5.20260916.1`
Expected: exits 0.

- [ ] **Step 3: Install test dependencies with npm 12**

npm 11.4.x crashes with `Cannot read properties of null (reading 'edgesOut')` when resolving Vitest's optional peers. npm 12 resolves them, and the lockfile it writes works with npm 11 afterwards.

Run: `npx -y npm@12 install -D vitest@~4.1.0 @cloudflare/vitest-plugin@^1.1.10`
Expected: exits 0 (an `install-scripts` warning is fine).

Then verify the lockfile works with the project's own npm:

Run: `rm -rf node_modules && npm ci`
Expected: exits 0.

- [ ] **Step 4: Add npm scripts**

In `package.json` `"scripts"`, add after `"db:init:remote"`:

```json
    "test": "vitest run",
    "typecheck:worker": "tsc -p tsconfig.worker.json"
```

(Add a comma after the `db:init:remote` line.)

- [ ] **Step 5: Create `lib/env.ts`**

```ts
export interface Env {
  DB: D1Database
  ROOT_REDIRECT_URL?: string
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-plugin'

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2024-12-01',
        d1Databases: ['DB'],
        bindings: { SCHEMA_SQL: readFileSync('db/schema.sql', 'utf8') },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
  },
})
```

- [ ] **Step 7: Create `tsconfig.worker.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  },
  "include": ["functions/**/*.ts", "lib/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 8: Create `test/env.d.ts`**

```ts
declare namespace Cloudflare {
  interface Env {
    DB: D1Database
    SCHEMA_SQL: string
  }
}
```

- [ ] **Step 9: Create `test/setup.ts`**

This version only clears `clicks` and `links`. Task 4 adds `api_tokens`.

```ts
import { env } from 'cloudflare:test'
import { beforeAll, beforeEach } from 'vitest'

beforeAll(async () => {
  const statements = env.SCHEMA_SQL
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)))
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM clicks'),
    env.DB.prepare('DELETE FROM links'),
  ])
})
```

- [ ] **Step 10: Create `test/helpers.ts`**

```ts
import { env } from 'cloudflare:test'
import type { Env } from '../lib/env'

type Context = Parameters<PagesFunction<Env>>[0]

export function makeContext(request: Request, params: Record<string, string> = {}) {
  const pending: Promise<unknown>[] = []
  const context = {
    request,
    env,
    params,
    data: {},
    functionPath: new URL(request.url).pathname,
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise)
    },
    passThroughOnException: () => {},
    next: async () => new Response('next', { status: 404 }),
  } as unknown as Context
  return { context, settle: () => Promise.all(pending) }
}

export function jsonRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://go.example.com${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
```

- [ ] **Step 11: Write the smoke test**

`test/smoke.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('has the schema applied to the test database', async () => {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM links').first<{ count: number }>()
  expect(row?.count).toBe(0)
})
```

- [ ] **Step 12: Run tests and type-check**

Run: `npm test`
Expected: `Test Files  1 passed (1)`, `Tests  1 passed (1)`. "Sourcemap ... points to missing source files" warnings are harmless.

Run: `npm run typecheck:worker`
Expected: no output, exit 0 (the existing `functions/` code type-checks).

Run: `npm run build`
Expected: `✓ built`.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.worker.json lib/env.ts test/
git commit -m "test: add Vitest harness running in workerd with local D1"
```

---

### Task 2: Shared link library

Extracts validation and D1 queries into `lib/links.ts` with typed errors. The REST handlers are not touched yet.

**Files:**
- Create: `lib/links.ts`
- Test: `test/lib/links.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except the test harness.
- Produces (all exported from `lib/links.ts`):
  - `interface Link { id: number; slug: string; destination_url: string; created_at: string; updated_at: string; click_count: number }`
  - `interface Click { id: number; link_id: number; clicked_at: string; referrer: string | null }`
  - `interface ReferrerCount { referrer: string; count: number }`
  - `interface LinkStats extends Link { top_referrers: ReferrerCount[]; recent_clicks: { clicked_at: string; referrer: string | null }[] }`
  - `type LinkErrorCode = 'invalid_url' | 'invalid_slug' | 'slug_taken' | 'not_found' | 'no_changes' | 'slug_generation_failed'` (adds `no_changes` beyond the spec list, needed for the REST "No valid fields to update" case and the MCP "Provide new_destination_url or new_slug." case)
  - `class LinkError extends Error { readonly code: LinkErrorCode }`
  - `RESERVED_SLUGS: string[]`, `isValidUrl(url: string): boolean`, `isValidSlug(slug: string): boolean`, `generateSlug(length?: number): string`
  - `createLink(db: D1Database, input: { destination_url: string; slug?: string }): Promise<Link>`
  - `listLinks(db: D1Database, options?: { limit?: number; search?: string }): Promise<Link[]>` — no `limit` means all rows
  - `getLinkById(db: D1Database, id: number | string): Promise<Link>`
  - `getLinkBySlug(db: D1Database, slug: string): Promise<Link>`
  - `getRecentClicks(db: D1Database, linkId: number | string, limit: number): Promise<Click[]>`
  - `getLinkStats(db: D1Database, slug: string): Promise<LinkStats>`
  - `updateLink(db: D1Database, id: number | string, changes: { destination_url?: string; slug?: string }): Promise<Link>`
  - `deleteLink(db: D1Database, id: number | string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`test/lib/links.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  LinkError,
  createLink,
  deleteLink,
  getLinkBySlug,
  getLinkStats,
  isValidSlug,
  isValidUrl,
  listLinks,
  updateLink,
} from '../../lib/links'

async function expectLinkError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(LinkError)
  expect((error as LinkError).code).toBe(code)
}

async function addClick(linkId: number, referrer: string | null) {
  await env.DB.prepare('INSERT INTO clicks (link_id, referrer) VALUES (?, ?)').bind(linkId, referrer).run()
}

describe('validation', () => {
  it('accepts only http and https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true)
    expect(isValidUrl('http://example.com/a?b=c')).toBe(true)
    expect(isValidUrl('ftp://example.com')).toBe(false)
    expect(isValidUrl('not a url')).toBe(false)
  })

  it('rejects reserved slugs including mcp, in any case', () => {
    expect(isValidSlug('promo-2026')).toBe(true)
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('has space')).toBe(false)
    expect(isValidSlug('mcp')).toBe(false)
    expect(isValidSlug('MCP')).toBe(false)
    expect(isValidSlug('admin')).toBe(false)
  })
})

describe('createLink', () => {
  it('creates a link with a custom slug', async () => {
    const link = await createLink(env.DB, { destination_url: 'https://example.com', slug: ' promo ' })
    expect(link.slug).toBe('promo')
    expect(link.destination_url).toBe('https://example.com')
    expect(link.click_count).toBe(0)
  })

  it('generates a 6-character slug when none is given', async () => {
    const link = await createLink(env.DB, { destination_url: 'https://example.com' })
    expect(link.slug).toMatch(/^[a-zA-Z0-9]{6}$/)
  })

  it('rejects invalid URLs, invalid slugs, and taken slugs', async () => {
    await expectLinkError(createLink(env.DB, { destination_url: 'javascript:alert(1)' }), 'invalid_url')
    await expectLinkError(createLink(env.DB, { destination_url: 'https://example.com', slug: 'mcp' }), 'invalid_slug')
    await createLink(env.DB, { destination_url: 'https://example.com', slug: 'taken' })
    await expectLinkError(createLink(env.DB, { destination_url: 'https://other.com', slug: 'taken' }), 'slug_taken')
  })
})

describe('listLinks', () => {
  it('returns newest first, honours limit, and searches slug and destination', async () => {
    await createLink(env.DB, { destination_url: 'https://alpha.com', slug: 'first' })
    await createLink(env.DB, { destination_url: 'https://beta.com', slug: 'second' })
    await createLink(env.DB, { destination_url: 'https://gamma.com/100%_off', slug: 'third' })

    expect((await listLinks(env.DB)).map((l) => l.slug)).toEqual(['third', 'second', 'first'])
    expect((await listLinks(env.DB, { limit: 2 })).map((l) => l.slug)).toEqual(['third', 'second'])
    expect((await listLinks(env.DB, { search: 'beta' })).map((l) => l.slug)).toEqual(['second'])
    expect((await listLinks(env.DB, { search: 'fir' })).map((l) => l.slug)).toEqual(['first'])
    expect((await listLinks(env.DB, { search: '%_' })).map((l) => l.slug)).toEqual(['third'])
  })
})

describe('getLinkStats', () => {
  it('returns top referrers with direct for null and recent clicks', async () => {
    const link = await createLink(env.DB, { destination_url: 'https://example.com', slug: 'stats' })
    await addClick(link.id, 'https://t.me')
    await addClick(link.id, 'https://t.me')
    await addClick(link.id, null)

    const stats = await getLinkStats(env.DB, 'stats')
    expect(stats.top_referrers).toEqual([
      { referrer: 'https://t.me', count: 2 },
      { referrer: 'direct', count: 1 },
    ])
    expect(stats.recent_clicks).toHaveLength(3)
    expect(stats.recent_clicks[0]).toHaveProperty('clicked_at')
  })

  it('throws not_found for an unknown slug', async () => {
    await expectLinkError(getLinkStats(env.DB, 'nope'), 'not_found')
  })
})

describe('updateLink', () => {
  it('updates destination and slug', async () => {
    const link = await createLink(env.DB, { destination_url: 'https://old.com', slug: 'before' })
    const updated = await updateLink(env.DB, link.id, { destination_url: 'https://new.com', slug: 'after' })
    expect(updated.destination_url).toBe('https://new.com')
    expect(updated.slug).toBe('after')
    await expectLinkError(getLinkBySlug(env.DB, 'before'), 'not_found')
  })

  it('allows keeping the same slug on the same link', async () => {
    const link = await createLink(env.DB, { destination_url: 'https://old.com', slug: 'same' })
    const updated = await updateLink(env.DB, link.id, { slug: 'same' })
    expect(updated.slug).toBe('same')
  })

  it('reports not_found, no_changes, invalid_url, invalid_slug, slug_taken', async () => {
    const link = await createLink(env.DB, { destination_url: 'https://a.com', slug: 'one' })
    await createLink(env.DB, { destination_url: 'https://b.com', slug: 'two' })
    await expectLinkError(updateLink(env.DB, 99999, { slug: 'x-y-z' }), 'not_found')
    await expectLinkError(updateLink(env.DB, link.id, {}), 'no_changes')
    await expectLinkError(updateLink(env.DB, link.id, { destination_url: 'nope' }), 'invalid_url')
    await expectLinkError(updateLink(env.DB, link.id, { slug: 'a' }), 'invalid_slug')
    await expectLinkError(updateLink(env.DB, link.id, { slug: 'two' }), 'slug_taken')
  })
})

describe('deleteLink', () => {
  it('deletes the link and its clicks', async () => {
    const link = await createLink(env.DB, { destination_url: 'https://example.com', slug: 'gone' })
    await addClick(link.id, null)
    await deleteLink(env.DB, link.id)
    await expectLinkError(getLinkBySlug(env.DB, 'gone'), 'not_found')
    const clicks = await env.DB.prepare('SELECT COUNT(*) AS count FROM clicks WHERE link_id = ?').bind(link.id).first<{ count: number }>()
    expect(clicks?.count).toBe(0)
    await expectLinkError(deleteLink(env.DB, link.id), 'not_found')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib/links.test.ts`
Expected: FAIL — the import of `../../lib/links` cannot be resolved (module does not exist yet).

- [ ] **Step 3: Implement `lib/links.ts`**

```ts
export interface Link {
  id: number
  slug: string
  destination_url: string
  created_at: string
  updated_at: string
  click_count: number
}

export interface Click {
  id: number
  link_id: number
  clicked_at: string
  referrer: string | null
}

export interface ReferrerCount {
  referrer: string
  count: number
}

export interface LinkStats extends Link {
  top_referrers: ReferrerCount[]
  recent_clicks: { clicked_at: string; referrer: string | null }[]
}

export type LinkErrorCode =
  | 'invalid_url'
  | 'invalid_slug'
  | 'slug_taken'
  | 'not_found'
  | 'no_changes'
  | 'slug_generation_failed'

export class LinkError extends Error {
  readonly code: LinkErrorCode

  constructor(code: LinkErrorCode) {
    super(code)
    this.name = 'LinkError'
    this.code = code
  }
}

export const RESERVED_SLUGS = ['admin', 'api', 'static', 'assets', '_headers', '_redirects', 'mcp']

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function isValidSlug(slug: string): boolean {
  // 3-50 chars, alphanumeric + hyphens, no reserved words
  const slugRegex = /^[a-zA-Z0-9-]{3,50}$/
  return slugRegex.test(slug) && !RESERVED_SLUGS.includes(slug.toLowerCase())
}

export function generateSlug(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function slugExists(db: D1Database, slug: string, excludeId?: number | string): Promise<boolean> {
  const row = excludeId === undefined
    ? await db.prepare('SELECT id FROM links WHERE slug = ?').bind(slug).first()
    : await db.prepare('SELECT id FROM links WHERE slug = ? AND id != ?').bind(slug, excludeId).first()
  return row !== null
}

export async function createLink(
  db: D1Database,
  input: { destination_url: string; slug?: string }
): Promise<Link> {
  if (!input.destination_url || !isValidUrl(input.destination_url)) {
    throw new LinkError('invalid_url')
  }

  let slug = input.slug?.trim()

  if (slug) {
    if (!isValidSlug(slug)) throw new LinkError('invalid_slug')
    if (await slugExists(db, slug)) throw new LinkError('slug_taken')
  } else {
    const maxAttempts = 10
    let attempts = 0
    do {
      slug = generateSlug()
      attempts++
    } while (await slugExists(db, slug) && attempts < maxAttempts)

    if (await slugExists(db, slug)) throw new LinkError('slug_generation_failed')
  }

  const link = await db.prepare(
    'INSERT INTO links (slug, destination_url) VALUES (?, ?) RETURNING *'
  ).bind(slug, input.destination_url).first<Link>()

  return link!
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export async function listLinks(
  db: D1Database,
  options: { limit?: number; search?: string } = {}
): Promise<Link[]> {
  let sql = 'SELECT * FROM links'
  const values: (string | number)[] = []

  if (options.search) {
    const pattern = `%${escapeLike(options.search)}%`
    sql += " WHERE slug LIKE ? ESCAPE '\\' OR destination_url LIKE ? ESCAPE '\\'"
    values.push(pattern, pattern)
  }

  sql += ' ORDER BY created_at DESC, id DESC'

  if (options.limit !== undefined) {
    sql += ' LIMIT ?'
    values.push(options.limit)
  }

  const { results } = await db.prepare(sql).bind(...values).all<Link>()
  return results
}

export async function getLinkById(db: D1Database, id: number | string): Promise<Link> {
  const link = await db.prepare('SELECT * FROM links WHERE id = ?').bind(id).first<Link>()
  if (!link) throw new LinkError('not_found')
  return link
}

export async function getLinkBySlug(db: D1Database, slug: string): Promise<Link> {
  const link = await db.prepare('SELECT * FROM links WHERE slug = ?').bind(slug).first<Link>()
  if (!link) throw new LinkError('not_found')
  return link
}

export async function getRecentClicks(db: D1Database, linkId: number | string, limit: number): Promise<Click[]> {
  const { results } = await db.prepare(
    'SELECT * FROM clicks WHERE link_id = ? ORDER BY clicked_at DESC, id DESC LIMIT ?'
  ).bind(linkId, limit).all<Click>()
  return results
}

export async function getLinkStats(db: D1Database, slug: string): Promise<LinkStats> {
  const link = await getLinkBySlug(db, slug)

  const [referrers, clicks] = await db.batch([
    db.prepare(
      `SELECT COALESCE(referrer, 'direct') AS referrer, COUNT(*) AS count
       FROM clicks WHERE link_id = ?
       GROUP BY COALESCE(referrer, 'direct')
       ORDER BY count DESC, referrer ASC
       LIMIT 5`
    ).bind(link.id),
    db.prepare(
      'SELECT clicked_at, referrer FROM clicks WHERE link_id = ? ORDER BY clicked_at DESC, id DESC LIMIT 20'
    ).bind(link.id),
  ])

  return {
    ...link,
    top_referrers: referrers.results as ReferrerCount[],
    recent_clicks: clicks.results as LinkStats['recent_clicks'],
  }
}

export async function updateLink(
  db: D1Database,
  id: number | string,
  changes: { destination_url?: string; slug?: string }
): Promise<Link> {
  await getLinkById(db, id)

  const updates: string[] = []
  const values: (string | number)[] = []

  if (changes.destination_url !== undefined) {
    if (!isValidUrl(changes.destination_url)) throw new LinkError('invalid_url')
    updates.push('destination_url = ?')
    values.push(changes.destination_url)
  }

  if (changes.slug !== undefined) {
    const slug = changes.slug.trim()
    if (!isValidSlug(slug)) throw new LinkError('invalid_slug')
    if (await slugExists(db, slug, id)) throw new LinkError('slug_taken')
    updates.push('slug = ?')
    values.push(slug)
  }

  if (updates.length === 0) throw new LinkError('no_changes')

  updates.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  const link = await db.prepare(
    `UPDATE links SET ${updates.join(', ')} WHERE id = ? RETURNING *`
  ).bind(...values).first<Link>()

  return link!
}

export async function deleteLink(db: D1Database, id: number | string): Promise<void> {
  await getLinkById(db, id)
  await db.prepare('DELETE FROM links WHERE id = ?').bind(id).run()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib/links.test.ts`
Expected: PASS, 12 tests.

Run: `npm run typecheck:worker`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/links.ts test/lib/links.test.ts
git commit -m "feat: extract shared link logic into lib/links"
```

---

### Task 3: Move REST link handlers onto the shared library

Characterization tests pin today's REST behavior first, then the handlers are rewritten to call `lib/links.ts`.

**Files:**
- Test: `test/functions/api-links.test.ts`
- Modify: `functions/api/links/index.ts` (full rewrite), `functions/api/links/[id].ts` (full rewrite)

**Interfaces:**
- Consumes: `createLink`, `listLinks`, `getLinkById`, `getRecentClicks`, `updateLink`, `deleteLink`, `LinkError` from `lib/links.ts`; `Env` from `lib/env.ts`; `makeContext`, `jsonRequest` from `test/helpers.ts`.
- Produces: unchanged HTTP API.

- [ ] **Step 1: Write characterization tests**

`test/functions/api-links.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { onRequestGet as listHandler, onRequestPost as createHandler } from '../../functions/api/links/index'
import {
  onRequestDelete as deleteHandler,
  onRequestGet as getHandler,
  onRequestPut as updateHandler,
} from '../../functions/api/links/[id]'
import { jsonRequest, makeContext } from '../helpers'

async function call(handler: PagesFunction<any>, request: Request, params: Record<string, string> = {}) {
  const { context } = makeContext(request, params)
  const response = await handler(context)
  return { status: response.status, body: (await response.json()) as any }
}

async function create(body: unknown) {
  return call(createHandler, jsonRequest('POST', '/api/links', body))
}

describe('POST /api/links', () => {
  it('creates a link and returns 201', async () => {
    const { status, body } = await create({ destination_url: 'https://example.com', slug: 'hello' })
    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ slug: 'hello', destination_url: 'https://example.com', click_count: 0 })
    expect(body.data).toHaveProperty('id')
    expect(body.data).toHaveProperty('created_at')
    expect(body.data).toHaveProperty('updated_at')
  })

  it('keeps existing error messages and status codes', async () => {
    expect(await create({ destination_url: 'nope' })).toEqual({
      status: 400,
      body: { success: false, error: 'Invalid destination URL. Must be a valid HTTP(S) URL.' },
    })
    expect(await create({ destination_url: 'https://example.com', slug: 'a' })).toEqual({
      status: 400,
      body: { success: false, error: 'Invalid slug. Must be 3-50 alphanumeric characters or hyphens, and not a reserved word.' },
    })
    await create({ destination_url: 'https://example.com', slug: 'dupe' })
    expect(await create({ destination_url: 'https://example.com', slug: 'dupe' })).toEqual({
      status: 409,
      body: { success: false, error: 'Slug already exists. Please choose a different one.' },
    })
  })
})

describe('GET /api/links', () => {
  it('lists all links', async () => {
    await create({ destination_url: 'https://a.com', slug: 'aaa' })
    await create({ destination_url: 'https://b.com', slug: 'bbb' })
    const { status, body } = await call(listHandler, jsonRequest('GET', '/api/links'))
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.map((l: any) => l.slug).sort()).toEqual(['aaa', 'bbb'])
  })
})

describe('GET /api/links/:id', () => {
  it('returns the link with recent_clicks', async () => {
    const created = await create({ destination_url: 'https://a.com', slug: 'clicked' })
    const id = String(created.body.data.id)
    await env.DB.prepare('INSERT INTO clicks (link_id, referrer) VALUES (?, ?)').bind(id, 'https://t.me').run()

    const { status, body } = await call(getHandler, jsonRequest('GET', `/api/links/${id}`), { id })
    expect(status).toBe(200)
    expect(body.data.slug).toBe('clicked')
    expect(body.data.recent_clicks).toHaveLength(1)
    expect(body.data.recent_clicks[0]).toMatchObject({ link_id: Number(id), referrer: 'https://t.me' })
  })

  it('returns 404 for an unknown id', async () => {
    expect(await call(getHandler, jsonRequest('GET', '/api/links/999'), { id: '999' })).toEqual({
      status: 404,
      body: { success: false, error: 'Link not found' },
    })
  })
})

describe('PUT /api/links/:id', () => {
  it('updates a link', async () => {
    const created = await create({ destination_url: 'https://a.com', slug: 'before' })
    const id = String(created.body.data.id)
    const { status, body } = await call(
      updateHandler,
      jsonRequest('PUT', `/api/links/${id}`, { slug: 'after', destination_url: 'https://b.com' }),
      { id }
    )
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ slug: 'after', destination_url: 'https://b.com' })
  })

  it('keeps existing error messages and status codes', async () => {
    const created = await create({ destination_url: 'https://a.com', slug: 'mine' })
    await create({ destination_url: 'https://a.com', slug: 'theirs' })
    const id = String(created.body.data.id)
    const put = (body: unknown, target = id) =>
      call(updateHandler, jsonRequest('PUT', `/api/links/${target}`, body), { id: target })

    expect(await put({ slug: 'x-y-z' }, '999')).toEqual({ status: 404, body: { success: false, error: 'Link not found' } })
    expect(await put({ destination_url: 'nope' })).toEqual({ status: 400, body: { success: false, error: 'Invalid destination URL' } })
    expect(await put({ slug: 'a' })).toEqual({ status: 400, body: { success: false, error: 'Invalid slug' } })
    expect(await put({ slug: 'theirs' })).toEqual({ status: 409, body: { success: false, error: 'Slug already exists' } })
    expect(await put({})).toEqual({ status: 400, body: { success: false, error: 'No valid fields to update' } })
  })
})

describe('DELETE /api/links/:id', () => {
  it('deletes a link and echoes the id', async () => {
    const created = await create({ destination_url: 'https://a.com', slug: 'bye' })
    const id = String(created.body.data.id)
    expect(await call(deleteHandler, jsonRequest('DELETE', `/api/links/${id}`), { id })).toEqual({
      status: 200,
      body: { success: true, data: { id } },
    })
    expect(await call(deleteHandler, jsonRequest('DELETE', `/api/links/${id}`), { id })).toEqual({
      status: 404,
      body: { success: false, error: 'Link not found' },
    })
  })
})
```

- [ ] **Step 2: Run them against the current handlers**

Run: `npx vitest run test/functions/api-links.test.ts`
Expected: PASS, 8 tests. These describe existing behavior, so they must pass **before** the refactor. If one fails, the test is wrong about current behavior: fix the test, not the handler.

- [ ] **Step 3: Rewrite `functions/api/links/index.ts`**

```ts
import type { Env } from '../../../lib/env'
import { LinkError, createLink, listLinks } from '../../../lib/links'

interface CreateLinkBody {
  slug?: string
  destination_url: string
}

// GET /api/links - List all links
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const links = await listLinks(context.env.DB)
    return Response.json({ success: true, data: links })
  } catch (error) {
    console.error('Error fetching links:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch links' },
      { status: 500 }
    )
  }
}

const CREATE_ERRORS: Partial<Record<LinkError['code'], [number, string]>> = {
  invalid_url: [400, 'Invalid destination URL. Must be a valid HTTP(S) URL.'],
  invalid_slug: [400, 'Invalid slug. Must be 3-50 alphanumeric characters or hyphens, and not a reserved word.'],
  slug_taken: [409, 'Slug already exists. Please choose a different one.'],
  slug_generation_failed: [500, 'Failed to generate unique slug. Please try again.'],
}

// POST /api/links - Create a new link
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<CreateLinkBody>()
    const link = await createLink(context.env.DB, body)
    return Response.json({ success: true, data: link }, { status: 201 })
  } catch (error) {
    const mapped = error instanceof LinkError ? CREATE_ERRORS[error.code] : undefined
    if (mapped) {
      return Response.json({ success: false, error: mapped[1] }, { status: mapped[0] })
    }
    console.error('Error creating link:', error)
    return Response.json(
      { success: false, error: 'Failed to create link' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Rewrite `functions/api/links/[id].ts`**

```ts
import type { Env } from '../../../lib/env'
import { LinkError, deleteLink, getLinkById, getRecentClicks, updateLink } from '../../../lib/links'

interface UpdateLinkBody {
  slug?: string
  destination_url?: string
}

function notFound(): Response {
  return Response.json(
    { success: false, error: 'Link not found' },
    { status: 404 }
  )
}

// GET /api/links/:id - Get link with analytics
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  try {
    const link = await getLinkById(context.env.DB, id)
    const clicks = await getRecentClicks(context.env.DB, id, 100)

    return Response.json({
      success: true,
      data: {
        ...link,
        recent_clicks: clicks
      }
    })
  } catch (error) {
    if (error instanceof LinkError && error.code === 'not_found') return notFound()
    console.error('Error fetching link:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch link' },
      { status: 500 }
    )
  }
}

const UPDATE_ERRORS: Partial<Record<LinkError['code'], [number, string]>> = {
  not_found: [404, 'Link not found'],
  invalid_url: [400, 'Invalid destination URL'],
  invalid_slug: [400, 'Invalid slug'],
  slug_taken: [409, 'Slug already exists'],
  no_changes: [400, 'No valid fields to update'],
}

// PUT /api/links/:id - Update a link
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  try {
    const body = await context.request.json<UpdateLinkBody>()
    const link = await updateLink(context.env.DB, id, {
      destination_url: body.destination_url,
      slug: body.slug,
    })
    return Response.json({ success: true, data: link })
  } catch (error) {
    const mapped = error instanceof LinkError ? UPDATE_ERRORS[error.code] : undefined
    if (mapped) {
      return Response.json({ success: false, error: mapped[1] }, { status: mapped[0] })
    }
    console.error('Error updating link:', error)
    return Response.json(
      { success: false, error: 'Failed to update link' },
      { status: 500 }
    )
  }
}

// DELETE /api/links/:id - Delete a link
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  try {
    // Clicks are cascade deleted
    await deleteLink(context.env.DB, id)
    return Response.json({ success: true, data: { id } })
  } catch (error) {
    if (error instanceof LinkError && error.code === 'not_found') return notFound()
    console.error('Error deleting link:', error)
    return Response.json(
      { success: false, error: 'Failed to delete link' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 5: Run the full suite and type-check**

Run: `npm test`
Expected: PASS, 3 files, 21 tests.

Run: `npm run typecheck:worker`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add functions/api/links test/functions/api-links.test.ts
git commit -m "refactor: use shared link library in REST link handlers"
```

---

### Task 4: Token storage

Adds the `api_tokens` table and `lib/tokens.ts`.

**Files:**
- Modify: `db/schema.sql` (append), `test/setup.ts`
- Create: `lib/tokens.ts`
- Test: `test/lib/tokens.test.ts`

**Interfaces:**
- Produces (all exported from `lib/tokens.ts`):
  - `interface ApiToken { id: number; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }`
  - `type TokenErrorCode = 'invalid_name' | 'not_found'`, `class TokenError extends Error { readonly code: TokenErrorCode }`
  - `generateRawToken(): string` — `lsk_` + 43 base62 chars
  - `hashToken(raw: string): Promise<string>` — SHA-256 lowercase hex
  - `createToken(db: D1Database, name: string): Promise<{ token: string; record: ApiToken }>` — trims name; 1–50 chars
  - `listTokens(db: D1Database): Promise<ApiToken[]>` — newest first
  - `revokeToken(db: D1Database, id: number | string): Promise<void>` — `not_found` if missing or already revoked
  - `verifyToken(db: D1Database, raw: string): Promise<ApiToken | null>` — null for unknown, malformed, or revoked
  - `touchToken(db: D1Database, id: number): Promise<void>` — sets `last_used_at`

- [ ] **Step 1: Append the table to `db/schema.sql`**

Add at the end of the file:

```sql
-- API tokens for MCP clients (only the SHA-256 hash is stored)
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

- [ ] **Step 2: Clear `api_tokens` between tests**

In `test/setup.ts`, inside the `beforeEach` batch, add a line after `env.DB.prepare('DELETE FROM links'),`:

```ts
    env.DB.prepare('DELETE FROM api_tokens'),
```

- [ ] **Step 3: Write the failing tests**

`test/lib/tokens.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import {
  TokenError,
  createToken,
  generateRawToken,
  hashToken,
  listTokens,
  revokeToken,
  touchToken,
  verifyToken,
} from '../../lib/tokens'

async function expectTokenError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(TokenError)
  expect((error as TokenError).code).toBe(code)
}

describe('generateRawToken', () => {
  it('produces lsk_ + 43 base62 characters, unique each call', () => {
    const a = generateRawToken()
    const b = generateRawToken()
    expect(a).toMatch(/^lsk_[0-9A-Za-z]{43}$/)
    expect(a).not.toBe(b)
  })
})

describe('hashToken', () => {
  it('returns the SHA-256 hex digest', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('createToken', () => {
  it('stores only the hash and prefix, and returns the raw token once', async () => {
    const { token, record } = await createToken(env.DB, '  hermes  ')
    expect(record).toMatchObject({ name: 'hermes', prefix: token.slice(0, 8), last_used_at: null, revoked_at: null })
    expect(record).not.toHaveProperty('token_hash')

    const row = await env.DB.prepare('SELECT * FROM api_tokens WHERE id = ?').bind(record.id).first<Record<string, unknown>>()
    expect(row?.token_hash).toBe(await hashToken(token))
    expect(Object.values(row!)).not.toContain(token)
  })

  it('rejects empty and over-long names', async () => {
    await expectTokenError(createToken(env.DB, '   '), 'invalid_name')
    await expectTokenError(createToken(env.DB, 'x'.repeat(51)), 'invalid_name')
  })
})

describe('verifyToken', () => {
  it('accepts a valid token and rejects wrong, malformed, and revoked tokens', async () => {
    const { token, record } = await createToken(env.DB, 'hermes')
    expect((await verifyToken(env.DB, token))?.id).toBe(record.id)
    expect(await verifyToken(env.DB, token + 'x')).toBeNull()
    expect(await verifyToken(env.DB, 'not-a-token')).toBeNull()

    await revokeToken(env.DB, record.id)
    expect(await verifyToken(env.DB, token)).toBeNull()
  })
})

describe('listTokens / revokeToken / touchToken', () => {
  it('lists newest first without hashes, revokes once, and records last use', async () => {
    const first = await createToken(env.DB, 'first')
    const second = await createToken(env.DB, 'second')

    const tokens = await listTokens(env.DB)
    expect(tokens.map((t) => t.name)).toEqual(['second', 'first'])
    expect(tokens[0]).not.toHaveProperty('token_hash')

    await touchToken(env.DB, first.record.id)
    await revokeToken(env.DB, second.record.id)
    await expectTokenError(revokeToken(env.DB, second.record.id), 'not_found')
    await expectTokenError(revokeToken(env.DB, 99999), 'not_found')

    const after = await listTokens(env.DB)
    expect(after.find((t) => t.name === 'first')?.last_used_at).not.toBeNull()
    expect(after.find((t) => t.name === 'second')?.revoked_at).not.toBeNull()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run test/lib/tokens.test.ts`
Expected: FAIL — the import of `../../lib/tokens` cannot be resolved (module does not exist yet).

- [ ] **Step 5: Implement `lib/tokens.ts`**

```ts
export interface ApiToken {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type TokenErrorCode = 'invalid_name' | 'not_found'

export class TokenError extends Error {
  readonly code: TokenErrorCode

  constructor(code: TokenErrorCode) {
    super(code)
    this.name = 'TokenError'
    this.code = code
  }
}

const TOKEN_PREFIX = 'lsk_'
const TOKEN_LENGTH = 43 // 43 base62 chars ≈ 256 bits of entropy
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const PUBLIC_COLUMNS = 'id, name, prefix, created_at, last_used_at, revoked_at'

export function generateRawToken(): string {
  let body = ''
  while (body.length < TOKEN_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(64))) {
      // Rejection sampling keeps every character equally likely
      if (byte < 248 && body.length < TOKEN_LENGTH) body += BASE62[byte % 62]
    }
  }
  return TOKEN_PREFIX + body
}

export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function createToken(db: D1Database, name: string): Promise<{ token: string; record: ApiToken }> {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 50) throw new TokenError('invalid_name')

  const token = generateRawToken()
  const record = await db.prepare(
    `INSERT INTO api_tokens (name, token_hash, prefix) VALUES (?, ?, ?) RETURNING ${PUBLIC_COLUMNS}`
  ).bind(trimmed, await hashToken(token), token.slice(0, 8)).first<ApiToken>()

  return { token, record: record! }
}

export async function listTokens(db: D1Database): Promise<ApiToken[]> {
  const { results } = await db.prepare(
    `SELECT ${PUBLIC_COLUMNS} FROM api_tokens ORDER BY created_at DESC, id DESC`
  ).all<ApiToken>()
  return results
}

export async function revokeToken(db: D1Database, id: number | string): Promise<void> {
  const result = await db.prepare(
    'UPDATE api_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL'
  ).bind(id).run()
  if (result.meta.changes === 0) throw new TokenError('not_found')
}

export async function verifyToken(db: D1Database, raw: string): Promise<ApiToken | null> {
  if (!raw.startsWith(TOKEN_PREFIX)) return null
  return db.prepare(
    `SELECT ${PUBLIC_COLUMNS} FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL`
  ).bind(await hashToken(raw)).first<ApiToken>()
}

export async function touchToken(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id).run()
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 4 files, 27 tests.

Run: `npm run typecheck:worker`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql lib/tokens.ts test/lib/tokens.test.ts test/setup.ts
git commit -m "feat: add hashed API token storage"
```

---

### Task 5: Token management API

**Files:**
- Create: `functions/api/tokens/index.ts`, `functions/api/tokens/[id].ts`
- Test: `test/functions/api-tokens.test.ts`

**Interfaces:**
- Consumes: `createToken`, `listTokens`, `revokeToken`, `TokenError` from `lib/tokens.ts`.
- Produces HTTP API:
  - `GET /api/tokens` → `200 { success: true, data: ApiToken[] }`
  - `POST /api/tokens` body `{ name }` → `201 { success: true, data: { token: string, record: ApiToken } }`; bad name → `400 { success: false, error: 'Invalid name. Must be 1-50 characters.' }`
  - `DELETE /api/tokens/:id` → `200 { success: true }`; missing/already revoked → `404 { success: false, error: 'Token not found' }`

- [ ] **Step 1: Write the failing tests**

`test/functions/api-tokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { onRequestGet as listHandler, onRequestPost as createHandler } from '../../functions/api/tokens/index'
import { onRequestDelete as revokeHandler } from '../../functions/api/tokens/[id]'
import { jsonRequest, makeContext } from '../helpers'

async function call(handler: PagesFunction<any>, request: Request, params: Record<string, string> = {}) {
  const { context } = makeContext(request, params)
  const response = await handler(context)
  return { status: response.status, body: (await response.json()) as any }
}

describe('/api/tokens', () => {
  it('creates a token and returns the raw value once', async () => {
    const { status, body } = await call(createHandler, jsonRequest('POST', '/api/tokens', { name: 'hermes' }))
    expect(status).toBe(201)
    expect(body.data.token).toMatch(/^lsk_[0-9A-Za-z]{43}$/)
    expect(body.data.record).toMatchObject({ name: 'hermes', prefix: body.data.token.slice(0, 8) })

    const list = await call(listHandler, jsonRequest('GET', '/api/tokens'))
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
    expect(JSON.stringify(list.body)).not.toContain(body.data.token)
    expect(list.body.data[0]).not.toHaveProperty('token_hash')
  })

  it('rejects an invalid name with 400', async () => {
    expect(await call(createHandler, jsonRequest('POST', '/api/tokens', { name: '' }))).toEqual({
      status: 400,
      body: { success: false, error: 'Invalid name. Must be 1-50 characters.' },
    })
    expect((await call(createHandler, jsonRequest('POST', '/api/tokens', {}))).status).toBe(400)
  })

  it('revokes a token, and a second revoke returns 404', async () => {
    const created = await call(createHandler, jsonRequest('POST', '/api/tokens', { name: 'hermes' }))
    const id = String(created.body.data.record.id)

    expect(await call(revokeHandler, jsonRequest('DELETE', `/api/tokens/${id}`), { id })).toEqual({
      status: 200,
      body: { success: true },
    })
    expect(await call(revokeHandler, jsonRequest('DELETE', `/api/tokens/${id}`), { id })).toEqual({
      status: 404,
      body: { success: false, error: 'Token not found' },
    })

    const list = await call(listHandler, jsonRequest('GET', '/api/tokens'))
    expect(list.body.data[0].revoked_at).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/functions/api-tokens.test.ts`
Expected: FAIL — the import of `../../functions/api/tokens/index` cannot be resolved (module does not exist yet).

- [ ] **Step 3: Create `functions/api/tokens/index.ts`**

```ts
import type { Env } from '../../../lib/env'
import { TokenError, createToken, listTokens } from '../../../lib/tokens'

// GET /api/tokens - List API tokens (never includes hashes)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const tokens = await listTokens(context.env.DB)
    return Response.json({ success: true, data: tokens })
  } catch (error) {
    console.error('Error fetching tokens:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch tokens' },
      { status: 500 }
    )
  }
}

// POST /api/tokens - Create a token; the raw token is only returned here
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<{ name?: unknown }>()
    const name = typeof body.name === 'string' ? body.name : ''
    const result = await createToken(context.env.DB, name)
    return Response.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof TokenError && error.code === 'invalid_name') {
      return Response.json(
        { success: false, error: 'Invalid name. Must be 1-50 characters.' },
        { status: 400 }
      )
    }
    console.error('Error creating token:', error)
    return Response.json(
      { success: false, error: 'Failed to create token' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: Create `functions/api/tokens/[id].ts`**

```ts
import type { Env } from '../../../lib/env'
import { TokenError, revokeToken } from '../../../lib/tokens'

// DELETE /api/tokens/:id - Revoke a token (kept in the list as revoked)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    await revokeToken(context.env.DB, context.params.id as string)
    return Response.json({ success: true })
  } catch (error) {
    if (error instanceof TokenError && error.code === 'not_found') {
      return Response.json(
        { success: false, error: 'Token not found' },
        { status: 404 }
      )
    }
    console.error('Error revoking token:', error)
    return Response.json(
      { success: false, error: 'Failed to revoke token' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 5 files, 30 tests.

Run: `npm run typecheck:worker`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add functions/api/tokens test/functions/api-tokens.test.ts
git commit -m "feat: add API token management endpoints"
```

---

### Task 6: MCP tools and `/mcp` endpoint

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/mcp-tools.ts`, `functions/mcp.ts`
- Test: `test/functions/mcp.test.ts`

**Interfaces:**
- Consumes: `createLink`, `listLinks`, `getLinkBySlug`, `getLinkStats`, `updateLink`, `deleteLink`, `LinkError`, `Link` from `lib/links.ts`; `verifyToken`, `touchToken`, `createToken`, `revokeToken` from `lib/tokens.ts`.
- Produces:
  - `registerTools(server: McpServer, deps: { db: D1Database; origin: string }): void` in `lib/mcp-tools.ts`
  - `onRequestPost`, `onRequestGet`, `onRequestDelete` in `functions/mcp.ts`
  - Tools: `create_short_link`, `list_links`, `get_link_stats`, `update_link`, `delete_link` (inputs and messages exactly as in the spec)

- [ ] **Step 1: Install MCP dependencies**

Run: `npx -y npm@12 install @modelcontextprotocol/sdk@^1.30.0 zod@^4.6.5 @cfworker/json-schema@^4.1.1`
Expected: exits 0.

Run: `npm ci`
Expected: exits 0.

- [ ] **Step 2: Write the failing tests**

`test/functions/mcp.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { onRequestDelete, onRequestGet, onRequestPost } from '../../functions/mcp'
import { createToken, revokeToken } from '../../lib/tokens'
import { makeContext } from '../helpers'

let token: string
let tokenId: number
let nextId = 1

beforeEach(async () => {
  const created = await createToken(env.DB, 'test')
  token = created.token
  tokenId = created.record.id
})

function mcpRequest(body: unknown, authorization: string | null = `Bearer ${token}`) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (authorization !== null) headers.Authorization = authorization
  return new Request('https://go.example.com/mcp', { method: 'POST', headers, body: JSON.stringify(body) })
}

async function post(body: unknown, authorization?: string | null) {
  const { context, settle } = makeContext(mcpRequest(body, authorization))
  const response = await onRequestPost(context)
  await settle()
  return response
}

async function callTool(name: string, args: Record<string, unknown>) {
  const response = await post({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } })
  expect(response.status).toBe(200)
  const body = (await response.json()) as any
  return body.result as { content: { type: string; text: string }[]; structuredContent?: any; isError?: boolean }
}

describe('authentication', () => {
  it('returns the same 401 for missing, wrong, and revoked tokens', async () => {
    const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' }

    const missing = await post(list, null)
    const wrong = await post(list, 'Bearer lsk_wrong')
    await revokeToken(env.DB, tokenId)
    const revoked = await post(list)

    for (const response of [missing, wrong, revoked]) {
      expect(response.status).toBe(401)
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer')
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    }
  })

  it('records last_used_at for a valid token', async () => {
    await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const row = await env.DB.prepare('SELECT last_used_at FROM api_tokens WHERE id = ?').bind(tokenId).first<{ last_used_at: string | null }>()
    expect(row?.last_used_at).not.toBeNull()
  })
})

describe('HTTP methods', () => {
  it('returns 405 for GET and DELETE', async () => {
    for (const handler of [onRequestGet, onRequestDelete]) {
      const { context } = makeContext(new Request('https://go.example.com/mcp'))
      const response = await handler(context)
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('POST')
    }
  })
})

describe('protocol', () => {
  it('responds to initialize', async () => {
    const response = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as any
    expect(body.result.serverInfo).toEqual({ name: 'link-shortener', version: '1.0.0' })
  })

  it('lists the 5 tools with annotations', async () => {
    const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const body = (await response.json()) as any
    const tools = Object.fromEntries(body.result.tools.map((t: any) => [t.name, t]))

    expect(Object.keys(tools).sort()).toEqual(
      ['create_short_link', 'delete_link', 'get_link_stats', 'list_links', 'update_link']
    )
    expect(tools.list_links.annotations).toEqual({ readOnlyHint: true })
    expect(tools.get_link_stats.annotations).toEqual({ readOnlyHint: true })
    expect(tools.update_link.annotations).toEqual({ destructiveHint: true })
    expect(tools.delete_link.annotations).toEqual({ destructiveHint: true })
  })
})

describe('tools', () => {
  it('runs create -> list -> stats -> update -> delete', async () => {
    const created = await callTool('create_short_link', { url: 'https://example.com', slug: 'promo' })
    expect(created.isError).toBeUndefined()
    expect(created.structuredContent).toMatchObject({
      short_url: 'https://go.example.com/promo',
      slug: 'promo',
      destination_url: 'https://example.com',
    })
    expect(JSON.parse(created.content[0].text)).toEqual(created.structuredContent)

    const listed = await callTool('list_links', { search: 'prom' })
    expect(listed.structuredContent.links).toHaveLength(1)
    expect(listed.structuredContent.links[0]).toMatchObject({ slug: 'promo', click_count: 0 })

    const stats = await callTool('get_link_stats', { slug: 'promo' })
    expect(stats.structuredContent).toMatchObject({ slug: 'promo', click_count: 0, top_referrers: [], recent_clicks: [] })

    const updated = await callTool('update_link', { slug: 'promo', new_slug: 'promo-2026', new_destination_url: 'https://example.org' })
    expect(updated.structuredContent).toMatchObject({
      short_url: 'https://go.example.com/promo-2026',
      destination_url: 'https://example.org',
    })

    const refused = await callTool('delete_link', { slug: 'promo-2026', confirm_slug: 'promo' })
    expect(refused).toMatchObject({ isError: true, content: [{ text: 'confirm_slug must exactly match slug. Nothing was deleted.' }] })

    const deleted = await callTool('delete_link', { slug: 'promo-2026', confirm_slug: 'promo-2026' })
    expect(deleted.structuredContent).toEqual({ deleted: 'promo-2026' })

    const gone = await callTool('get_link_stats', { slug: 'promo-2026' })
    expect(gone).toMatchObject({ isError: true, content: [{ text: 'No link with slug "promo-2026".' }] })
  })

  it('auto-generates a slug when none is given', async () => {
    const created = await callTool('create_short_link', { url: 'https://example.com' })
    expect(created.structuredContent.slug).toMatch(/^[a-zA-Z0-9]{6}$/)
  })

  it('returns friendly isError results for bad input', async () => {
    expect(await callTool('create_short_link', { url: 'example.com' })).toMatchObject({
      isError: true,
      content: [{ text: 'Invalid URL. Must start with http:// or https://.' }],
    })
    expect(await callTool('create_short_link', { url: 'https://example.com', slug: 'mcp' })).toMatchObject({
      isError: true,
      content: [{ text: 'Invalid slug. Use 3-50 letters, numbers, or hyphens, and not a reserved word.' }],
    })

    await callTool('create_short_link', { url: 'https://example.com', slug: 'taken' })
    expect(await callTool('create_short_link', { url: 'https://example.com', slug: 'taken' })).toMatchObject({
      isError: true,
      content: [{ text: 'Slug "taken" is already taken. Try another slug or omit it to auto-generate.' }],
    })
    expect(await callTool('update_link', { slug: 'taken' })).toMatchObject({
      isError: true,
      content: [{ text: 'Provide new_destination_url or new_slug.' }],
    })
    expect(await callTool('update_link', { slug: 'missing', new_slug: 'whatever' })).toMatchObject({
      isError: true,
      content: [{ text: 'No link with slug "missing".' }],
    })
  })

  it('rejects wrong argument types before running the tool', async () => {
    const result = await callTool('list_links', { limit: 500 })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Input validation error')
  })
})
```

Note: requests must send `Accept: application/json, text/event-stream`; the SDK returns `406` otherwise. `callTool` handles this.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/functions/mcp.test.ts`
Expected: FAIL — the import of `../../functions/mcp` cannot be resolved (module does not exist yet).

- [ ] **Step 4: Create `lib/mcp-tools.ts`**

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  LinkError,
  createLink,
  deleteLink,
  getLinkBySlug,
  getLinkStats,
  listLinks,
  updateLink,
  type Link,
} from './links'

export interface ToolDeps {
  db: D1Database
  origin: string
}

function ok(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function handleError(error: unknown, slug: string | undefined): CallToolResult {
  if (error instanceof LinkError) {
    switch (error.code) {
      case 'invalid_url':
        return fail('Invalid URL. Must start with http:// or https://.')
      case 'invalid_slug':
        return fail('Invalid slug. Use 3-50 letters, numbers, or hyphens, and not a reserved word.')
      case 'slug_taken':
        return fail(`Slug "${slug}" is already taken. Try another slug or omit it to auto-generate.`)
      case 'not_found':
        return fail(`No link with slug "${slug}".`)
      case 'no_changes':
        return fail('Provide new_destination_url or new_slug.')
      case 'slug_generation_failed':
        return fail('Could not generate a unique slug. Try again or pass a custom slug.')
    }
  }
  console.error('MCP tool error:', error)
  return fail('Internal error.')
}

function shortUrl(origin: string, slug: string): string {
  return `${origin}/${slug}`
}

function linkView(origin: string, link: Link) {
  return {
    short_url: shortUrl(origin, link.slug),
    slug: link.slug,
    destination_url: link.destination_url,
    click_count: link.click_count,
    created_at: link.created_at,
  }
}

export function registerTools(server: McpServer, { db, origin }: ToolDeps): void {
  server.registerTool(
    'create_short_link',
    {
      title: 'Create short link',
      description:
        'Shorten a URL. Returns the short URL. Omit slug to auto-generate a 6-character one.',
      inputSchema: {
        url: z.string().describe('Destination URL, must start with http:// or https://'),
        slug: z.string().optional().describe('Optional custom slug: 3-50 letters, numbers, or hyphens'),
      },
    },
    async ({ url, slug }) => {
      try {
        const link = await createLink(db, { destination_url: url, slug })
        return ok({
          short_url: shortUrl(origin, link.slug),
          slug: link.slug,
          destination_url: link.destination_url,
          created_at: link.created_at,
        })
      } catch (error) {
        return handleError(error, slug?.trim())
      }
    }
  )

  server.registerTool(
    'list_links',
    {
      title: 'List short links',
      description: 'List short links, newest first. Optionally filter by text in the slug or destination URL.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe('Maximum links to return (default 20, max 100)'),
        search: z.string().optional().describe('Text to match in the slug or destination URL'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, search }) => {
      try {
        const links = await listLinks(db, { limit: limit ?? 20, search })
        return ok({ links: links.map((link) => linkView(origin, link)) })
      } catch (error) {
        return handleError(error, undefined)
      }
    }
  )

  server.registerTool(
    'get_link_stats',
    {
      title: 'Get link stats',
      description: 'Click count, top 5 referrers, and the last 20 clicks for one short link.',
      inputSchema: {
        slug: z.string().describe('Slug of the short link'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) => {
      try {
        const stats = await getLinkStats(db, slug)
        return ok({
          ...linkView(origin, stats),
          top_referrers: stats.top_referrers,
          recent_clicks: stats.recent_clicks,
        })
      } catch (error) {
        return handleError(error, slug)
      }
    }
  )

  server.registerTool(
    'update_link',
    {
      title: 'Update link',
      description:
        'Change the destination URL and/or slug of an existing short link. Existing shared short URLs will redirect to the new destination.',
      inputSchema: {
        slug: z.string().describe('Current slug of the link to update'),
        new_destination_url: z.string().optional().describe('New destination URL'),
        new_slug: z.string().optional().describe('New slug: 3-50 letters, numbers, or hyphens'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ slug, new_destination_url, new_slug }) => {
      let link: Link
      try {
        link = await getLinkBySlug(db, slug)
      } catch (error) {
        return handleError(error, slug)
      }

      try {
        const updated = await updateLink(db, link.id, {
          destination_url: new_destination_url,
          slug: new_slug,
        })
        return ok({ ...linkView(origin, updated), updated_at: updated.updated_at })
      } catch (error) {
        return handleError(error, new_slug?.trim() ?? slug)
      }
    }
  )

  server.registerTool(
    'delete_link',
    {
      title: 'Delete link',
      description:
        'Permanently delete a short link and its click history. confirm_slug must exactly match slug.',
      inputSchema: {
        slug: z.string().describe('Slug of the link to delete'),
        confirm_slug: z.string().describe('Repeat the slug exactly to confirm deletion'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ slug, confirm_slug }) => {
      if (slug !== confirm_slug) {
        return fail('confirm_slug must exactly match slug. Nothing was deleted.')
      }
      try {
        const link = await getLinkBySlug(db, slug)
        await deleteLink(db, link.id)
        return ok({ deleted: slug })
      } catch (error) {
        return handleError(error, slug)
      }
    }
  )
}
```

- [ ] **Step 5: Create `functions/mcp.ts`**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Env } from '../lib/env'
import { registerTools } from '../lib/mcp-tools'
import { touchToken, verifyToken } from '../lib/tokens'

const SERVER_INFO = { name: 'link-shortener', version: '1.0.0' }

function unauthorized(): Response {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
  )
}

// POST /mcp - MCP Streamable HTTP endpoint (stateless, JSON responses)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const match = /^Bearer\s+(\S+)$/i.exec(context.request.headers.get('Authorization') ?? '')
  if (!match) return unauthorized()

  try {
    const token = await verifyToken(context.env.DB, match[1])
    if (!token) return unauthorized()

    context.waitUntil(touchToken(context.env.DB, token.id))

    // A fresh server and transport per request: stateless mode cannot reuse a transport
    const server = new McpServer(SERVER_INFO, { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() })
    registerTools(server, { db: context.env.DB, origin: new URL(context.request.url).origin })

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    return await transport.handleRequest(context.request)
  } catch (error) {
    // Never log the Authorization header or the raw token
    console.error('MCP endpoint error:', error instanceof Error ? error.message : 'unknown error')
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: 'Method Not Allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}

export const onRequestGet: PagesFunction<Env> = async () => methodNotAllowed()
export const onRequestDelete: PagesFunction<Env> = async () => methodNotAllowed()
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 6 files, 39 tests.

Run: `npm run typecheck:worker`
Expected: exit 0.

- [ ] **Step 7: Verify the Pages bundle builds**

Run: `npx wrangler pages functions build --outdir=/tmp/link-shortener-fn-build --compatibility-date=2024-12-01`
Expected: `✨ Compiled Worker successfully` (bundle is about 1.6 MB uncompressed, well under the Workers limit).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/mcp-tools.ts functions/mcp.ts test/functions/mcp.test.ts
git commit -m "feat: add token-protected MCP endpoint with link tools"
```

---

### Task 7: Admin UI for API tokens

No frontend test framework exists in this repo, so verification is the type-checked build plus a manual check in the browser.

**Files:**
- Modify: `src/types/index.ts` (append), `src/views/AdminDashboard.vue`
- Create: `src/composables/useTokens.ts`, `src/components/TokenManager.vue`

**Interfaces:**
- Consumes: `/api/tokens` endpoints from Task 5.
- Produces: `useTokens(): { tokens: Ref<ApiToken[]>; loading: Ref<boolean>; error: Ref<string | null>; fetchTokens(): Promise<void>; createToken(name: string): Promise<string | null>; revokeToken(id: number): Promise<boolean>; clearError(): void }`

- [ ] **Step 1: Append types to `src/types/index.ts`**

```ts
export interface ApiToken {
  id: number
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export interface CreatedApiToken {
  token: string
  record: ApiToken
}
```

- [ ] **Step 2: Create `src/composables/useTokens.ts`**

```ts
import { ref } from 'vue'
import type { ApiToken, CreatedApiToken, ApiResponse } from '../types'

const API_BASE = '/api/tokens'

export function useTokens() {
  const tokens = ref<ApiToken[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTokens() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(API_BASE)
      const data: ApiResponse<ApiToken[]> = await response.json()

      if (data.success && data.data) {
        tokens.value = data.data
      } else {
        error.value = data.error || 'Failed to fetch tokens'
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Fetch tokens error:', e)
    } finally {
      loading.value = false
    }
  }

  // Returns the raw token. It is shown once and never stored in state.
  async function createToken(name: string): Promise<string | null> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data: ApiResponse<CreatedApiToken> = await response.json()

      if (data.success && data.data) {
        tokens.value = [data.data.record, ...tokens.value]
        return data.data.token
      } else {
        error.value = data.error || 'Failed to create token'
        return null
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Create token error:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  async function revokeToken(id: number): Promise<boolean> {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      const data: ApiResponse<never> = await response.json()

      if (data.success) {
        await fetchTokens()
        return true
      } else {
        error.value = data.error || 'Failed to revoke token'
        return false
      }
    } catch (e) {
      error.value = 'Network error. Please try again.'
      console.error('Revoke token error:', e)
      return false
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    tokens,
    loading,
    error,
    fetchTokens,
    createToken,
    revokeToken,
    clearError,
  }
}
```

- [ ] **Step 3: Create `src/components/TokenManager.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTokens } from '../composables/useTokens'
import type { ApiToken } from '../types'

const { tokens, loading, error, fetchTokens, createToken, revokeToken, clearError } = useTokens()

const name = ref('')
const newToken = ref<string | null>(null)
const copied = ref(false)

onMounted(() => {
  fetchTokens()
})

async function handleCreate() {
  const token = await createToken(name.value.trim())
  if (token) {
    newToken.value = token
    name.value = ''
  }
}

async function copyToken() {
  if (!newToken.value) return
  await navigator.clipboard.writeText(newToken.value)
  copied.value = true
}

function closeTokenDialog() {
  newToken.value = null
  copied.value = false
}

async function handleRevoke(token: ApiToken) {
  if (confirm(`Revoke "${token.name}"? Agents using it will stop working immediately.`)) {
    await revokeToken(token.id)
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never'
  // D1 returns UTC timestamps without a timezone marker
  return new Date(dateString.replace(' ', 'T') + 'Z').toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="mt-10">
    <div class="mb-4">
      <h2 class="text-lg font-semibold text-gray-900">API Tokens</h2>
      <p class="text-sm text-gray-500">
        Tokens let AI agents manage links through the MCP endpoint at <code class="text-gray-700">/mcp</code>.
      </p>
    </div>

    <!-- Error Alert -->
    <div
      v-if="error"
      class="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between"
    >
      <span>{{ error }}</span>
      <button @click="clearError" class="text-red-500 hover:text-red-700">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Create Form -->
    <form @submit.prevent="handleCreate" class="mb-4 flex flex-col sm:flex-row gap-3">
      <input
        v-model="name"
        type="text"
        required
        maxlength="50"
        placeholder="Token name, e.g. hermes"
        class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        type="submit"
        :disabled="loading || !name.trim()"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
      >
        Create Token
      </button>
    </form>

    <!-- Token List -->
    <div class="bg-white shadow-sm rounded-lg overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Used</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-if="tokens.length === 0">
            <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
              No tokens yet. Create one to connect an AI agent.
            </td>
          </tr>
          <tr v-for="token in tokens" :key="token.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ token.name }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{{ token.prefix }}…</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(token.created_at) }}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(token.last_used_at) }}</td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span
                v-if="token.revoked_at"
                class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600"
              >Revoked</span>
              <span
                v-else
                class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700"
              >Active</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
              <button
                v-if="!token.revoked_at"
                @click="handleRevoke(token)"
                :disabled="loading"
                class="text-red-600 hover:text-red-900 disabled:opacity-50"
              >
                Revoke
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- One-time Token Dialog -->
    <div v-if="newToken" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-900">Copy your new token</h2>
        </div>
        <div class="p-6 space-y-4">
          <p class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You won't see this token again. Store it in your agent's config now.
          </p>
          <code class="block w-full break-all bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono text-gray-900">{{ newToken }}</code>
          <div class="flex justify-end space-x-3">
            <button
              @click="copyToken"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {{ copied ? 'Copied' : 'Copy' }}
            </button>
            <button
              @click="closeTokenDialog"
              class="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 4: Render it in `src/views/AdminDashboard.vue`**

Add the import after the `AnalyticsModal` import:

```ts
import TokenManager from '../components/TokenManager.vue'
```

Replace:

```vue
        @copy="copyToClipboard"
      />
    </main>
```

with:

```vue
        @copy="copyToClipboard"
      />

      <!-- API Tokens -->
      <TokenManager />
    </main>
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ built`, no `vue-tsc` errors.

- [ ] **Step 6: Manual check in the browser**

1. Run: `npm run db:init` (adds `api_tokens` to the local D1)
2. Run: `npm run dev:wrangler`
3. Open `http://localhost:8788/admin`
4. Create a token named `local`. Expected: dialog shows `lsk_…` with a Copy button and the "You won't see this token again" warning.
5. Click **Done**. Expected: row shows name `local`, the 8-char prefix, Last Used `Never`, status `Active`.
6. In a second terminal, call MCP with the copied token:

```bash
curl -s -X POST http://localhost:8788/mcp \
  -H "Authorization: Bearer lsk_PASTE_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_short_link","arguments":{"url":"https://example.com","slug":"local-test"}}}'
```

Expected: JSON containing `"short_url": "http://localhost:8788/local-test"`. Opening `http://localhost:8788/local-test` redirects to `https://example.com`.

7. Reload `/admin`. Expected: `local-test` in the links table; token Last Used is no longer `Never`.
8. Click **Revoke** and confirm. Expected: status `Revoked`, no Revoke button. Re-running the curl returns `{"error":"Unauthorized"}`.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/composables/useTokens.ts src/components/TokenManager.vue src/views/AdminDashboard.vue
git commit -m "feat: add API token management to admin dashboard"
```

---

### Task 8: Documentation for open-source users

**Files:**
- Modify: `README.md` (full replacement), `docs/06-ZERO-TRUST.md`, `docs/README.md`
- Create: `docs/09-MCP.md`

- [ ] **Step 1: Replace `README.md`**

````markdown
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

> **Upgrading an existing install?** Re-run `npm run db:init:remote`. Every statement uses `IF NOT EXISTS`, so it only adds the new `api_tokens` table and leaves your links untouched.

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

- Add **both** `admin` and `api` paths to your Cloudflare Access application. See [docs/06-ZERO-TRUST.md](docs/06-ZERO-TRUST.md).
- Do **not** put `/mcp` behind Access. It is protected by bearer tokens.
- Tokens are stored as SHA-256 hashes. Only the first 8 characters are kept for display.
- Optional: add a Cloudflare WAF rate-limiting rule for `/mcp` (see [docs/09-MCP.md](docs/09-MCP.md)).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request. Run `npm test` and `npm run typecheck:worker` before opening a PR.

## License

[MIT](LICENSE)
````

- [ ] **Step 2: Create `docs/09-MCP.md`**

````markdown
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
````

- [ ] **Step 3: Update `docs/06-ZERO-TRUST.md`**

3a. In section **4. Configure the Application**, replace the `Click **Next**.` line that directly follows the `admin` path table with:

````markdown
Then add a second path for the API. Click **Add domain** (or **+ Add public hostname**) and fill in:

| Field | Value |
|-------|-------|
| Subdomain | `go` |
| Domain | Select `yourdomain.com` |
| Path | `api` |

> ⚠️ **Protect `api` as well as `admin`.** The dashboard calls `/api/links` and `/api/tokens` from your browser, so they share the same login. If `/api` is public, anyone can edit your links and create MCP tokens.
>
> Do **not** add `mcp`. The MCP endpoint uses its own bearer tokens (see [09-MCP.md](./09-MCP.md)).

Click **Next**.
````

3b. In section **7. Test Access**, after `6. You're now logged into the admin dashboard!`, add:

````markdown
7. Open a private/incognito window and visit `https://go.yourdomain.com/api/links`. You should be redirected to the Access login page, not see JSON.
8. In the same private window, visit `https://go.yourdomain.com/api/tokens`. It should also redirect to the login page.

If `/api/links` or `/api/tokens` returns JSON in a private window, the `api` path is not protected. Recheck step 4 (if your dashboard does not cover sub-paths with `api`, use `api/*`).
````

3c. In the **Checklist**, after `- [ ] Application for admin is created`, add:

````markdown
- [ ] `api` path added to the same application
- [ ] `/api/links` redirects to login in a private window
````

- [ ] **Step 4: Update `docs/README.md`**

4a. In the file tree, replace `│   └── 08-TROUBLESHOOTING.md      # Common error solutions` with:

```
│   ├── 08-TROUBLESHOOTING.md      # Common error solutions
│   └── 09-MCP.md                  # Connect AI agents via MCP
```

4b. In the "Why This Link Shortener?" table, after the `| **Secure** |` row, add:

```markdown
| **AI-Ready** | MCP server lets AI agents create and manage links |
```

4c. In the Documentation table, after the `08-TROUBLESHOOTING.md` row, add:

```markdown
| [09-MCP.md](./09-MCP.md) | Connect AI agents (Hermes, Claude, and more) via MCP |
```

- [ ] **Step 5: Final verification**

Run: `npm test && npm run typecheck:worker && npm run build`
Expected: 39 tests pass, type-check exits 0, build prints `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/06-ZERO-TRUST.md docs/09-MCP.md docs/README.md
git commit -m "docs: document MCP server, API tokens, and securing /api"
```

---

### Task 9: Deploy and connect Hermes (requires the owner's approval at each step)

Production project: Pages `link-shortener` (`go.fonti.dev`), D1 `link-shortener-db`. **Each step below changes production. Ask the owner before running it.** Order matters: `/api` must be behind Access before the token endpoints go live.

- [ ] **Step 1: Protect `/api` with Cloudflare Access (owner, dashboard)**

Wrangler's OAuth login has no Zero Trust permissions, so this is done in the dashboard (or via the Cloudflare API MCP plugin after the owner authorizes it):
Zero Trust → Access → Applications → the `go.fonti.dev` admin app → add path `api`.

Verify: private window → `https://go.fonti.dev/api/links` redirects to the Access login. Do not continue until it does.

- [ ] **Step 2: Add the `api_tokens` table to production D1**

Run: `npm run db:init:remote`
Expected: success; existing links untouched.

Verify: `npx wrangler d1 execute link-shortener-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`
Expected: output includes `links`, `clicks`, `api_tokens`.

- [ ] **Step 3: Deploy**

Run: `npm run deploy`
Expected: deployment URL printed.

Verify:
- `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://go.fonti.dev/mcp` → `401`
- `curl -s -o /dev/null -w "%{http_code}\n" https://go.fonti.dev/mcp` → `405`

- [ ] **Step 4: Create the Hermes token (owner)**

`https://go.fonti.dev/admin` → API Tokens → name `hermes` → Create → copy the token.

- [ ] **Step 5: Configure Hermes (owner)**

`~/.hermes/.env`:

```bash
LINK_SHORTENER_TOKEN=lsk_PASTE_TOKEN
```

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  link_shortener:
    url: "https://go.fonti.dev/mcp"
    headers:
      Authorization: "Bearer ${LINK_SHORTENER_TOKEN}"
```

Restart Hermes.

- [ ] **Step 6: End-to-end check via Telegram (owner)**

Send the bot: `shorten https://example.com`
Expected: reply with a `https://go.fonti.dev/xxxxxx` link that redirects to `https://example.com`; the `hermes` token's Last Used updates in `/admin`.

- [ ] **Step 7: Push and open PR (owner approval)**

```bash
git push -u origin feat/mcp-server
gh pr create --title "Add MCP server and API token management" --body "Adds a token-protected MCP endpoint at /mcp with 5 link tools, API token management in /admin, shared lib/ for link logic, a Vitest suite in workerd, and docs. Requires /api to be behind Cloudflare Access before deploy (see docs/06-ZERO-TRUST.md)."
```
