import type { Env } from '../../../lib/env'
import { TokenError, revokeToken } from '../../../lib/tokens'

// DELETE /api/tokens/:id - Revoke a token (kept in the list as revoked)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    await revokeToken(context.env.DB, context.params.id as string)
    return Response.json({ success: true })
  } catch (error) {
    if (error instanceof TokenError && error.code === 'not_found') {
      return Response.json(
        { success: false, error: 'Token not found' },
        { status: 404 }
      )
    }
    console.error('Error revoking token:', error)
    return Response.json(
      { success: false, error: 'Failed to revoke token' },
      { status: 500 }
    )
  }
}
