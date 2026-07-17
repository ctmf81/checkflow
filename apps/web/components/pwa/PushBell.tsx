'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { pushSuportado, pushConfigurado, estaInscrito, inscrever, permissaoAtual, sincronizarInscricao } from '@/lib/push'

// Sino no cabeçalho: lembrete permanente para ativar o push.
// - Push indisponível/não configurado → não renderiza (sem ruído).
// - Desligado → sino cinza com pontinho laranja; um toque ativa.
// - Ligado → sino laranja (status "ativo"), sem ação.
export function PushBell() {
  const [estado, setEstado] = useState<'carregando' | 'off' | 'on' | 'oculto'>('carregando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!pushSuportado() || !pushConfigurado()) { setEstado('oculto'); return }
    estaInscrito().then(v => {
      setEstado(v ? 'on' : 'off')
      // Se o aparelho já está inscrito, garante que a inscrição pertence ao
      // usuário logado agora (resolve troca de login no mesmo dispositivo).
      if (v) sincronizarInscricao()
    })
  }, [])

  if (estado === 'oculto' || estado === 'carregando') return null

  const bloqueado = permissaoAtual() === 'denied'

  async function ativar() {
    if (ocupado || bloqueado) return
    setOcupado(true)
    const r = await inscrever()
    setOcupado(false)
    if (r.ok) setEstado('on')
  }

  if (estado === 'on') {
    return (
      <div title="Notificações ativas neste aparelho" className="shrink-0 p-1.5 text-orange-500">
        <Bell size={18} />
      </div>
    )
  }

  return (
    <button onClick={ativar} disabled={ocupado || bloqueado}
      title={bloqueado
        ? 'Notificações bloqueadas no navegador — libere nas permissões do site'
        : 'Ativar notificações neste aparelho'}
      className="relative shrink-0 p-1.5 text-gray-400 hover:text-orange-500 transition-colors disabled:opacity-60">
      <Bell size={18} />
      {!bloqueado && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-white" />}
    </button>
  )
}
