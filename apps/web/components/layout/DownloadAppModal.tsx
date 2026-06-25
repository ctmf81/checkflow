'use client'

import { QRCodeSVG } from 'qrcode.react'
import { X } from 'lucide-react'

interface DownloadAppModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DownloadAppModal({ isOpen, onClose }: DownloadAppModalProps) {
  const expoUrl = 'exp://checkgo.expo.dev'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Check Go</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Fechar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center gap-4">
          {/* QR Code */}
          <div className="bg-white p-3 rounded-lg border-2 border-orange-500">
            <QRCodeSVG value={expoUrl} size={220} level="H" includeMargin={true} />
          </div>

          {/* Instruções Simples */}
          <div className="text-center space-y-2">
            <p className="font-semibold text-gray-900">Escaneie com seu celular</p>
            <p className="text-sm text-gray-600">
              1. Instale <strong>Expo Go</strong><br />
              2. Aponte a câmera para o QR code<br />
              3. Toque no link que aparecer
            </p>
          </div>

          {/* Botão Fechar */}
          <button
            onClick={onClose}
            className="w-full mt-4 px-4 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  )
}
