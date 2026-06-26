'use client'

import { X, Download, CheckCircle2, Plus, Share } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  canPromptInstall,
  promptInstall,
  subscribePwaInstall,
  isStandalone,
  isIOS,
} from '@/lib/pwaInstall'

interface DownloadAppModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DownloadAppModal({ isOpen, onClose }: DownloadAppModalProps) {
  const [canInstall, setCanInstall] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    const sync = () => {
      setCanInstall(canPromptInstall())
      setInstalled(isStandalone())
    }
    sync()
    setIos(isIOS())
    return subscribePwaInstall(sync)
  }, [])

  if (!isOpen) return null

  const handleInstall = async () => {
    const ok = await promptInstall()
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Instalar o CheckFlow</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0" aria-label="Fechar">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {installed ? (
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
              <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900">App já instalado</p>
                <p className="text-sm text-green-700 mt-0.5">
                  Você já está usando o CheckFlow como aplicativo. Pode fechar esta janela.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Instale o CheckFlow na tela inicial do seu celular para abrir com 1 toque,
                em tela cheia e funcionando mesmo sem internet.
              </p>

              {/* Android / Chrome — instalação direta */}
              {canInstall && (
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
                >
                  <Download size={18} />
                  Instalar agora
                </button>
              )}

              {/* iOS — instruções manuais (Safari não suporta prompt automático) */}
              {ios && (
                <div className="space-y-3 border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-800">No iPhone/iPad (Safari):</p>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    Toque em <Share size={15} className="inline text-blue-500" /> (Compartilhar)
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    Escolha <Plus size={15} className="inline" /> "Adicionar à Tela de Início"
                  </div>
                </div>
              )}

              {/* Android sem prompt automático (ou outros navegadores) */}
              {!canInstall && !ios && (
                <div className="space-y-3 border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-800">No Android (Chrome):</p>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    Abra o menu <span className="font-mono">⋮</span> do navegador
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    Toque em "Instalar app" ou "Adicionar à tela inicial"
                  </div>
                </div>
              )}
            </>
          )}

          {/* Ações */}
          <div className="space-y-2 border-t pt-5">
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
