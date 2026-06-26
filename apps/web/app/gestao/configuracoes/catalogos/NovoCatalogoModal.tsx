'use client'

import { useState } from 'react'
import { X, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { apiFetch } from '@/lib/apiClient'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import { useToast } from '@/components/ui/feedback'

export interface Catalogo {
  id: string
  nome: string
  descricao: string | null
  campo_chave: string
  atributo_1: string | null
  atributo_2: string | null
  atributo_3: string | null
  atributo_4: string | null
  api_url?: string | null
  api_headers?: Record<string, string> | null
  api_mapeamento?: Record<string, string> | null
}

interface Props {
  catalogo?: Catalogo
  onClose: () => void
  onSalvo: (catalogo: Catalogo) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

export function NovoCatalogoModal({ catalogo, onClose, onSalvo }: Props) {
  const { unidadeAtiva } = useSession()
  const toast = useToast()
  const isEdicao = !!catalogo
  const [aba, setAba] = useState<'estrutura' | 'api'>('estrutura')

  const [nome, setNome] = useState(catalogo?.nome ?? '')
  const [descricao, setDescricao] = useState(catalogo?.descricao ?? '')
  const [campoChave, setCampoChave] = useState(catalogo?.campo_chave ?? '')
  const [attrs, setAttrs] = useState([
    catalogo?.atributo_1 ?? '',
    catalogo?.atributo_2 ?? '',
    catalogo?.atributo_3 ?? '',
    catalogo?.atributo_4 ?? '',
  ])
  // API
  const [apiUrl, setApiUrl] = useState(catalogo?.api_url ?? '')
  const [apiHeaders, setApiHeaders] = useState(
    catalogo?.api_headers ? JSON.stringify(catalogo.api_headers, null, 2) : ''
  )
  const [apiMapa, setApiMapa] = useState<Record<string, string>>(catalogo?.api_mapeamento ?? {})
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function setAttr(i: number, v: string) {
    setAttrs(prev => prev.map((a, idx) => idx === i ? v : a))
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome do catálogo.'); return }
    if (!campoChave.trim()) { setErro('Informe o nome do campo chave.'); return }
    setErro('')
    setSalvando(true)
    const supabase = createClient()

    let parsedHeaders: Record<string, string> | null = null
    if (apiHeaders.trim()) {
      try { parsedHeaders = JSON.parse(apiHeaders) } catch { /* ignora */ }
    }

    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      campo_chave: campoChave.trim(),
      atributo_1: attrs[0].trim() || null,
      atributo_2: attrs[1].trim() || null,
      atributo_3: attrs[2].trim() || null,
      atributo_4: attrs[3].trim() || null,
      api_url: apiUrl.trim() || null,
      api_headers: parsedHeaders,
      api_mapeamento: Object.keys(apiMapa).length > 0 ? apiMapa : null,
    }

    if (isEdicao) {
      const { error } = await supabase.from('catalogos')
        .update({ ...payload, atualizado_em: new Date().toISOString() }).eq('id', catalogo.id)
      if (error) { setErro(`Erro ao salvar: ${error.message}`); setSalvando(false); return }
      setSyncMsg('Configuração salva com sucesso.')
      onSalvo({ id: catalogo.id, ...payload })
    } else {
      const { data, error } = await supabase.from('catalogos')
        .insert({ ...payload, unidade_id: unidadeAtiva?.id, status: 'ativo' })
        .select('id, nome, descricao, campo_chave, atributo_1, atributo_2, atributo_3, atributo_4')
        .single()
      if (error || !data) { setErro('Erro ao criar.'); setSalvando(false); return }
      toast.success('Catálogo criado.')
      onSalvo(data as Catalogo)
    }
    setSalvando(false)
  }

  const [camposApi, setCamposApi] = useState<string[]>(
    catalogo?.api_mapeamento ? Object.values(catalogo.api_mapeamento) : []
  )
  const [carregandoCampos, setCarregandoCampos] = useState(false)
  const [camposMsg, setCamposMsg] = useState('')
  const [totalRegistros, setTotalRegistros] = useState<number | null>(null)
  const [previewDados, setPreviewDados] = useState<any[] | null>(null)
  const [previewMapa, setPreviewMapa] = useState<Record<string, string>>({})

  async function carregarCampos() {
    if (!apiUrl.trim()) { setCamposMsg('Informe a URL primeiro.'); return }
    setCarregandoCampos(true)
    setCamposMsg('')
    try {
      let parsedHeaders: Record<string, string> = {}
      if (apiHeaders.trim()) {
        try { parsedHeaders = JSON.parse(apiHeaders) } catch { /* ignora */ }
      }
      const res = await apiFetch('/catalogos/test-api', {
        method: 'POST',
        body: JSON.stringify({ url: apiUrl.trim(), headers: parsedHeaders }),
      })
      const json = await res.json()
      if (json.error) { setCamposMsg(json.error); setCarregandoCampos(false); return }
      setCamposApi(json.campos ?? [])
      setTotalRegistros(json.total ?? null)
      setPreviewDados(null)
      setCamposMsg(`${json.campos?.length ?? 0} campos encontrados${json.total ? ` · ${json.total} registros` : ''}.`)
    } catch {
      setCamposMsg('Erro ao conectar com a API local (porta 3001).')
    }
    setCarregandoCampos(false)
  }

  async function verPrevia() {
    if (!apiUrl.trim()) return
    setCarregandoCampos(true)
    setSyncMsg('')
    try {
      let parsedHeaders: Record<string, string> = {}
      if (apiHeaders.trim()) { try { parsedHeaders = JSON.parse(apiHeaders) } catch { /* */ } }
      const res = await apiFetch('/catalogos/test-api', {
        method: 'POST',
        body: JSON.stringify({ url: apiUrl.trim(), headers: parsedHeaders }),
      })
      const json = await res.json()
      if (json.error) { setCamposMsg(json.error); setCarregandoCampos(false); return }
      setPreviewDados(json.preview ?? [])
      setPreviewMapa({ ...apiMapa })
      setTotalRegistros(json.total ?? null)
    } catch {
      setCamposMsg('Erro ao conectar com a API local.')
    }
    setCarregandoCampos(false)
  }

  async function sincronizar() {
    if (!catalogo?.id) return
    setSincronizando(true)
    setSyncMsg('')
    try {
      const res = await fetch(`${API_URL}/catalogos/${catalogo.id}/sync`, { method: 'POST' })
      const json = await res.json()
      setSyncMsg(json.mensagem ?? json.error ?? 'Concluído.')
      setPreviewDados(null)
    } catch {
      setSyncMsg('Erro ao conectar com a API.')
    }
    setSincronizando(false)
  }

  const attrExemplos = ['Nome do produto', 'Acabamento', 'Formato', 'Nº de faces']
  const attrKeys = ['campo_chave', 'atributo_1', 'atributo_2', 'atributo_3', 'atributo_4'] as const
  const attrLabels = [campoChave || catalogo?.campo_chave || 'Campo chave', ...attrs.map((a, i) => a || `Atributo ${i + 1}`)]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">{isEdicao ? 'Editar Catálogo' : 'Novo Catálogo'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
          {(['estrutura', 'api'] as const).map(a => (
            <button key={a} onClick={() => setAba(a)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                aba === a ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a === 'api' ? '🔗 API' : '📋 Estrutura'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
        {aba === 'estrutura' && (<>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Catálogo</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="nome do catálogo"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição do Catálogo</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="descrição do catálogo" rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
              Nome do campo chave <Info size={13} className="text-gray-400" />
            </label>
            <input value={campoChave} onChange={e => setCampoChave(e.target.value)} placeholder="nome do campo chave"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
            <p className="text-xs text-orange-500 font-medium mt-1">Ex.: Código do Produto</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do atributo {i + 1}</label>
                <input value={attrs[i]} onChange={e => setAttr(i, e.target.value)}
                  placeholder={`atributo ${i + 1}`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                {i === 0 && <p className="text-xs text-orange-500 font-medium mt-1">Ex.: {attrExemplos[0]}</p>}
              </div>
            ))}
          </div>

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar' : 'Continuar'}
            </Button>
          </div>
        </>)}

        {aba === 'api' && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
              <p className="font-medium">Como funciona</p>
              <p>Configure o endpoint externo. A API buscará os dados e fará upsert nos valores do catálogo.</p>
              <p>Aceita arrays diretos ou objetos com <code className="bg-blue-100 px-1 rounded">data</code>, <code className="bg-blue-100 px-1 rounded">items</code> ou <code className="bg-blue-100 px-1 rounded">results</code>.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL do endpoint</label>
              <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                placeholder="https://api.empresa.com/produtos"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Headers <span className="text-gray-400 font-normal">(JSON opcional)</span>
              </label>
              <textarea value={apiHeaders} onChange={e => setApiHeaders(e.target.value)}
                placeholder={'{\n  "Authorization": "Bearer SEU_TOKEN"\n}'}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none font-mono" />
            </div>

            {/* Botão carregar campos */}
            <div className="flex items-center gap-3">
              <button onClick={carregarCampos} disabled={carregandoCampos || !apiUrl.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                <RefreshCw size={13} className={carregandoCampos ? 'animate-spin' : ''} />
                {carregandoCampos ? 'Carregando...' : 'Carregar campos da API'}
              </button>
              {camposMsg && (
                <span className={`text-xs ${camposMsg.includes('Erro') || camposMsg.includes('erro') ? 'text-red-500' : 'text-green-600'}`}>
                  {camposMsg}
                </span>
              )}
            </div>

            {/* Mapeamento com dropdowns */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mapeamento de campos
                {camposApi.length === 0 && <span className="text-xs text-gray-400 font-normal ml-1">— carregue os campos da API primeiro</span>}
              </label>
              <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                {attrKeys.map((key, i) => {
                  const label = attrLabels[i]
                  if (i > 0 && !attrs[i - 1]) return null
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-orange-600 font-medium w-28 flex-shrink-0 truncate">{label}</span>
                      <span className="text-gray-400 text-xs">→</span>
                      {camposApi.length > 0 ? (
                        <select
                          value={apiMapa[key] ?? ''}
                          onChange={e => setApiMapa(prev => ({ ...prev, [key]: e.target.value }))}
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-200"
                        >
                          <option value="">— selecione —</option>
                          {camposApi.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={apiMapa[key] ?? ''}
                          onChange={e => setApiMapa(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder="campo na API"
                          className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-200 font-mono"
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Prévia dos dados */}
            {previewDados && previewDados.length > 0 && (
              <div className="border border-orange-200 rounded-lg overflow-hidden">
                <div className="bg-orange-50 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-orange-700">
                    Prévia — primeiros {previewDados.length} de {totalRegistros ?? '?'} registros
                  </span>
                  <button onClick={() => setPreviewDados(null)} className="text-orange-400 hover:text-orange-600 text-xs">fechar</button>
                </div>
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {attrKeys.map((key, i) => {
                          if (i > 0 && !attrs[i - 1]) return null
                          return <th key={key} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">{attrLabels[i]}</th>
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {previewDados.map((item, idx) => (
                        <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                          {attrKeys.map((key, i) => {
                            if (i > 0 && !attrs[i - 1]) return null
                            const campo = previewMapa[key] ?? ''
                            const val = campo ? item[campo] : ''
                            return (
                              <td key={key} className={`px-3 py-1.5 ${!val ? 'text-gray-300 italic' : 'text-gray-700'}`}>
                                {val ?? '—'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {syncMsg && (
              <p className={`text-xs px-3 py-2 rounded-lg ${syncMsg.includes('Erro') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {syncMsg}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2 flex-wrap">
              <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Fechar</button>
              <Button onClick={salvar} disabled={salvando} variant="outline">
                {salvando ? 'Salvando...' : 'Salvar configuração'}
              </Button>
              {isEdicao && !previewDados && (
                <button onClick={verPrevia} disabled={carregandoCampos || !apiUrl.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-2 border-orange-500 text-orange-500 hover:bg-orange-50 disabled:opacity-50 rounded-lg transition-colors">
                  <RefreshCw size={14} className={carregandoCampos ? 'animate-spin' : ''} />
                  {carregandoCampos ? 'Carregando...' : 'Ver prévia'}
                </button>
              )}
              {isEdicao && previewDados && (
                <Button onClick={sincronizar} disabled={sincronizando}>
                  <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} />
                  {sincronizando ? 'Sincronizando...' : `Confirmar e sincronizar ${totalRegistros ? `(${totalRegistros})` : ''}`}
                </Button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
