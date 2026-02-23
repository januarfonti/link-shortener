interface Env {
  DB: D1Database
}

interface Link {
  id: number
  slug: string
  destination_url: string
}

const RESERVED_PATHS = ['admin', 'api', 'static', 'assets', '_headers', '_redirects']

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const path = url.pathname.slice(1) // Remove leading slash

  // Redirect root path to configured URL or serve SPA
  if (!path) {
    const rootRedirectUrl = (context.env as any).ROOT_REDIRECT_URL
    if (rootRedirectUrl) {
      return Response.redirect(rootRedirectUrl, 302)
    }
    return context.next()
  }

  // Skip reserved paths - let them be handled by the SPA or other functions
  if (RESERVED_PATHS.some(reserved => path.startsWith(reserved))) {
    return context.next()
  }

  try {
    // Look up the slug in the database
    const link = await context.env.DB.prepare(
      'SELECT id, slug, destination_url FROM links WHERE slug = ?'
    )
      .bind(path)
      .first<Link>()

    if (!link) {
      // Slug not found - let the SPA handle 404
      return context.next()
    }

    // Get referrer from request headers
    const referrer = context.request.headers.get('Referer') || null

    // Record the click and increment count in a single transaction
    await context.env.DB.batch([
      context.env.DB.prepare(
        'UPDATE links SET click_count = click_count + 1 WHERE id = ?'
      ).bind(link.id),
      context.env.DB.prepare(
        'INSERT INTO clicks (link_id, referrer) VALUES (?, ?)'
      ).bind(link.id, referrer),
    ])

    // Redirect to the destination URL
    return Response.redirect(link.destination_url, 302)
  } catch (error) {
    console.error('Redirect error:', error)
    return context.next()
  }
}
