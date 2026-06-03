import { NextResponse, type NextRequest } from 'next/server'

const AUTH_ROUTES = ['/login', '/recuperar-senha', '/nova-senha']
const PUBLIC_PREFIXES = ['/_next', '/favicon', '/public']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const isAuthRoute = AUTH_ROUTES.some(r => pathname.startsWith(r))

  // Supabase armazena a sessão neste cookie
  const projectRef = 'pswdjdlirylxgscohcfi'
  const sessionCookie =
    request.cookies.get(`sb-${projectRef}-auth-token`) ??
    request.cookies.get(`sb-${projectRef}-auth-token.0`)

  const isLoggedIn = !!sessionCookie

  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isLoggedIn && pathname === '/login') {
    return NextResponse.redirect(new URL('/gestao/empresas', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
}
