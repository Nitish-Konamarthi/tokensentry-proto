import { NextResponse, type NextRequest } from 'next/server'
import { auth0 } from './lib/auth0'

export async function middleware(request: NextRequest) {
  const authResponse = await auth0.middleware(request)
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/auth/')) return authResponse
  if (pathname !== '/' && !pathname.startsWith('/dashboard') && !pathname.startsWith('/api/gateway/')) {
    return authResponse
  }

  const session = await auth0.getSession(request)
  if (!session) {
    const loginUrl = new URL('/api/auth/login', request.url)
    loginUrl.searchParams.set('returnTo', `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  return authResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
