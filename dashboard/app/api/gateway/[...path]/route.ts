import { getSession } from '@auth0/nextjs-auth0'
import { NextRequest, NextResponse } from 'next/server'

const DASHBOARD_ROUTES: Record<string, string[]> = {
  GET: [
    '/v1/budgets', '/v1/budgets/spend', '/v1/analytics/spend', '/v1/analytics/models',
    '/v1/api-keys', '/v1/agents', '/v1/audit-logs', '/v1/providers/health',
    '/v1/settings', '/v1/members',
  ],
  POST: ['/v1/budgets', '/v1/api-keys', '/v1/invitations'],
  PUT: ['/v1/settings'],
  DELETE: [],
}

function isAllowedRoute(method: string, path: string[]): boolean {
  const pathname = `/${path.join('/')}`
  if ((DASHBOARD_ROUTES[method] ?? []).includes(pathname)) return true
  if (method === 'DELETE' && /^\/v1\/(api-keys|members)\/[0-9a-f-]{36}$/i.test(pathname)) return true
  if (method === 'POST' && /^\/v1\/agents\/[a-zA-Z0-9._:-]{1,200}\/terminate$/.test(pathname)) return true
  return false
}

async function handler(request: NextRequest, context: { params: { path: string[] } }) {
  const session = await getSession()
  const user = session?.user
  if (!user?.email || user.email_verified !== true) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const allowedEmails = (process.env['DASHBOARD_ALLOWED_EMAILS'] ?? '')
    .split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
  if (allowedEmails.length === 0 || !allowedEmails.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const apiKey = process.env['TOKENSENTRY_DASHBOARD_API_KEY']
  const apiUrl = process.env['TOKENSENTRY_API_URL']
  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: 'GATEWAY_NOT_CONFIGURED' }, { status: 503 })
  }

  const method = request.method.toUpperCase()
  const path = context.params.path ?? []
  if (!isAllowedRoute(method, path) || path.some(segment => segment === '.' || segment === '..' || segment.includes('/'))) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    return NextResponse.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 })
  }

  if (method !== 'GET') {
    const origin = request.headers.get('origin')
    if (!origin || origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'CSRF_REJECTED' }, { status: 403 })
    }
  }

  const target = new URL(`/${path.join('/')}`, apiUrl)
  target.search = request.nextUrl.search
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 })
  }

  let body: string | undefined
  if (method !== 'GET') {
    body = await request.text()
    if (new TextEncoder().encode(body).byteLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 })
    }
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' } : {}),
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    })
    const headers = new Headers()
    const contentType = upstream.headers.get('content-type')
    if (contentType) headers.set('content-type', contentType)
    headers.set('cache-control', 'no-store')
    const callId = upstream.headers.get('x-call-id')
    if (callId) headers.set('x-call-id', callId)
    return new Response(upstream.body, { status: upstream.status, headers })
  } catch {
    return NextResponse.json({ error: 'GATEWAY_UNAVAILABLE' }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
