'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Send, Check, Smartphone, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase'

// Modal "Conectar Telegram" — fluxo do usuário final: 2 toques, zero digitação.
// Abre → chama /api/telegram/vincular (garante o código e o deep link) →
// mostra botão "Abrir no Telegram" + QR. Faz polling até o webhook confirmar o
// vínculo (o usuário deu /start no bot).
export function ConectarTelegramModal({ onClose }: { onClose: () => void }) {
  const [carregando, setCarregando] = useState(true)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [vinculado, setVinculado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const token = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? ''
  }, [])

  const consultar = useCallback(async () => {
    const res = await fetch('/api/telegram/vincular', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}` },
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) { setErro(json?.message ?? 'Falha ao gerar o link.'); return null }
    return json as { deepLink: string; vinculado: boolean }
  }, [token])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const j = await consultar()
      if (!vivo || !j) { setCarregando(false); return }
      setDeepLink(j.deepLink)
      setVinculado(j.vinculado)
      setCarregando(false)
      // Enquanto não vinculado, verifica a cada 3s se o /start chegou.
      if (!j.vinculado) {
        pollRef.current = setInterval(async () => {
          const jj = await consultar()
          if (jj?.vinculado) {
            setVinculado(true)
            if (pollRef.current) clearInterval(pollRef.current)
          }
        }, 3000)
      }
    })()
    return () => { vivo = false; if (pollRef.current) clearInterval(pollRef.current) }
  }, [consultar])

  async function desconectar() {
    setCarregando(true)
    await fetch('/api/telegram/vincular', { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } })
    setVinculado(false)
    const j = await consultar()
    if (j) setDeepLink(j.deepLink)
    setCarregando(false)
  }

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
            <h3 className="text-sm font-semibold text-gray-800">Notificações no Telegram</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X size={18} /></button>
        </div>

        <div className="px-5 py-5">
          {carregando ? (
            <p className="text-sm text-gray-400 text-center py-8">Carregando…</p>
          ) : erro ? (
            <p className="text-sm text-red-500 text-center py-6">{erro}</p>
          ) : vinculado ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check size={22} className="text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-800">Telegram conectado</p>
              <p className="text-xs text-gray-500 mt-1">Você recebe os avisos do CheckFlow por lá quando o WhatsApp falhar.</p>
              <button onClick={desconectar}
                className="mt-4 text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
                Desconectar
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Ative as notificações em <strong>2 passos</strong>, sem digitar nada:
              </p>
              <ol className="text-xs text-gray-500 mt-2 space-y-1 list-decimal list-inside">
                <li>Toque em <strong>Abrir no Telegram</strong> (ou leia o QR)</li>
                <li>No Telegram, toque em <strong>Iniciar</strong></li>
              </ol>

              <a href={deepLink ?? '#'} target="_blank" rel="noopener noreferrer"
                className="mt-4 w-full py-3 bg-sky-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-sky-600 transition-colors">
                <Smartphone size={16} />Abrir no Telegram
              </a>

              <div className="flex flex-col items-center mt-4">
                <p className="text-[11px] text-gray-400 mb-2">Ou leia o QR com a câmera do celular</p>
                <div className="bg-white p-2 rounded-lg border border-gray-100">
                  {deepLink && <QRCodeSVG value={deepLink} size={148} level="M" includeMargin />}
                </div>
                <button onClick={copiar} className="mt-3 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                  {copiado ? <><Check size={12} />Copiado</> : <><Copy size={12} />Copiar link</>}
                </button>
              </div>

              <p className="text-[11px] text-gray-400 text-center mt-4">Aguardando você iniciar o bot… fica pronto sozinho.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
