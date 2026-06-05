'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle, XCircle, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

export default function WhatsAppPage() {
  const [status, setStatus] = useState<'verificando' | 'conectado' | 'desconectado'>('verificando')
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function verificarStatus() {
    try {
      const res = await fetch(`${API}/whatsapp/status`)
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
    try {
      const res = await fetch(`${API}/whatsapp/conectar`, { method: 'POST' })
      const json = await res.json()
      if (json.qrcode) setQrcode(json.qrcode)
    } catch { /* */ }
    setCarregando(false)
  }

  useEffect(() => {
    verificarStatus()
    const interval = setInterval(verificarStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-800">WhatsApp</h1>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          status === 'conectado' ? 'bg-green-100 text-green-700' :
          status === 'verificando' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {status === 'conectado' ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {status === 'verificando' ? 'Verificando...' : status === 'conectado' ? 'Conectado' : 'Desconectado'}
        </div>
      </div>

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

            {qrcode ? (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">Escaneie com o WhatsApp:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrcode} alt="QR Code WhatsApp" className="mx-auto w-64 h-64 border border-gray-200 rounded-xl" />
                <p className="text-xs text-gray-400 mt-2">O QR Code expira em 45 segundos. Atualizando status automaticamente...</p>
              </div>
            ) : (
              <Button onClick={gerarQR} disabled={carregando} className="w-full">
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
