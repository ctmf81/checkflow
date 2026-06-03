'use client'

import { useRef, useState } from 'react'
import { X, ImagePlus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { createClient } from '@/lib/supabase'

interface Props {
  onClose: () => void
  onCriada?: () => void
}

function formatCNPJ(v: string) {
  return v.replace(/\D/g, '').slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function NovaEmpresaModal({ onClose, onCriada }: Props) {
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Logo
  const inputRef = useRef<HTMLInputElement>(null)
  const [imagemSrc, setImagemSrc] = useState<string | null>(null)   // src para o cropper
  const [preview, setPreview] = useState<string | null>(null)        // preview final
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null)        // blob para upload
  const [cropAberto, setCropAberto] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImagemSrc(reader.result as string)
      setCropAberto(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleCropConfirm(blob: Blob) {
    setLogoBlob(blob)
    setPreview(URL.createObjectURL(blob))
    setCropAberto(false)
  }

  function removerLogo() {
    setPreview(null)
    setLogoBlob(null)
    setImagemSrc(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let logo_url: string | null = null

    // Upload da logo se houver
    if (logoBlob) {
      const ext = 'jpg'
      const path = `logos/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('empresas')
        .upload(path, logoBlob, { contentType: 'image/jpeg', upsert: true })

      if (uploadError) {
        setErro('Erro ao enviar a logo. Tente novamente.')
        setSalvando(false)
        return
      }

      const { data } = supabase.storage.from('empresas').getPublicUrl(path)
      logo_url = data.publicUrl
    }

    const { error } = await supabase.from('empresas').insert({
      nome,
      cnpj: cnpj || null,
      logo_url,
      status: 'ativo',
      criado_por: user?.id ?? null,
      atualizado_por: user?.id ?? null,
    })

    setSalvando(false)

    if (error) {
      setErro('Erro ao criar empresa. Verifique os dados e tente novamente.')
      return
    }

    onCriada?.()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Adicionar uma nova empresa</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa</label>
                  <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da empresa"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input value={cnpj} onChange={e => setCnpj(formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              </div>

              {/* Upload / Preview da logo */}
              <div className="flex flex-col items-center gap-2">
                <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                {preview ? (
                  <div className="relative w-32 h-[52px] rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Logo" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 hover:opacity-100">
                      <button type="button" onClick={() => { setImagemSrc(preview); setCropAberto(true) }}
                        className="p-1 bg-white rounded-full text-gray-700 hover:text-orange-500">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={removerLogo}
                        className="p-1 bg-white rounded-full text-gray-700 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => inputRef.current?.click()}
                    className="w-32 h-[52px] border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-orange-300 transition-colors bg-gray-50 cursor-pointer">
                    <div className="relative">
                      <ImagePlus size={22} className="text-gray-300" />
                      <span className="absolute -bottom-1 -right-1 bg-orange-500 rounded-full w-3.5 h-3.5 flex items-center justify-center text-white text-[9px]">+</span>
                    </div>
                  </button>
                )}
                <span className="text-[10px] text-gray-400 text-center leading-tight">500 x 200<br />ou maior</span>
              </div>
            </div>

            {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">
                Cancelar
              </button>
              <Button type="submit" disabled={salvando}>
                {salvando ? 'Criando...' : 'Criar empresa'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {cropAberto && imagemSrc && (
        <ImageCropModal
          imageSrc={imagemSrc}
          onConfirm={handleCropConfirm}
          onClose={() => setCropAberto(false)}
        />
      )}
    </>
  )
}
