import { NextResponse, type NextRequest } from 'next/server'

const AUTH_ROUTES = ['/login', '/recuperar-senha', '/nova-senha', '/primeiro-acesso']
// Rotas de API autenticam por header `Authorization: Bearer <token>` (a sessão
// do Supabase fica em localStorage, não em cookie). Não devem ser redirecionadas
// para /login pelo middleware — cada rota valida o próprio token e responde 401.
const PUBLIC_PREFIXES = ['/_next', '/favicon', '/public', '/api']

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
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)'],
}
