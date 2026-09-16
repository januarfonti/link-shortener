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
    env.DB.prepare('DELETE FROM api_tokens'),
  ])
})
