'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Send, Check, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase'

// Modal do GESTOR para convidar um operador ao Telegram: mostra o link/QR do
// usuário-alvo para o gestor compartilhar (ou o operador ler o QR na hora).
export function ConviteTelegramModal({ usuarioId, usuarioNome, onClose }: {
  usuarioId: string; usuarioNome: string; onClose: () => void
}) {
  const [carregando, setCarregando] = useState(true)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [vinculado, setVinculado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/telegram/convite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ usuarioId }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) setErro(j?.message ?? 'Falha ao gerar o convite.')
      else { setDeepLink(j.deepLink); setVinculado(j.vinculado) }
      setCarregando(false)
    })()
  }, [usuarioId])

  function copiar() {
    if (!deepLink) return
    navigator.clipboard.writeText(deepLink)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-sky-500" />
            <h3 className="text-sm font-semibold text-gray-800">Convidar para o Telegram</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
        </div>

        <div className="px-5 py-5">
          {carregando ? (
            <p className="text-sm text-gray-400 text-center py-8">Gerando convite…</p>
          ) : erro ? (
            <p className="text-sm text-red-500 text-center py-6">{erro}</p>
          ) : vinculado ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check size={22} className="text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">{usuarioNome} já está conectado</p>
              <p className="text-xs text-gray-500 mt-1">Este usuário já recebe avisos pelo Telegram.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Envie o link abaixo para <strong>{usuarioNome}</strong> (ou peça para ler o QR). Ao tocar em <strong>Iniciar</strong> no bot, o Telegram dele conecta sozinho.
              </p>
              <div className="flex flex-col items-center mt-4">
                <div className="bg-white p-2 rounded-lg border border-gray-100">
                  {deepLink && <QRCodeSVG value={deepLink} size={160} level="M" includeMargin />}
                </div>
                <button onClick={copiar} className="mt-3 w-full py-2.5 bg-sky-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-sky-600 transition-colors">
                  {copiado ? <><Check size={15} />Link copiado</> : <><Copy size={15} />Copiar link do convite</>}
                </button>
                <p className="text-[11px] text-gray-400 text-center mt-3">O link é pessoal deste usuário — não reutilize para outra pessoa.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
