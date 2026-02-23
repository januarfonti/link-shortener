const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequest: PagesFunction = async (context) => {
  // Handle preflight requests
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  try {
    const response = await context.next()

    // Add CORS headers to all responses
    const newHeaders = new Headers(response.headers)
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value)
    })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  } catch (error) {
    console.error('Middleware error:', error)
    return Response.json(
      { success: false, error: 'Internal server error' },
      {
        status: 500,
        headers: corsHeaders,
      }
    )
  }
}
