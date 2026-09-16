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
