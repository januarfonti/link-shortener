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

interface Click {
  id: number
  link_id: number
  clicked_at: string
  referrer: string | null
}

interface UpdateLinkBody {
  slug?: string
  destination_url?: string
}

const RESERVED_SLUGS = ['admin', 'api', 'static', 'assets', '_headers', '_redirects']

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

function isValidSlug(slug: string): boolean {
  const slugRegex = /^[a-zA-Z0-9-]{3,50}$/
  return slugRegex.test(slug) && !RESERVED_SLUGS.includes(slug.toLowerCase())
}

// GET /api/links/:id - Get link with analytics
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id

  try {
    // Get the link
    const link = await context.env.DB.prepare(
      'SELECT * FROM links WHERE id = ?'
    ).bind(id).first<Link>()

    if (!link) {
      return Response.json(
        { success: false, error: 'Link not found' },
        { status: 404 }
      )
    }

    // Get recent clicks (last 100)
    const { results: clicks } = await context.env.DB.prepare(
      'SELECT * FROM clicks WHERE link_id = ? ORDER BY clicked_at DESC LIMIT 100'
    ).bind(id).all<Click>()

    return Response.json({
      success: true,
      data: {
        ...link,
        recent_clicks: clicks
      }
    })
  } catch (error) {
    console.error('Error fetching link:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch link' },
      { status: 500 }
    )
  }
}

// PUT /api/links/:id - Update a link
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id

  try {
    const body = await context.request.json<UpdateLinkBody>()

    // Check if link exists
    const existing = await context.env.DB.prepare(
      'SELECT * FROM links WHERE id = ?'
    ).bind(id).first<Link>()

    if (!existing) {
      return Response.json(
        { success: false, error: 'Link not found' },
        { status: 404 }
      )
    }

    // Validate updates
    const updates: string[] = []
    const values: (string | number)[] = []

    if (body.destination_url !== undefined) {
      if (!isValidUrl(body.destination_url)) {
        return Response.json(
          { success: false, error: 'Invalid destination URL' },
          { status: 400 }
        )
      }
      updates.push('destination_url = ?')
      values.push(body.destination_url)
    }

    if (body.slug !== undefined) {
      const slug = body.slug.trim()
      if (!isValidSlug(slug)) {
        return Response.json(
          { success: false, error: 'Invalid slug' },
          { status: 400 }
        )
      }

      // Check if new slug already exists (on a different link)
      const slugExists = await context.env.DB.prepare(
        'SELECT id FROM links WHERE slug = ? AND id != ?'
      ).bind(slug, id).first()

      if (slugExists) {
        return Response.json(
          { success: false, error: 'Slug already exists' },
          { status: 409 }
        )
      }

      updates.push('slug = ?')
      values.push(slug)
    }

    if (updates.length === 0) {
      return Response.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Add updated_at
    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id as unknown as string)

    const result = await context.env.DB.prepare(
      `UPDATE links SET ${updates.join(', ')} WHERE id = ? RETURNING *`
    ).bind(...values).first<Link>()

    return Response.json({ success: true, data: result })
  } catch (error) {
    console.error('Error updating link:', error)
    return Response.json(
      { success: false, error: 'Failed to update link' },
      { status: 500 }
    )
  }
}

// DELETE /api/links/:id - Delete a link
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id

  try {
    // Check if link exists
    const existing = await context.env.DB.prepare(
      'SELECT id FROM links WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return Response.json(
        { success: false, error: 'Link not found' },
        { status: 404 }
      )
    }

    // Delete the link (clicks will be cascade deleted)
    await context.env.DB.prepare(
      'DELETE FROM links WHERE id = ?'
    ).bind(id).run()

    return Response.json({ success: true, data: { id } })
  } catch (error) {
    console.error('Error deleting link:', error)
    return Response.json(
      { success: false, error: 'Failed to delete link' },
      { status: 500 }
    )
  }
}
