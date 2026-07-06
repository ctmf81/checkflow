'use client'

import { useRef } from 'react'
import { Camera, Video, ImagePlus } from 'lucide-react'
import { validarMidia } from '@/lib/midia'

// Seletor de evidência com três caminhos. Câmera abre direto com UM tipo por
// input (foto OU vídeo) — misturar image+video no mesmo input com `capture`
// faz vários celulares caírem na galeria. Galeria permite anexar existentes
// (foto/vídeo, vários). Valida tamanho na hora; onError recebe a mensagem (ou null).
export function EvidenciaPicker({ files, onFilesChange, onError }: {
  files: File[]
  onFilesChange: (files: File[]) => void
  onError: (msg: string | null) => void
}) {
  const fotoRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  function adicionar(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const { validos, erro } = validarMidia(Array.from(lista))
    onError(erro)
    if (validos.length) onFilesChange([...files, ...validos])
  }

  const botao = 'flex items-center gap-1.5 text-xs text-gray-600 border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button type="button" onClick={() => fotoRef.current?.click()} className={botao}>
        <Camera size={13} /> Foto
      </button>
      <button type="button" onClick={() => videoRef.current?.click()} className={botao}>
        <Video size={13} /> Vídeo
      </button>
      <button type="button" onClick={() => galRef.current?.click()} className={botao}>
        <ImagePlus size={13} /> Galeria
      </button>
      {files.length > 0 && <span className="text-xs text-gray-500">{files.length} arq.</span>}

      <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { adicionar(e.target.files); e.target.value = '' }} />
      <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
        onChange={e => { adicionar(e.target.files); e.target.value = '' }} />
      <input ref={galRef} type="file" accept="image/*,video/*" multiple className="hidden"
        onChange={e => { adicionar(e.target.files); e.target.value = '' }} />
    </div>
  )
}
