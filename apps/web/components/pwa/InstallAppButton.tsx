'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { DownloadAppModal } from '@/components/layout/DownloadAppModal'
import { isStandalone } from '@/lib/pwaInstall'

// Botão "Instalar" do PWA — abre o modal de instalação. Compartilhado entre os
// headers da operação e da gestão. Aparece SÓ no navegador (web); fica oculto
// quando já está rodando como app instalado (standalone).
export function InstallAppButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    const check = () => setMostrar(!isStandalone())
    check()
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener?.('change', check)
    return () => mq.removeEventListener?.('change', check)
  }, [])

  if (!mostrar) return null

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
        App
      </button>
      <DownloadAppModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}
