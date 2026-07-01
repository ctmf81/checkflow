'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

// Perfil de sistema "Operação" — acesso somente ao ambiente de operação.
// Usuários com este perfil não podem entrar em /gestao; são redirecionados
// para /operacao automaticamente.
const PERFIL_OPERACAO_ID = '00000000-0000-0000-0000-000000000003'

export function GestaoGuard() {
  const router = useRouter()
  const { empresaAtiva } = useSession()

  useEffect(() => {
    if (!empresaAtiva) return
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      if (user.user_metadata?.role === 'admin_sistema') return

      const { data: vinculo } = await supabase
        .from('usuario_empresa')
        .select('perfil_id')
        .eq('usuario_id', user.id)
        .eq('empresa_id', empresaAtiva.id)
        .maybeSingle()

      if (vinculo?.perfil_id === PERFIL_OPERACAO_ID) {
        router.replace('/operacao')
      }
    })
  }, [empresaAtiva])

  return null
}
