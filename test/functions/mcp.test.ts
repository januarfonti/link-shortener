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
