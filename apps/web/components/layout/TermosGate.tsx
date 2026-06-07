'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { TermosDeUsoModal } from './TermosDeUsoModal'

/**
 * Verifica se o usuário logado já aceitou a versão vigente do Termo de Uso
 * (registro mais recente de `termos_uso`, único para todas as empresas,
 * editável pelo admin do sistema em /sistema/termos).
 * Se não aceitou (primeiro acesso ou termo revisado), bloqueia a navegação
 * com o modal até o aceite ser registrado em `usuarios.termos_aceitos_em`.
 */
export function TermosGate() {
  const [termo, setTermo] = useState<{ texto: string; versao: string } | null>(null)
  const [precisaAceitar, setPrecisaAceitar] = useState(false)
  const [verificado, setVerificado] = useState(false)

  async function verificar() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVerificado(true); return }

    const [{ data: vigente }, { data: usuario }] = await Promise.all([
      supabase.from('termos_uso').select('texto, versao').order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('usuarios').select('termos_versao_aceita').eq('id', user.id).single(),
    ])

    if (vigente) {
      setTermo(vigente)
      setPrecisaAceitar(!usuario || usuario.termos_versao_aceita !== vigente.versao)
    }
    setVerificado(true)
  }

  useEffect(() => { verificar() }, [])

  if (!verificado || !termo) return null

  return (
    <TermosDeUsoModal
      visible={precisaAceitar}
      texto={termo.texto}
      versao={termo.versao}
      onAceitar={() => setPrecisaAceitar(false)}
    />
  )
}
