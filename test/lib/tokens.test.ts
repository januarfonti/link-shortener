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
