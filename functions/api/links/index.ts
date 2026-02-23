interface Env {
  DB: D1Database
}

interface Link {
  id: number
  slug: string
  destination_url: string
  created_at: string
  updated_at: string
  click_count: number
}

interface CreateLinkBody {
  slug?: string
  destination_url: string
}

const RESERVED_SLUGS = ['admin', 'api', 'static', 'assets', '_headers', '_redirects']

function generateSlug(length: number = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

function isValidSlug(slug: string): boolean {
  // 3-50 chars, alphanumeric + hyphens, no reserved words
  const slugRegex = /^[a-zA-Z0-9-]{3,50}$/
  return slugRegex.test(slug) && !RESERVED_SLUGS.includes(slug.toLowerCase())
}

// GET /api/links - List all links
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { results } = await context.env.DB.prepare(
      'SELECT * FROM links ORDER BY created_at DESC'
    ).all<Link>()

    return Response.json({ success: true, data: results })
  } catch (error) {
    console.error('Error fetching links:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch links' },
      { status: 500 }
    )
  }
}

// POST /api/links - Create a new link
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<CreateLinkBody>()

    // Validate destination URL
    if (!body.destination_url || !isValidUrl(body.destination_url)) {
      return Response.json(
        { success: false, error: 'Invalid destination URL. Must be a valid HTTP(S) URL.' },
        { status: 400 }
      )
    }

    // Generate or validate slug
    let slug = body.slug?.trim()

    if (slug) {
      // Validate custom slug
      if (!isValidSlug(slug)) {
        return Response.json(
          { success: false, error: 'Invalid slug. Must be 3-50 alphanumeric characters or hyphens, and not a reserved word.' },
          { status: 400 }
        )
      }

      // Check if slug already exists
      const existing = await context.env.DB.prepare(
        'SELECT id FROM links WHERE slug = ?'
      ).bind(slug).first()

      if (existing) {
        return Response.json(
          { success: false, error: 'Slug already exists. Please choose a different one.' },
          { status: 409 }
        )
      }
    } else {
      // Generate unique slug
      let attempts = 0
      const maxAttempts = 10

      while (attempts < maxAttempts) {
        slug = generateSlug()
        const existing = await context.env.DB.prepare(
          'SELECT id FROM links WHERE slug = ?'
        ).bind(slug).first()

        if (!existing) break
        attempts++
      }

      if (attempts >= maxAttempts) {
        return Response.json(
          { success: false, error: 'Failed to generate unique slug. Please try again.' },
          { status: 500 }
        )
      }
    }

    // Insert the new link
    const result = await context.env.DB.prepare(
      'INSERT INTO links (slug, destination_url) VALUES (?, ?) RETURNING *'
    )
      .bind(slug, body.destination_url)
      .first<Link>()

    return Response.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    console.error('Error creating link:', error)
    return Response.json(
      { success: false, error: 'Failed to create link' },
      { status: 500 }
    )
  }
}
