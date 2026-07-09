'use client'

import { useRef, useState } from 'react'
import { X, FileText, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

interface Props {
  documentoId: string
  documentoNome: string
  documentoDescricao: string | null
  arquivoUrl?: string | null
  criadoPor?: string
  criadoEm?: string
  onClose: () => void
  onSalvo?: () => void
}

const MAX_MB = 6
const MAX_BYTES = MAX_MB * 1024 * 1024

export function ConsultaInteligenteModal({
  documentoId, documentoNome, documentoDescricao,
  arquivoUrl, criadoPor, criadoEm, onClose, onSalvo
}: Props) {
  const [nome, setNome] = useState(documentoNome)
  const [descricao, setDescricao] = useState(documentoDescricao ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [urlAtual, setUrlAtual] = useState(arquivoUrl ?? null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      setErro(`Arquivo muito grande. Máximo ${MAX_MB}MB.`)
      return
    }
    setErro('')
    setArquivo(file)
  }

  async function salvar() {
    setErro('')
    setSalvando(true)
    const supabase = createClient()

    let arquivo_url = urlAtual

    if (arquivo) {
      const ext = (arquivo.name.split('.').pop() || 'pdf').toLowerCase()
      const path = `documentos/${documentoId}/${Date.now()}.${ext}`
      // Caminho único por timestamp → não precisa de upsert (que exigiria policy
      // de UPDATE no bucket). INSERT puro basta.
      const { error: upErr } = await supabase.storage
        .from('empresas').upload(path, arquivo, {
          contentType: arquivo.type || 'application/pdf',
        })

      if (upErr) {
        console.error('[consulta-inteligente] falha no upload:', upErr)
        setErro(`Erro ao enviar arquivo: ${upErr.message || 'tente novamente.'}`)
        setSalvando(false)
        return
      }
      const { data } = supabase.storage.from('empresas').getPublicUrl(path)
      arquivo_url = data.publicUrl
    }

    const payload: Record<string, any> = {
      nome, descricao: descricao || null, arquivo_url, atualizado_em: new Date().toISOString(),
    }
    // Arquivo novo → o markdown em cache fica obsoleto: zera para ser regerado.
    if (arquivo) { payload.conteudo_markdown = null; payload.markdown_gerado_em = null }

    const { error } = await supabase.from('documentos').update(payload).eq('id', documentoId)

    setSalvando(false)
    if (error) { setErro('Erro ao salvar.'); return }

    // Gera o markdown do PDF em background (1x) — deixa a 1ª consulta já barata.
    // Se falhar, a consulta gera sob demanda (lazy). Fire-and-forget.
    if (arquivo_url && arquivo_url.toLowerCase().includes('.pdf')) {
      const { data: { session } } = await supabase.auth.getSession()
      const tk = session?.access_token
      if (tk) {
        fetch('/api/documentos/extrair-markdown', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tk}` },
          body: JSON.stringify({ documento_id: documentoId }),
        }).catch(() => { /* lazy na consulta cobre */ })
      }
    }

    onSalvo?.()
    onClose()
  }

  function formatarData(iso?: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Atualizar Documento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do documento</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do documento</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          {/* Fonte atual */}
          {urlAtual && (
            <a href={urlAtual} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-orange-500 hover:underline">
              <FileText size={16} />
              Clique para ver a fonte atual
            </a>
          )}

          {/* Upload */}
          <div>
            <input ref={inputRef} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={handleArquivo} />
            <button type="button" onClick={() => inputRef.current?.click()}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg text-sm transition-colors ${
                arquivo
                  ? 'border-orange-300 bg-orange-50 text-orange-600'
                  : 'border-gray-200 text-gray-400 hover:border-orange-300 hover:text-orange-400'
              }`}>
              <Upload size={16} />
              {arquivo
                ? arquivo.name
                : `Clique para subir o arquivo (máx. ${MAX_MB}MB)`}
            </button>
            {arquivo && (
              <p className="text-xs text-gray-400 mt-1">
                {(arquivo.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          {/* Criado por */}
          {criadoPor && (
            <p className="text-xs text-gray-500">
              <span className="font-semibold">Criado por:</span> {criadoPor} em {formatarData(criadoEm)}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Editar'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
