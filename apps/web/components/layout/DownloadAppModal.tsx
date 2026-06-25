'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Smartphone } from 'lucide-react'

interface DownloadAppModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DownloadAppModal({ isOpen, onClose }: DownloadAppModalProps) {
  const [copied, setCopied] = useState(false)

  const expoUrl = 'exp://checkgo.expo.dev'

  const copyToClipboard = () => {
    navigator.clipboard.writeText(expoUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-orange-500" />
            <h2 className="text-xl font-bold text-gray-900">Check Go
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Fechar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* QR Code */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-600 text-center">
              Escaneie este código com a câmera do seu celular ou use o Expo Go
            </p>
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
              <QRCodeSVG value={expoUrl} size={256} level="H" includeMargin={true} />
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Como funciona:</h3>
            <ol className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>Instale <strong>Expo Go</strong> no seu celular (App Store ou Google Play)</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>Abra Expo Go e escaneie o QR code acima</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>Check Go abre automaticamente!</span>
              </li>
            </ol>
          </div>

          {/* Link Direto */}
          <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Ou copie o link:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={expoUrl}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded font-mono text-gray-700"
              />
              <button
                onClick={copyToClipboard}
                className={`px-3 py-2 rounded font-medium text-sm transition-colors ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {copied ? '✓' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Note */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-900">
              💡 <strong>Dica:</strong> Check Go funciona offline! Prepare checklists, execute no campo, e sincronize quando conectar à internet.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-900 font-medium border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
