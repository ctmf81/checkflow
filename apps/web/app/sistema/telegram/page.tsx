'use client'

import { useEffect, useState } from 'react'
import { Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'

interface TelegramStatus {
  configurado: boolean
  webhookUrl?: string
  pendentes?: number
  ultimoErro?: string | null
}

export default function TelegramSistemaPage() {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true); setErro(null)
    try {
      const res = await apiFetch('/telegram/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStatus(await res.json())
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao consultar o status.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const saudavel = status?.configurado && !!status?.webhookUrl && !status?.ultimoErro

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Send size={20} className="text-sky-500" />
          <h1 className="text-xl font-bold text-gray-800">Telegram</h1>
        </div>
        <button onClick={carregar} disabled={carregando}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-sky-500 border border-gray-200 hover:border-sky-300 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />Atualizar
        </button>
      </div>

      {carregando && !status ? (
        <p className="text-sm text-gray-400">Consultando o Telegram…</p>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{erro}</div>
      ) : status ? (
        <div className="space-y-3">
          {/* Estado geral */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${
            saudavel ? 'bg-green-50 border-green-200' : status.configurado ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
          }`}>
            {saudavel ? <CheckCircle2 size={22} className="text-green-600" />
              : status.configurado ? <AlertTriangle size={22} className="text-amber-500" />
              : <XCircle size={22} className="text-gray-400" />}
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {saudavel ? 'Canal saudável' : status.configurado ? 'Configurado com pendências' : 'Bot não configurado'}
              </p>
              <p className="text-xs text-gray-500">
                {status.configurado
                  ? 'O token do bot está definido neste ambiente.'
                  : 'Defina TELEGRAM_BOT_TOKEN no serviço da API para ativar o canal.'}
              </p>
            </div>
          </div>

          {/* Detalhes */}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <Linha rotulo="Webhook registrado" valor={status.webhookUrl || '— (não registrado)'} ok={!!status.webhookUrl} />
            <Linha rotulo="Updates pendentes" valor={String(status.pendentes ?? 0)} ok={(status.pendentes ?? 0) === 0} />
            <Linha rotulo="Último erro" valor={status.ultimoErro || 'nenhum'} ok={!status.ultimoErro} />
          </div>

          <p className="text-[11px] text-gray-400">
            O webhook é registrado uma vez por ambiente (POST /telegram/setup). Se o "último erro" persistir, verifique a URL do webhook e o secret.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Linha({ rotulo, valor, ok }: { rotulo: string; valor: string; ok: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-xs font-medium text-gray-500">{rotulo}</span>
      <span className={`text-xs text-right break-all ${ok ? 'text-gray-700' : 'text-amber-600'}`}>{valor}</span>
    </div>
  )
}
