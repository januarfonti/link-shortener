import type { Env } from '../../../lib/env'
import { TokenError, createToken, listTokens } from '../../../lib/tokens'

// GET /api/tokens - List API tokens (never includes hashes)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const tokens = await listTokens(context.env.DB)
    return Response.json({ success: true, data: tokens })
  } catch (error) {
    console.error('Error fetching tokens:', error)
    return Response.json(
      { success: false, error: 'Failed to fetch tokens' },
      { status: 500 }
    )
  }
}

// POST /api/tokens - Create a token; the raw token is only returned here
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json<{ name?: unknown }>()
    const name = typeof body.name === 'string' ? body.name : ''
    const result = await createToken(context.env.DB, name)
    return Response.json({ success: true, data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof TokenError && error.code === 'invalid_name') {
      return Response.json(
        { success: false, error: 'Invalid name. Must be 1-50 characters.' },
        { status: 400 }
      )
    }
    console.error('Error creating token:', error)
    return Response.json(
      { success: false, error: 'Failed to create token' },
      { status: 500 }
    )
  }
}
