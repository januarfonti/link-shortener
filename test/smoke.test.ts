import { env } from 'cloudflare:test'
import { expect, it } from 'vitest'

it('has the schema applied to the test database', async () => {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM links').first<{ count: number }>()
  expect(row?.count).toBe(0)
})
