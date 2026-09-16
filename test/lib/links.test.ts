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
