'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, Search, Upload, Download, ImagePlus, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ImageCropModal } from '@/components/ui/ImageCropModal'
import { createClient } from '@/lib/supabase'
import type { Catalogo } from './NovoCatalogoModal'

interface Valor {
  id: string
  valor_chave: string
  atributo_1: string | null
  atributo_2: string | null
  atributo_3: string | null
  atributo_4: string | null
  imagem_url: string | null
}

interface Props {
  catalogo: Catalogo
  onClose: () => void
}

type Modo = 'lista' | 'form' | 'lote'

export function ValoresModal({ catalogo, onClose }: Props) {
  const [valores, setValores] = useState<Valor[]>([])
  const [busca, setBusca] = useState('')
  const [modo, setModo] = useState<Modo>('lista')
  const [editando, setEditando] = useState<Valor | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Form
  const [chave, setChave] = useState('')
  const [attrs, setAttrs] = useState(['', '', '', ''])
  const [imgBlob, setImgBlob] = useState<Blob | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  // Lote
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const atributos = [catalogo.atributo_1, catalogo.atributo_2, catalogo.atributo_3, catalogo.atributo_4].filter(Boolean) as string[]

  async function carregar() {
    setLoading(true)
    const { data } = await createClient().from('catalogo_valores')
      .select('id, valor_chave, atributo_1, atributo_2, atributo_3, atributo_4, imagem_url')
      .eq('catalogo_id', catalogo.id).order('valor_chave')
    if (data) setValores(data)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [catalogo.id])

  function abrirForm(v?: Valor) {
    setEditando(v ?? null)
    setChave(v?.valor_chave ?? '')
    setAttrs([v?.atributo_1 ?? '', v?.atributo_2 ?? '', v?.atributo_3 ?? '', v?.atributo_4 ?? ''])
    setImgPreview(v?.imagem_url ?? null)
    setImgBlob(null)
    setModo('form')
  }

  async function salvarValor() {
    if (!chave.trim()) return
    setSalvando(true)
    const supabase = createClient()
    let imagem_url = editando?.imagem_url ?? null

    if (imgBlob) {
      const path = `catalogos/${catalogo.id}/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('empresas').upload(path, imgBlob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        const { data } = supabase.storage.from('empresas').getPublicUrl(path)
        imagem_url = data.publicUrl
      }
    }

    const payload = {
      catalogo_id: catalogo.id,
      valor_chave: chave.trim(),
      atributo_1: attrs[0].trim() || null,
      atributo_2: attrs[1].trim() || null,
      atributo_3: attrs[2].trim() || null,
      atributo_4: attrs[3].trim() || null,
      imagem_url,
    }

    if (editando) {
      await supabase.from('catalogo_valores').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('catalogo_valores').insert(payload)
    }

    setSalvando(false)
    await carregar()
    setModo('lista')
  }

  async function deletar(id: string) {
    await createClient().from('catalogo_valores').delete().eq('id', id)
    setValores(prev => prev.filter(v => v.id !== id))
  }

  function baixarModelo() {
    const headers = [catalogo.campo_chave, ...atributos].join(',')
    const exemplo = ['EXEMPLO_CHAVE', ...atributos.map((_, i) => `valor_${i + 1}`)].join(',')
    const blob = new Blob([headers + '\n' + exemplo], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `modelo_${catalogo.nome.replace(/\s+/g, '_')}.csv`
    a.click()
  }

  async function importarCSV() {
    if (!csvFile) return
    setSalvando(true)
    const text = await csvFile.text()
    const lines = text.split('\n').filter(l => l.trim())
    const rows = lines.slice(1) // pula header
    const supabase = createClient()

    const inserts = rows.map(row => {
      const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      return {
        catalogo_id: catalogo.id,
        valor_chave: cols[0] ?? '',
        atributo_1: cols[1] || null,
        atributo_2: cols[2] || null,
        atributo_3: cols[3] || null,
        atributo_4: cols[4] || null,
      }
    }).filter(r => r.valor_chave)

    if (inserts.length > 0) {
      await supabase.from('catalogo_valores').insert(inserts)
    }

    setSalvando(false)
    setCsvFile(null)
    await carregar()
    setModo('lista')
  }

  const filtrados = valores.filter(v =>
    v.valor_chave.toLowerCase().includes(busca.toLowerCase()) ||
    [v.atributo_1, v.atributo_2, v.atributo_3, v.atributo_4].some(a => (a ?? '').toLowerCase().includes(busca.toLowerCase()))
  )

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h2 className="font-semibold text-gray-800">
                {modo === 'lista' ? `Valores: ${catalogo.nome}` : modo === 'form' ? (editando ? 'Editar valor' : 'Adicionar valor') : 'Importar em lote'}
              </h2>
              {modo === 'lista' && <p className="text-xs text-gray-400 mt-0.5">{catalogo.campo_chave} + {atributos.length} atributos</p>}
            </div>
            <button onClick={modo === 'lista' ? onClose : () => setModo('lista')} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          {/* LISTA */}
          {modo === 'lista' && (
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="px-6 pt-4 pb-3 space-y-3 flex-shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar valor"
                    className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => abrirForm()}><Plus size={13} />Adicionar</Button>
                  <button onClick={() => setModo('lote')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors">
                    <Upload size={13} />Em lote
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
                ) : filtrados.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhum valor encontrado.</p>
                ) : filtrados.map(v => (
                  <div key={v.id} className="border-b border-gray-100 last:border-0">
                    <div className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandido(expandido === v.id ? null : v.id)}>
                      <span className="font-semibold text-gray-800 text-sm">{v.valor_chave}</span>
                      <div className="flex items-center gap-2">
                        {expandido === v.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                        <button onClick={e => { e.stopPropagation(); abrirForm(v) }}
                          className="p-1 text-gray-400 hover:text-orange-500"><Plus size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); deletar(v.id) }}
                          className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {expandido === v.id && (
                      <div className="px-6 pb-4 flex gap-4">
                        <div className="flex-1 space-y-1">
                          {atributos.map((label, i) => {
                            const val = [v.atributo_1, v.atributo_2, v.atributo_3, v.atributo_4][i]
                            if (!val) return null
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-20 flex-shrink-0">{label}</span>
                                <span className="text-sm text-gray-700">{val}</span>
                              </div>
                            )
                          })}
                        </div>
                        {v.imagem_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.imagem_url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FORM */}
          {modo === 'form' && (
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{catalogo.campo_chave}</label>
                <input value={chave} onChange={e => setChave(e.target.value)} autoFocus
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
              </div>
              {atributos.map((label, i) => (
                <div key={i}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input value={attrs[i]} onChange={e => setAttrs(prev => prev.map((a, idx) => idx === i ? e.target.value : a))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Imagem</label>
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]; if (!f) return
                    const r = new FileReader(); r.onload = () => setCropSrc(r.result as string); r.readAsDataURL(f)
                    e.target.value = ''
                  }} />
                {imgPreview ? (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgPreview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => { setImgPreview(null); setImgBlob(null) }}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 size={16} className="text-white" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => imgInputRef.current?.click()}
                    className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-orange-300 text-xs gap-1 transition-colors">
                    <ImagePlus size={20} />Click to upload
                  </button>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setModo('lista')} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
                <Button onClick={salvarValor} disabled={salvando || !chave.trim()}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}

          {/* LOTE */}
          {modo === 'lote' && (
            <div className="px-6 py-5 space-y-6">
              <div className="flex items-start gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Arquivo Modelo</p>
                  <button onClick={baixarModelo}
                    className="flex items-center gap-1.5 text-sm text-blue-500 hover:underline">
                    <Download size={14} />baixar modelo
                  </button>
                </div>
                <div className="flex-1">
                  <input ref={csvInputRef} type="file" accept=".csv" className="hidden"
                    onChange={e => setCsvFile(e.target.files?.[0] ?? null)} />
                  <button onClick={() => csvInputRef.current?.click()}
                    className={`w-full py-6 border-2 border-dashed rounded-lg text-sm transition-colors ${
                      csvFile ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-400 hover:border-orange-300'
                    }`}>
                    {csvFile ? csvFile.name : 'Clique para enviar (.csv)'}
                  </button>
                </div>
              </div>
              {csvFile && (
                <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                  {csvFile.name} — clique em Salvar para importar.
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setModo('lista')} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
                <Button onClick={importarCSV} disabled={!csvFile || salvando}>
                  {salvando ? 'Importando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} aspect={1}
          onConfirm={blob => { setImgBlob(blob); setImgPreview(URL.createObjectURL(blob)); setCropSrc(null) }}
          onClose={() => setCropSrc(null)} />
      )}
    </>
  )
}
