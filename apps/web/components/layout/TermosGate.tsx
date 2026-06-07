'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { TermosDeUsoModal, VERSAO_TERMOS } from './TermosDeUsoModal'

/**
 * Verifica se o usuário logado já aceitou a versão vigente do Termo de Uso.
 * Se não aceitou (primeiro acesso ou termo revisado), bloqueia a navegação
 * com o modal até o aceite ser registrado em `usuarios.termos_aceitos_em`.
 */
export function TermosGate() {
  const [precisaAceitar, setPrecisaAceitar] = useState(false)
  const [verificado, setVerificado] = useState(false)

  async function verificar() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVerificado(true); return }

    const { data } = await supabase
      .from('usuarios')
      .select('termos_versao_aceita')
      .eq('id', user.id)
      .single()

    setPrecisaAceitar(!data || data.termos_versao_aceita !== VERSAO_TERMOS)
    setVerificado(true)
  }

  useEffect(() => { verificar() }, [])

  if (!verificado) return null

  return (
    <TermosDeUsoModal
      visible={precisaAceitar}
      onAceitar={() => setPrecisaAceitar(false)}
    />
  )
}
