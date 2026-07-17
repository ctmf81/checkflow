'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { pushSuportado, pushConfigurado, estaInscrito, inscrever, desinscrever, permissaoAtual } from '@/lib/push'

// Controle de notificações push DESTE aparelho. Reutilizado nas Configurações.
export function PushToggle() {
  const [inscrito, setInscrito] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { estaInscrito().then(v => { setInscrito(v); setCarregando(false) }) }, [])

  if (!pushSuportado()) {
    return <p className="text-xs text-gray-400">Este navegador não suporta notificações push. No iPhone, instale o app na tela inicial para ativar.</p>
  }
  if (!pushConfigurado()) {
    return <p className="text-xs text-amber-600">Notificações push ainda não configuradas no servidor.</p>
  }

  const bloqueado = permissaoAtual() === 'denied'

  async function alternar() {
    setOcupado(true); setErro('')
    if (inscrito) {
      await desinscrever(); setInscrito(false)
    } else {
      const r = await inscrever()
      if (r.ok) setInscrito(true)
      else setErro(r.motivo ?? 'Não foi possível ativar.')
    }
    setOcupado(false)
  }

  return (
    <div>
      <button onClick={alternar} disabled={ocupado || carregando || bloqueado}
        className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${inscrito ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-orange-500 text-white hover:bg-orange-600'}`}>
        {ocupado || carregando ? <Loader2 size={15} className="animate-spin" /> : inscrito ? <BellOff size={15} /> : <Bell size={15} />}
        {carregando ? 'Verificando...' : inscrito ? 'Desativar neste aparelho' : 'Ativar neste aparelho'}
      </button>
      {bloqueado && <p className="text-xs text-amber-600 mt-1.5">As notificações estão bloqueadas nas permissões do navegador. Libere para este site e tente de novo.</p>}
      {erro && <p className="text-xs text-red-500 mt-1.5">{erro}</p>}
      {inscrito && !erro && <p className="text-xs text-green-600 mt-1.5">Ativado — este aparelho receberá alertas de tickets, planos de ação e tarefas.</p>}
    </div>
  )
}
