'use client'

import { QRCodeSVG } from 'qrcode.react'
import { X, Share2, Download } from 'lucide-react'
import { useState } from 'react'

interface DownloadAppModalProps {
  isOpen: boolean
  onClose: () => void
  onShare?: () => void
}

export function DownloadAppModal({ isOpen, onClose, onShare }: DownloadAppModalProps) {
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
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Check Go</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Fechar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* Step 1: Install Expo Go */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="font-semibold text-gray-900">Instale o Expo Go</h3>
            </div>
            <p className="text-sm text-gray-600 ml-0 sm:ml-11 mb-3">
              O Expo Go é o aplicativo que permite rodar Check Go no seu celular.
            </p>
            <div className="ml-0 sm:ml-11 space-y-2">
              <a
                href="https://apps.apple.com/app/expo-go/id982107779"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <Download size={16} />
                App Store (iOS)
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=host.exp.exponent"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <Download size={16} />
                Google Play (Android)
              </a>
            </div>
          </div>

          {/* Step 2: QR Code */}
          <div className="space-y-3 border-t pt-6">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="font-semibold text-gray-900">Escaneie este código</h3>
            </div>
            <p className="text-sm text-gray-600 ml-0 sm:ml-11">
              Abra o Expo Go e escaneie o código abaixo com a câmera do seu celular.
            </p>
            <div className="ml-0 sm:ml-11 flex justify-center">
              <div className="bg-white p-4 rounded-lg border-2 border-orange-500 shadow-sm">
                <QRCodeSVG value={expoUrl} size={200} level="H" includeMargin={true} />
              </div>
            </div>
          </div>

          {/* Step 3: Copy Link */}
          <div className="space-y-3 border-t pt-6">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="font-semibold text-gray-900">Ou copie o link</h3>
            </div>
            <p className="text-sm text-gray-600 ml-0 sm:ml-11">
              Se preferir, copie e compartilhe este link:
            </p>
            <div className="ml-0 sm:ml-11 flex gap-2 min-w-0">
              <input
                type="text"
                value={expoUrl}
                readOnly
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded font-mono text-gray-700"
              />
              <button
                onClick={copyToClipboard}
                className={`flex-shrink-0 px-4 py-2 rounded font-medium text-sm transition-colors ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-2 border-t pt-6">
            <button
              onClick={onShare}
              className="w-full px-4 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Share2 size={18} />
              Compartilhar com Equipe
            </button>
            <button
              onClick={onClose}
              className="w-full px-4 py-3 text-gray-900 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
