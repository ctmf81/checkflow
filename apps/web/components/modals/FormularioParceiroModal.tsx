'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Copy, Check } from 'lucide-react'

// Link/QR público do formulário de captação de parceiros (/seja-parceiro).
// Um único link global — os envios caem em parceiro_pre_cadastros para validação.
export function FormularioParceiroModal({ onClose }: { onClose: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const link = typeof window !== 'undefined' ? `${window.location.origin}/seja-parceiro` : ''

  function copiar() {
    navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Formulário de captação</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X size={16} /></button>
        </div>

        <div className="px-5 py-5 text-center space-y-4">
          <p className="text-xs text-gray-500">
            Compartilhe este link (ou QR) com interessados em ser parceiros. Os envios aparecem aqui como <span className="font-medium text-gray-700">pré-cadastros</span> para você validar.
          </p>

          <div className="flex justify-center">
            <div className="bg-white p-3 rounded-xl border-2 border-orange-200">
              {link && <QRCodeSVG value={link} size={200} level="M" includeMargin />}
            </div>
          </div>

          <div className="flex gap-2 min-w-0">
            <input value={link} readOnly
              className="flex-1 min-w-0 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-600" />
            <button onClick={copiar}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                copiado ? 'bg-green-500 text-white' : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}>
              {copiado ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
