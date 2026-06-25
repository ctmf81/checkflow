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
  const downloadUrl = 'https://app.checkflow.digital/api/download-app'

  const copyToClipboard = () => {
    navigator.clipboard.writeText(downloadUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
            <QRCodeSVG value={downloadUrl} size={200} level="H" includeMargin={true} />
          </div>

          {/* Instruções */}
          <div className="text-center space-y-2">
            <p className="font-semibold text-gray-900">Baixe direto no seu celular</p>
            <p className="text-xs text-gray-600">
              Escaneie o QR ou clique no link abaixo para<br />
              <strong>baixar e instalar Check Go</strong>
            </p>
          </div>

          {/* Link Copiável */}
          <div className="w-full space-y-2">
            <p className="text-xs font-semibold text-gray-600">Link de download:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={downloadUrl}
                readOnly
                className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded font-mono text-gray-700"
              />
              <button
                onClick={copyToClipboard}
                className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {copied ? '✓' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Botões */}
          <div className="w-full space-y-2 pt-2">
            <a
              href={downloadUrl}
              className="w-full px-4 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
            >
              <Download size={16} />
              Baixar Check Go
            </a>
            <button
              onClick={onShare}
              className="w-full px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Share2 size={16} />
              Compartilhar com Equipe
            </button>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-gray-600 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
