'use client'

import { Download, X } from 'lucide-react'

interface DownloadAppModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DownloadAppModal({ isOpen, onClose }: DownloadAppModalProps) {
  const apkDownloadUrl = 'https://builds.easbuild.app/builds/checkgo-mobile.apk'

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
        <div className="p-6 flex flex-col items-center gap-6">
          {/* Icon */}
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
            <Download className="w-8 h-8 text-orange-600" />
          </div>

          {/* Texto */}
          <div className="text-center space-y-2">
            <p className="font-semibold text-gray-900 text-lg">Pronto para usar</p>
            <p className="text-sm text-gray-600">
              Clique abaixo para baixar o app e instalar no seu celular
            </p>
          </div>

          {/* Botão Download */}
          <a
            href={apkDownloadUrl}
            download="CheckGo.apk"
            className="w-full px-4 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
          >
            <Download size={20} />
            Baixar Check Go
          </a>

          {/* Botão Fechar */}
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-600 font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
