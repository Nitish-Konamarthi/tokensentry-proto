import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = process.env['AUTH0_SESSION_COOKIE'] ?? 'appSession'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const publicPaths = ['/login', '/api/auth', '/api/proxy']
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Root path: redirect to /dashboard or login based on session
  if (pathname === '/') {
    const sessionCookie = req.cookies.get(SESSION_COOKIE)
    if (sessionCookie?.value) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('returnTo', '/dashboard')
    return NextResponse.redirect(loginUrl)
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE)

  if (!sessionCookie?.value) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/api/protected/:path*', '/api/proxy/:path*'],
}
