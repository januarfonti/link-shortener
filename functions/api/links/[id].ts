import type { Env } from '../../../lib/env'
import { LinkError, deleteLink, getLinkById, getRecentClicks, updateLink } from '../../../lib/links'

interface UpdateLinkBody {
  slug?: string
  destination_url?: string
}

function notFound(): Response {
  return Response.json(
    { success: false, error: 'Link not found' },
    { status: 404 }
  )
}

// GET /api/links/:id - Get link with analytics
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  try {
    const link = await getLinkById(context.env.DB, id)
    const clicks = await getRecentClicks(context.env.DB, id, 100)

    return Response.json({
      success: true,
      data: {
        ...link,
        recent_clicks: clicks
      }
    })
  } catch (error) {
    if (error instanceof LinkError && error.code === 'not_found') return notFound()
    console.error('Error fetching link:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch link' },
      { status: 500 }
    )
  }
}

const UPDATE_ERRORS: Partial<Record<LinkError['code'], [number, string]>> = {
  not_found: [404, 'Link not found'],
  invalid_url: [400, 'Invalid destination URL'],
  invalid_slug: [400, 'Invalid slug'],
  slug_taken: [409, 'Slug already exists'],
  no_changes: [400, 'No valid fields to update'],
}

// PUT /api/links/:id - Update a link
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  try {
    const body = await context.request.json<UpdateLinkBody>()
    const link = await updateLink(context.env.DB, id, {
      destination_url: body.destination_url,
      slug: body.slug,
    })
    return Response.json({ success: true, data: link })
  } catch (error) {
    const mapped = error instanceof LinkError ? UPDATE_ERRORS[error.code] : undefined
    if (mapped) {
      return Response.json({ success: false, error: mapped[1] }, { status: mapped[0] })
    }
    console.error('Error updating link:', error)
    return Response.json(
      { success: false, error: 'Failed to update link' },
      { status: 500 }
    )
  }
}

// DELETE /api/links/:id - Delete a link
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = context.params.id as string

  try {
    // Clicks are cascade deleted
    await deleteLink(context.env.DB, id)
    return Response.json({ success: true, data: { id } })
  } catch (error) {
    if (error instanceof LinkError && error.code === 'not_found') return notFound()
    console.error('Error deleting link:', error)
    return Response.json(
      { success: false, error: 'Failed to delete link' },
      { status: 500 }
    )
  }
}
