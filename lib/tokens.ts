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
