'use client'

import { useEffect, useState, useRef } from 'react'
import QRCode from 'qrcode'
import { RefreshCw, CheckCircle, XCircle, Smartphone, Settings, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'
const CONFIG_KEY = 'checkflow_evo_config'

interface EvoConfig {
  url: string
  apiKey: string
  instancia: string
}

function loadConfig(): EvoConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* */ }
  return {
    url: 'https://evolution-api-production-d484.up.railway.app',
    apiKey: 'checkflow_evo_key_2026',
    instancia: 'checkflow',
  }
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState<'verificando' | 'conectado' | 'desconectado'>('verificando')
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [debug, setDebug] = useState<string | null>(null)
  const [configAberta, setConfigAberta] = useState(false)
  const [config, setConfig] = useState<EvoConfig>({ url: '', apiKey: '', instancia: '' })
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    setConfig(loadConfig())
  }, [])

  function salvarConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    setConfigAberta(false)
    verificarStatus()
  }

  async function verificarStatus() {
    try {
      const res = await fetch(`${API}/whatsapp/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evoUrl: config.url, evoKey: config.apiKey, evoInstance: config.instancia }),
      })
      const json = await res.json()
      setStatus(json.conectado ? 'conectado' : 'desconectado')
      if (json.conectado) setQrcode(null)
    } catch {
      setStatus('desconectado')
    }
  }

  async function gerarQR() {
    setCarregando(true)
    setQrcode(null)
    setErro(null)
    setDebug(null)
    try {
      const res = await fetch(`${API}/whatsapp/conectar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evoUrl: config.url, evoKey: config.apiKey, evoInstance: config.instancia }),
      })
      const json = await res.json()
      if (json.error) {
        setErro(`Erro da API: ${json.error}`)
        if (json._debug) setDebug(JSON.stringify(json._debug, null, 2))
      } else if (json.qrcode) {
        const qr = json.qrcode as string
        if (qr.startsWith('qrstring:')) {
          // string raw do WhatsApp — gera imagem via canvas
          const raw = qr.replace('qrstring:', '')
          const dataUrl = await QRCode.toDataURL(raw, { width: 256, margin: 2 })
          setQrcode(dataUrl)
        } else {
          setQrcode(qr)
        }
      } else {
        setErro('QR Code não retornado. Verifique as configurações da Evolution API.')
        setDebug(JSON.stringify(json._debug ?? json, null, 2))
      }
    } catch (e: any) {
      setErro(`Erro de conexão com a API: ${e.message}`)
    }
    setCarregando(false)
  }

  useEffect(() => {
    if (config.url) verificarStatus()
    const interval = setInterval(() => { if (config.url) verificarStatus() }, 5000)
    return () => clearInterval(interval)
  }, [config.url, config.apiKey, config.instancia])

  return (
    <div className="max-w-lg space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-xl font-bold text-gray-800">WhatsApp</h1>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          status === 'conectado'   ? 'bg-green-100 text-green-700' :
          status === 'verificando' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {status === 'conectado' ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {status === 'verificando' ? 'Verificando...' : status === 'conectado' ? 'Conectado' : 'Desconectado'}
        </div>
      </div>

      {/* Configurações da Evolution API */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setConfigAberta(!configAberta)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">
          <div className="flex items-center gap-2">
            <Settings size={15} className="text-gray-400" />
            Configurações da Evolution API
          </div>
          {configAberta ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </button>

        {configAberta && (
          <div className="px-5 pb-5 space-y-3 border-t border-gray-100">
            <div className="pt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">URL da Evolution API</label>
              <input value={config.url} onChange={e => setConfig(p => ({ ...p, url: e.target.value }))}
                placeholder="https://sua-evolution-api.com"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
              <input value={config.apiKey} onChange={e => setConfig(p => ({ ...p, apiKey: e.target.value }))}
                placeholder="sua-chave-aqui"
                type="password"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome da instância</label>
              <input value={config.instancia} onChange={e => setConfig(p => ({ ...p, instancia: e.target.value }))}
                placeholder="checkflow"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono" />
            </div>
            <Button onClick={salvarConfig} className="w-full">Salvar configurações</Button>
          </div>
        )}
      </div>

      {/* Painel de conexão */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {status === 'conectado' ? (
          <div className="text-center py-4">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-gray-800">WhatsApp conectado!</p>
            <p className="text-sm text-gray-500 mt-1">O sistema pode enviar mensagens.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 bg-blue-50 px-4 py-3 rounded-lg">
              <Smartphone size={20} className="text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">Como conectar</p>
                <p className="text-xs text-blue-600 mt-0.5">Clique em "Gerar QR Code", abra o WhatsApp no celular → Dispositivos vinculados → Vincular dispositivo → escaneie o QR.</p>
              </div>
            </div>

            {erro && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{erro}</p>
                </div>
                {debug && (
                  <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                    {debug}
                  </pre>
                )}
              </div>
            )}

            {qrcode ? (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Escaneie com o WhatsApp:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrcode} alt="QR Code WhatsApp" className="mx-auto w-64 h-64 border border-gray-200 rounded-xl" />
                <p className="text-xs text-gray-400 mt-2">O QR Code expira em 45 segundos.</p>
              </div>
            ) : (
              <Button onClick={gerarQR} disabled={carregando || !config.url} className="w-full">
                <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
                {carregando ? 'Gerando QR Code...' : 'Gerar QR Code'}
              </Button>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button onClick={verificarStatus} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
            <RefreshCw size={11} />Atualizar status
          </button>
        </div>
      </div>
    </div>
  )
}
