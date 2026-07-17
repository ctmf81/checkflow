'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, Send } from 'lucide-react'
import { pushSuportado, pushConfigurado, estaInscrito, inscrever, desinscrever, permissaoAtual } from '@/lib/push'
import { apiFetch } from '@/lib/apiClient'

// Controle de notificações push DESTE aparelho. Reutilizado nas Configurações.
export function PushToggle() {
  const [inscrito, setInscrito] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [testando, setTestando] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')

  useEffect(() => { estaInscrito().then(v => { setInscrito(v); setCarregando(false) }) }, [])

  async function testar() {
    setTestando(true); setDiagnostico('')
    try {
      const res = await apiFetch('/push/testar', { method: 'POST' })
      const j = await res.json()
      if (!j.vapid_configurado) setDiagnostico('⚠️ Servidor sem chaves VAPID (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY na API).')
      else if ((j.inscricoes ?? 0) === 0) setDiagnostico('⚠️ Nenhuma inscrição salva para você. Ative novamente neste aparelho.')
      else if ((j.erros?.length ?? 0) > 0) setDiagnostico(`⚠️ Erro no envio: ${j.erros[0]}`)
      else if ((j.enviados ?? 0) > 0) setDiagnostico('✅ Enviado! A notificação deve aparecer na área de notificações do aparelho em alguns segundos.')
      else setDiagnostico('⚠️ Nada enviado (0). Verifique a inscrição.')
    } catch {
      setDiagnostico('⚠️ Não foi possível chamar o servidor de teste.')
    }
    setTestando(false)
  }

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
      {inscrito && !erro && (
        <>
          <p className="text-xs text-green-600 mt-1.5">Ativado — este aparelho receberá alertas de tickets, planos de ação e tarefas.</p>
          <button onClick={testar} disabled={testando}
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            {testando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Enviar notificação de teste
          </button>
          {diagnostico && <p className="text-xs text-gray-600 mt-1.5">{diagnostico}</p>}
        </>
      )}
    </div>
  )
}
