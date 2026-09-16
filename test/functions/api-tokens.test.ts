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
