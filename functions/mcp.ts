import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker'
import type { Env } from '../lib/env'
import { registerTools } from '../lib/mcp-tools'
import { touchToken, verifyToken } from '../lib/tokens'

const SERVER_INFO = { name: 'link-shortener', version: '1.0.0' }

function unauthorized(): Response {
  return Response.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
  )
}

// POST /mcp - MCP Streamable HTTP endpoint (stateless, JSON responses)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const match = /^Bearer\s+(\S+)$/i.exec(context.request.headers.get('Authorization') ?? '')
  if (!match) return unauthorized()

  try {
    const token = await verifyToken(context.env.DB, match[1])
    if (!token) return unauthorized()

    context.waitUntil(touchToken(context.env.DB, token.id))

    // A fresh server and transport per request: stateless mode cannot reuse a transport
    const server = new McpServer(SERVER_INFO, { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() })
    registerTools(server, { db: context.env.DB, origin: new URL(context.request.url).origin })

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    return await transport.handleRequest(context.request)
  } catch (error) {
    // Never log the Authorization header or the raw token
    console.error('MCP endpoint error:', error instanceof Error ? error.message : 'unknown error')
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}

function methodNotAllowed(): Response {
  return Response.json(
    { error: 'Method Not Allowed' },
    { status: 405, headers: { Allow: 'POST' } }
  )
}

export const onRequestGet: PagesFunction<Env> = async () => methodNotAllowed()
export const onRequestDelete: PagesFunction<Env> = async () => methodNotAllowed()
