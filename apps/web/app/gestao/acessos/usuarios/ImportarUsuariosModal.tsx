'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Upload, Download, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

interface UsuarioImport {
  nome: string
  email?: string
  cpf?: string
  telefone?: string
}

interface Props {
  empresaId: string
  onClose: () => void
  onImportado?: () => void
}

type Aba = 'csv' | 'api'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-production-5bce.up.railway.app'

export function ImportarUsuariosModal({ empresaId, onClose, onImportado }: Props) {
  const [aba, setAba] = useState<Aba>('csv')

  // CSV
  const csvRef = useRef<HTMLInputElement>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<UsuarioImport[]>([])

  // API
  const [apiUrl, setApiUrl] = useState('')
  const [apiHeaders, setApiHeaders] = useState('')
  const [mapeamento, setMapeamento] = useState({ nome: '', email: '', cpf: '', telefone: '', status: '' })
  const [sistemaNome, setSistemaNome] = useState('')
  const [campoStatus, setCampoStatus] = useState('')
  const [statusAtivo, setStatusAtivo] = useState('')
  const [estrategia, setEstrategia] = useState<'inativar' | 'manter'>('inativar')
  const [camposApi, setCamposApi] = useState<string[]>([])
  const [carregando, setCarregando] = useState(false)
  const [camposMsg, setCamposMsg] = useState('')
  const [previewApi, setPreviewApi] = useState<UsuarioImport[]>([])
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const [configSalva, setConfigSalva] = useState(false)

  // Carrega config salva ao abrir
  useEffect(() => {
    if (!empresaId) return
    createClient().from('empresas')
      .select('importacao_api_url, importacao_api_headers, importacao_api_mapeamento, importacao_campo_status, importacao_status_ativo, importacao_estrategia, importacao_sistema_nome')
      .eq('id', empresaId).single()
      .then(({ data }) => {
        if (data?.importacao_api_url) setApiUrl(data.importacao_api_url)
        if (data?.importacao_api_headers) setApiHeaders(JSON.stringify(data.importacao_api_headers, null, 2))
        if (data?.importacao_api_mapeamento) setMapeamento({ nome: '', email: '', cpf: '', telefone: '', status: '', ...data.importacao_api_mapeamento })
        if (data?.importacao_sistema_nome) setSistemaNome(data.importacao_sistema_nome)
        if (data?.importacao_campo_status) setCampoStatus(data.importacao_campo_status)
        if (data?.importacao_status_ativo) setStatusAtivo(data.importacao_status_ativo)
        if (data?.importacao_estrategia) setEstrategia(data.importacao_estrategia)
      })
  }, [empresaId])

  async function salvarConfig() {
    setSalvandoConfig(true)
    let parsedHeaders: Record<string, string> | null = null
    if (apiHeaders.trim()) { try { parsedHeaders = JSON.parse(apiHeaders) } catch { /* */ } }
    await createClient().from('empresas').update({
      importacao_api_url: apiUrl.trim() || null,
      importacao_api_headers: parsedHeaders,
      importacao_api_mapeamento: mapeamento,
      importacao_sistema_nome: sistemaNome.trim() || null,
      importacao_campo_status: campoStatus.trim() || null,
      importacao_status_ativo: statusAtivo.trim() || null,
      importacao_estrategia: estrategia,
    }).eq('id', empresaId)
    setSalvandoConfig(false)
    setConfigSalva(true)
    setTimeout(() => setConfigSalva(false), 2000)
  }

  // Importação
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ criados: number; existentes: number; inativados: number; erros: number; detalhes?: any; message?: string } | null>(null)

  function baixarModelo() {
    const csv = 'nome,cpf,telefone,email\nJoão Silva,000.000.000-00,(11) 9 0000-0000,joao@empresa.com'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'modelo_usuarios.csv'
    a.click()
  }

  async function processarCSV(file: File) {
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const usuarios: UsuarioImport[] = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const obj: any = {}
      headers.forEach((h, i) => { obj[h] = cols[i] ?? '' })
      return { nome: obj.nome, email: obj.email || undefined, cpf: obj.cpf || undefined, telefone: obj.telefone || undefined }
    }).filter(u => u.nome && (u.cpf || u.telefone))
    setPreview(usuarios)
  }

  async function carregarCamposApi() {
    if (!apiUrl.trim()) return
    setCarregando(true)
    setCamposMsg('')
    try {
      let headers: Record<string, string> = {}
      if (apiHeaders.trim()) { try { headers = JSON.parse(apiHeaders) } catch { /* */ } }
      const res = await fetch(`${API_URL}/catalogos/test-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl.trim(), headers }),
      })
      const json = await res.json()
      if (json.error) { setCamposMsg(json.error); setCarregando(false); return }
      setCamposApi(json.campos ?? [])
      setCamposMsg(`${json.campos?.length ?? 0} campos encontrados · ${json.total ?? 0} registros`)
    } catch { setCamposMsg('Erro ao conectar com a API.') }
    setCarregando(false)
  }

  async function verPreviewApi() {
    if (!apiUrl.trim()) return
    setCarregando(true)
    try {
      let headers: Record<string, string> = {}
      if (apiHeaders.trim()) { try { headers = JSON.parse(apiHeaders) } catch { /* */ } }
      const res = await fetch(`${API_URL}/catalogos/test-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: apiUrl.trim(), headers }),
      })
      const json = await res.json()
      if (json.preview) {
        const usuarios = json.preview.map((item: any) => ({
          nome: mapeamento.nome ? item[mapeamento.nome] : '',
          email: mapeamento.email ? item[mapeamento.email] || undefined : undefined,
          cpf: mapeamento.cpf ? item[mapeamento.cpf] : undefined,
          telefone: mapeamento.telefone ? item[mapeamento.telefone] : undefined,
        })).filter((u: UsuarioImport) => u.nome && (u.cpf || u.telefone))
        setPreviewApi(usuarios)
      }
    } catch { /* */ }
    setCarregando(false)
  }

  async function importar() {
    const usuarios = aba === 'csv' ? preview : previewApi
    if (!usuarios.length) return
    setImportando(true)
    try {
      const res = await fetch('/api/usuarios/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarios,
          empresaId,
          fonte: aba === 'csv' ? 'csv' : 'api',
          fonteSistema: aba === 'api' && sistemaNome.trim() ? sistemaNome.trim() : undefined,
        }),
      })
      const json = await res.json()
      console.log('Importação resultado:', JSON.stringify(json))
      setResultado({ ...json, detalhes: json.detalhes })
      if (json.criados > 0) onImportado?.()
    } catch { /* */ }
    setImportando(false)
  }

  const previewAtual = aba === 'csv' ? preview : previewApi

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-800">Importar Usuários</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
          {(['csv', 'api'] as Aba[]).map(a => (
            <button key={a} onClick={() => { setAba(a); setResultado(null) }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                aba === a ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a === 'csv' ? '📄 CSV' : '🔗 API'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {resultado ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Check size={28} className="text-green-600" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-800">Importação concluída</p>
                <p className="text-sm text-green-600">✓ {resultado.criados} criados</p>
                {resultado.existentes > 0 && <p className="text-sm text-gray-500">⚠ {resultado.existentes} já existiam</p>}
                {resultado.inativados > 0 && <p className="text-sm text-orange-500">⊘ {resultado.inativados} inativados</p>}
                {resultado.erros > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm text-red-500">✗ {resultado.erros} com erro</p>
                    {resultado.message && (
                      <p className="text-xs text-red-400 bg-red-50 px-2 py-1 rounded">{resultado.message}</p>
                    )}
                    {resultado.detalhes?.erros?.slice(0, 3).map((e: any, i: number) => (
                      <p key={i} className="text-xs text-red-400 bg-red-50 px-2 py-1 rounded">{e.email}: {e.erro}</p>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={onClose}>Fechar</Button>
            </div>
          ) : (
            <>
              {aba === 'csv' && (
                <>
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Modelo CSV</p>
                      <button onClick={baixarModelo} className="flex items-center gap-1.5 text-sm text-blue-500 hover:underline">
                        <Download size={14} />baixar modelo
                      </button>
                    </div>
                    <div className="flex-1">
                      <input ref={csvRef} type="file" accept=".csv" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) { setCsvFile(f); processarCSV(f) } }} />
                      <button onClick={() => csvRef.current?.click()}
                        className={`w-full py-3 border-2 border-dashed rounded-lg text-sm transition-colors ${
                          csvFile ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-400 hover:border-orange-300'
                        }`}>
                        <Upload size={14} className="inline mr-1" />
                        {csvFile ? csvFile.name : 'Clique para enviar (.csv)'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {aba === 'api' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">URL do endpoint</label>
                      <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                        placeholder="https://api.empresa.com/usuarios"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sistema de origem <span className="text-gray-400 font-normal">(opcional)</span>
                      </label>
                      <input value={sistemaNome} onChange={e => setSistemaNome(e.target.value)}
                        placeholder="ex: Senior, Oracle EBS"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ao sincronizar, usuários removidos</label>
                      <select value={estrategia} onChange={e => setEstrategia(e.target.value as any)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200">
                        <option value="inativar">Inativar automaticamente</option>
                        <option value="manter">Manter ativos</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Headers <span className="text-gray-400 font-normal">(JSON opcional)</span></label>
                    <textarea value={apiHeaders} onChange={e => setApiHeaders(e.target.value)}
                      placeholder={'{\n  "Authorization": "Bearer TOKEN"\n}'} rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none font-mono" />
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={carregarCamposApi} disabled={carregando || !apiUrl.trim()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg">
                      <RefreshCw size={12} className={carregando ? 'animate-spin' : ''} />
                      Carregar campos
                    </button>
                    {camposMsg && <span className="text-xs text-green-600">{camposMsg}</span>}
                  </div>
                  {camposApi.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                      <p className="text-xs font-medium text-gray-600">Mapeamento</p>
                      {(['nome', 'cpf', 'telefone', 'email', 'status'] as const).map(campo => (
                        <div key={campo} className="flex items-center gap-2">
                          <span className={`text-xs font-medium w-16 ${campo === 'nome' || campo === 'cpf' || campo === 'telefone' ? 'text-orange-600' : 'text-gray-500'}`}>
                            {campo}{campo === 'nome' || campo === 'cpf' || campo === 'telefone' ? ' *' : ''}{campo === 'status' ? ' 🔵' : ''}
                          </span>
                          <span className="text-gray-400 text-xs">→</span>
                          <select value={mapeamento[campo]} onChange={e => setMapeamento(p => ({ ...p, [campo]: e.target.value }))}
                            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-orange-200">
                            <option value="">— selecione —</option>
                            {camposApi.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                  {mapeamento.status && (
                    <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg">
                      <span className="text-xs text-blue-600 font-medium">Valor que significa ATIVO:</span>
                      <input value={statusAtivo} onChange={e => setStatusAtivo(e.target.value)}
                        placeholder="ex: A, ATIVO, 1, true"
                        className="flex-1 px-2 py-1 text-xs border border-blue-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    </div>
                  )}
                  {camposApi.length > 0 && mapeamento.nome && mapeamento.cpf && mapeamento.telefone && (
                    <div className="flex items-center gap-3">
                      <button onClick={verPreviewApi} disabled={carregando}
                        className="flex items-center gap-1.5 text-sm text-orange-500 hover:underline">
                        <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} />
                        Ver prévia
                      </button>
                      <button onClick={salvarConfig} disabled={salvandoConfig}
                        className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                        {configSalva ? <Check size={13} className="text-green-500" /> : <RefreshCw size={13} className={salvandoConfig ? 'animate-spin' : ''} />}
                        {configSalva ? 'Salvo!' : salvandoConfig ? 'Salvando...' : 'Salvar configuração'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Preview */}
              {previewAtual.length > 0 && (
                <div className="border border-orange-200 rounded-lg overflow-hidden">
                  <div className="bg-orange-50 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-orange-700">{previewAtual.length} usuários para importar</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto">
                    {previewAtual.slice(0, 10).map((u, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 last:border-0">
                        <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center text-xs text-orange-600 font-bold flex-shrink-0">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{u.nome}</p>
                          <p className="text-xs text-gray-500 truncate">{u.cpf || '— sem CPF —'} · {u.telefone || '— sem telefone —'}</p>
                        </div>
                        {!u.nome || !u.cpf || !u.telefone ? <AlertCircle size={14} className="text-red-400" /> : <Check size={14} className="text-green-400" />}
                      </div>
                    ))}
                    {previewAtual.length > 10 && (
                      <p className="text-xs text-gray-400 text-center py-2">+{previewAtual.length - 10} mais</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
                <Button onClick={importar} disabled={importando || previewAtual.length === 0}>
                  {importando ? 'Importando...' : `Importar ${previewAtual.length > 0 ? `(${previewAtual.length})` : ''}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
