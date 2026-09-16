import type { Env } from '../../../lib/env'
import { LinkError, createLink, listLinks } from '../../../lib/links'

interface CreateLinkBody {
  slug?: string
  destination_url: string
}

// GET /api/links - List all links
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const links = await listLinks(context.env.DB)
    return Response.json({ success: true, data: links })
  } catch (error) {
    console.error('Error fetching links:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch links' },
      { status: 500 }
    )
  }
}

const CREATE_ERRORS: Partial<Record<LinkError['code'], [number, string]>> = {
  invalid_url: [400, 'Invalid destination URL. Must be a valid HTTP(S) URL.'],
  invalid_slug: [400, 'Invalid slug. Must be 3-50 alphanumeric characters or hyphens, and not a reserved word.'],
  slug_taken: [409, 'Slug already exists. Please choose a different one.'],
  slug_generation_failed: [500, 'Failed to generate unique slug. Please try again.'],
}

// POST /api/links - Create a new link
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<CreateLinkBody>()
    const link = await createLink(context.env.DB, body)
    return Response.json({ success: true, data: link }, { status: 201 })
  } catch (error) {
    const mapped = error instanceof LinkError ? CREATE_ERRORS[error.code] : undefined
    if (mapped) {
      return Response.json({ success: false, error: mapped[1] }, { status: mapped[0] })
    }
    console.error('Error creating link:', error)
    return Response.json(
      { success: false, error: 'Failed to create link' },
      { status: 500 }
    )
  }
}
