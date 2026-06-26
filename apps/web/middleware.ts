import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = ['/_next', '/favicon', '/public', '/api']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Não bloqueia nada no middleware — deixa o client verificar a sessão via Supabase
  // (que usa localStorage, não cookies). Cada página se encarrega de redirecionar
  // para /login se não tiver sessão válida.
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)'],
}
