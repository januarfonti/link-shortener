import { env } from 'cloudflare:test'
import type { Env } from '../lib/env'

type Context = Parameters<PagesFunction<Env>>[0]

export function makeContext(request: Request, params: Record<string, string> = {}) {
  const pending: Promise<unknown>[] = []
  const context = {
    request,
    env,
    params,
    data: {},
    functionPath: new URL(request.url).pathname,
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise)
    },
    passThroughOnException: () => {},
    next: async () => new Response('next', { status: 404 }),
  } as unknown as Context
  return { context, settle: () => Promise.all(pending) }
}

export function jsonRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://go.example.com${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
