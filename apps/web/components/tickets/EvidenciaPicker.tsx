'use client'

import { useRef } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import { validarMidia } from '@/lib/midia'

// Seletor de evidência com dois caminhos: câmera (abre a câmera direto no
// celular) e galeria/arquivo. Valida o tamanho na hora (foto/vídeo) e
// acumula os arquivos válidos. onError recebe a mensagem de rejeição (ou null).
export function EvidenciaPicker({ files, onFilesChange, onError }: {
  files: File[]
  onFilesChange: (files: File[]) => void
  onError: (msg: string | null) => void
}) {
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  function adicionar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const { validos, erro } = validarMidia(Array.from(lista))
    onError(erro)
    if (validos.length) onFilesChange([...files, ...validos])
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={() => camRef.current?.click()}
        className="flex items-center gap-1.5 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
        <Camera size={13} /> Câmera
      </button>
      <button type="button" onClick={() => galRef.current?.click()}
        className="flex items-center gap-1.5 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
        <ImagePlus size={13} /> Galeria
      </button>
      {files.length > 0 && <span className="text-xs text-gray-500">{files.length} arq.</span>}

      <input ref={camRef} type="file" accept="image/*,video/*" capture="environment" className="hidden"
        onChange={e => { adicionar(e.target.files); e.target.value = '' }} />
      <input ref={galRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={e => { adicionar(e.target.files); e.target.value = '' }} />
    </div>
  )
}
