import { NextResponse, type NextRequest } from 'next/server'

const AUTH_ROUTES = ['/login', '/recuperar-senha', '/nova-senha', '/primeiro-acesso']
const PUBLIC_PREFIXES = ['/_next', '/favicon', '/public']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const isAuthRoute = AUTH_ROUTES.some(r => pathname.startsWith(r))

  // Busca qualquer cookie de sessão do Supabase
  const allCookies = request.cookies.getAll()
  const isLoggedIn = allCookies.some(
    c => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  )

  if (!isLoggedIn && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
}
