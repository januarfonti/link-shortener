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
