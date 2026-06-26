'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { DownloadAppModal } from '@/components/layout/DownloadAppModal'

// Botão "Instalar" do PWA — abre o modal de instalação. Compartilhado entre os
// headers da operação e da gestão. Sempre visível; o próprio modal informa
// "App já instalado" quando rodando em modo standalone.
export function InstallAppButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ??
          'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors flex-shrink-0'
        }
      >
        <Download size={14} />
        Instalar
      </button>
      <DownloadAppModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}
