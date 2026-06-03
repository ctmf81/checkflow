'use client'

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react'
import { Button } from './Button'

interface Area {
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  imageSrc: string
  onConfirm: (croppedBlob: Blob) => void
  onClose: () => void
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImageBitmap(await fetch(imageSrc).then(r => r.blob()))
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.92))
}

export function ImageCropModal({ imageSrc, onConfirm, onClose }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [salvando, setSalvando] = useState(false)

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  async function handleConfirm() {
    if (!croppedAreaPixels) return
    setSalvando(true)
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels)
    onConfirm(blob)
    setSalvando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Ajustar imagem</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Área de crop */}
        <div className="relative w-full h-72 bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={500 / 200}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controle de zoom */}
        <div className="px-6 py-4 flex items-center gap-3">
          <ZoomOut size={16} className="text-gray-400 flex-shrink-0" />
          <input
            type="range" min={1} max={3} step={0.05}
            value={zoom} onChange={e => setZoom(Number(e.target.value))}
            className="flex-1 accent-orange-500"
          />
          <ZoomIn size={16} className="text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-400 w-10 text-right">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancelar</button>
          <Button onClick={handleConfirm} disabled={salvando}>
            <Check size={15} />
            {salvando ? 'Processando...' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
