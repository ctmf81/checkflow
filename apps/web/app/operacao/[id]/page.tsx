'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { notificarPlanoAberto } from '@/lib/notificacoes'
import { registrarUsoArmazenamento } from '@/lib/uso'
import { useSession } from '@/contexts/SessionContext'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { chaveChecklist, salvarChecklistCache, carregarChecklistCache } from '@/lib/checklistCache'
import { buscarCatalogo, salvarCatalogoCache, carregarCatalogoCache } from '@/lib/catalogoCache'
import { enfileirarSubmissao } from '@/lib/syncQueue'
import {
  ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Type, Hash, ToggleLeft, List, BookOpen, Camera, PenLine,
  CalendarDays, MapPin, AlertCircle, Send, Clock, Locate, Search,
  QrCode, X, ImagePlus, Video, AlertTriangle, GitBranch, ClipboardList, Loader2, Ticket, FileText, WifiOff, Sparkles
} from 'lucide-react'
import NovoTicketModal from '@/components/tickets/NovoTicketModal'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface OpcaoMC {
  id: string
  label: string
  valor: string
  ordem: number
  e_valido: boolean
}

interface Atividade {
  id: string
  nome: string
  tipo: string
  obrigatoria: boolean
  critica: boolean
  gera_plano_acao: boolean
  plano_acao_sla_horas: number | null
  config: any
  ordem: number
  secao_id: string | null
  atividade_pai_id: string | null
  valor_gatilho: string | null
  dependentes?: Atividade[]
  opcoesMC?: OpcaoMC[]
  resposta?: any
}

interface Secao {
  id: string
  nome: string
  ordem: number
  atividades: Atividade[]
}

interface Motivo {
  id: string
  descricao: string
  tipo: 'checklist' | 'atividade'
}

interface Checklist {
  id: string
  nome: string
  descricao: string | null
  tempo_guarda_meses: number
  subgrupo_id: string | null
  permite_continuar_depois?: boolean
  permite_offline?: boolean
}

// ─── Icones ───────────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<string, { bg: string; Icon: any }> = {
  texto:            { bg: 'bg-orange-400',  Icon: Type },
  numero:           { bg: 'bg-green-500',   Icon: Hash },
  sim_nao:          { bg: 'bg-emerald-500', Icon: ToggleLeft },
  multipla_escolha: { bg: 'bg-blue-500',    Icon: List },
  catalogo:         { bg: 'bg-slate-500',   Icon: BookOpen },
  foto:             { bg: 'bg-rose-400',    Icon: Camera },
  video:            { bg: 'bg-pink-600',    Icon: Video },
  assinatura:       { bg: 'bg-purple-500',  Icon: PenLine },
  data_hora:        { bg: 'bg-sky-400',     Icon: CalendarDays },
  localizacao:      { bg: 'bg-amber-600',   Icon: MapPin },
}

function TipoIcon({ tipo }: { tipo: string }) {
  const cfg = TIPO_CONFIG[tipo] ?? { bg: 'bg-gray-400', Icon: Type }
  return (
    <div className={`w-8 h-8 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
      <cfg.Icon size={15} className="text-white" />
    </div>
  )
}

// ─── Indicador de validação ──────────────────────────────────────────────────

function ValidacaoTag({ valido }: { valido: boolean | null }) {
  if (valido === null) return null
  return valido
    ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><CheckCircle2 size={12} />Conforme</span>
    : <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><XCircle size={12} />Não conforme</span>
}

export function calcularValidacao(atividade: Atividade): boolean | null {
  let val = atividade.resposta
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'object' && val?._nao_executavel) return null
  // Preenchimento por foto (IA): resposta = { valor, foto_ia } → valida pelo valor.
  if (val && typeof val === 'object' && 'foto_ia' in val) val = val.valor
  if (val === null || val === undefined || val === '') return null
  const cfg = atividade.config ?? {}

  if (atividade.tipo === 'sim_nao') {
    if (!cfg.esperado) return null
    return val === cfg.esperado
  }
  if (atividade.tipo === 'numero') {
    const n = Number(val)
    if (isNaN(n)) return null
    if (cfg.min !== null && cfg.min !== undefined && n < cfg.min) return false
    if (cfg.max !== null && cfg.max !== undefined && n > cfg.max) return false
    return true
  }
  if (atividade.tipo === 'padrao') {
    // resposta: { numero, instancia_id, valor_min, valor_max } — a instância já
    // foi resolvida no momento da resposta (ver CampoPadrao), com base na
    // combinação de variáveis escolhida. Sem instância correspondente → null
    // (não dá pra validar; o sistema não tem uma faixa esperada pra comparar).
    if (typeof val !== 'object') return null
    if (!val.instancia_id) return null
    const n = Number(val.numero)
    if (isNaN(n)) return null
    if (val.valor_min !== null && val.valor_min !== undefined && n < Number(val.valor_min)) return false
    if (val.valor_max !== null && val.valor_max !== undefined && n > Number(val.valor_max)) return false
    return true
  }
  if (atividade.tipo === 'multipla_escolha') {
    const opcoes = atividade.opcoesMC ?? []
    if (!opcoes.length) return null
    const selecionados = Array.isArray(val) ? val : [val]
    if (selecionados.length === 0) return null
    // Não conforme se alguma selecionada tem e_valido=false OU não existe mais
    const temInvalido = selecionados.some(v => {
      const op = opcoes.find(o => o.valor === v || o.label === v)
      // opção deletada = tratar como inválida
      return !op || !op.e_valido
    })
    return !temInvalido
  }
  return null
}

// ─── Campos por tipo ──────────────────────────────────────────────────────────

// Leitor de QR/Barcode via câmera (BarcodeDetector API)
async function lerCodigoDeCamera(
  tipo: 'qrcode' | 'barcode',
  onResult: (val: string) => void,
  onErro: (msg: string) => void
) {
  // @ts-ignore
  if (typeof BarcodeDetector === 'undefined') {
    onErro('Leitura de código não suportada neste navegador. Use Chrome no Android.')
    return
  }

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  // setAttribute é necessário — a propriedade JS não ativa o capture em todos os browsers
  input.setAttribute('capture', 'environment')

  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const formats = tipo === 'qrcode'
        ? ['qr_code']
        : ['code_128','code_39','ean_13','ean_8','upc_a','upc_e','itf','codabar','data_matrix','pdf417','aztec']
      // @ts-ignore
      const detector = new BarcodeDetector({ formats })
      const bitmap = await createImageBitmap(file)
      const codes: any[] = await detector.detect(bitmap)
      if (codes.length === 0) { onErro('Nenhum código encontrado. Tente novamente mais perto.'); return }
      onResult(codes[0].rawValue)
    } catch (e: any) {
      onErro('Erro ao processar imagem: ' + (e.message ?? String(e)))
    }
  }
  input.click()
}

// Texto com máscara + QR/Barcode
function CampoTexto({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const cfg = atividade.config ?? {}
  const mascara: string = cfg.mascara ?? ''
  const val: string = atividade.resposta ?? ''
  const [erroCodigo, setErroCodigo] = useState<string | null>(null)
  // Sem máscara → textarea que cresce com o texto (inclusive quando a IA preenche).
  const usaTextarea = !mascara
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const t = taRef.current
    if (t) { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 400)}px` }
  }, [val])

  function indexOfMatch(input: string, from: number, re: RegExp): number {
    for (let k = from; k < input.length; k++) if (re.test(input[k])) return k
    return -1
  }

  function aplicarMascara(input: string): string {
    if (!mascara) return input
    let result = ''
    let j = 0
    for (let i = 0; i < mascara.length && j < input.length; i++) {
      if (mascara[i] === '9' || mascara[i] === '0') {
        // '9' e '0' = wildcard de dígito; procura à frente o próximo dígito válido
        const k = indexOfMatch(input, j, /\d/)
        if (k === -1) continue
        result += input[k]
        j = k + 1
      } else if (mascara[i] === 'A') {
        const k = indexOfMatch(input, j, /[a-zA-Z]/)
        if (k === -1) continue
        result += input[k].toUpperCase()
        j = k + 1
      } else if (mascara[i] === '*') {
        result += input[j++]
      } else {
        result += mascara[i]
        if (input[j] === mascara[i]) j++
      }
    }
    return result
  }

  function handleScanQR() {
    setErroCodigo(null)
    lerCodigoDeCamera('qrcode', val => {
      onChange(mascara ? aplicarMascara(val.replace(/\W/g, '')) : val)
    }, setErroCodigo)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-start">
        {usaTextarea ? (
          <textarea
            ref={taRef}
            value={val}
            onChange={e => onChange(e.target.value)}
            placeholder="Digite aqui..."
            rows={2}
            className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none overflow-y-auto leading-relaxed"
          />
        ) : (
          <input
            value={val}
            onChange={e => onChange(aplicarMascara(e.target.value.replace(/\W/g, '')))}
            placeholder={mascara}
            className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
          />
        )}
        {cfg.qrcode && (
          <button title="Ler QR Code" onClick={handleScanQR}
            className="px-3 py-2.5 bg-gray-800 text-white rounded-xl text-xs flex items-center gap-1 hover:bg-gray-700 active:scale-95 transition-transform">
            <QrCode size={16} />
          </button>
        )}
      </div>
      {mascara && <p className="text-xs text-gray-400">Formato: {mascara}</p>}
      {erroCodigo && <p className="text-xs text-red-500">{erroCodigo}</p>}
    </div>
  )
}

// Número com validação de range
function CampoNumero({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const cfg = atividade.config ?? {}
  const val = atividade.resposta ?? ''
  const n = Number(val)
  const fora = val !== '' && !isNaN(n) && (
    (cfg.min !== null && cfg.min !== undefined && n < cfg.min) ||
    (cfg.max !== null && cfg.max !== undefined && n > cfg.max)
  )
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-center">
        <input type="number" inputMode="decimal" step="any" value={val} onChange={e => onChange(e.target.value)}
          placeholder="Digite o valor"
          className={`flex-1 px-3 py-2.5 text-sm border rounded-xl bg-gray-50 focus:outline-none focus:ring-2 ${
            fora ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-orange-200'
          }`} />
        {cfg.unidade && <span className="text-sm text-gray-500 font-medium whitespace-nowrap">{cfg.unidade}</span>}
      </div>
      {cfg.exibir_referencia !== false && ((cfg.min !== null && cfg.min !== undefined) || (cfg.max !== null && cfg.max !== undefined)) ? (
        <p className="text-xs text-gray-400">
          Esperado: {cfg.min !== null && cfg.min !== undefined ? `mín ${cfg.min}` : ''}{cfg.min !== null && cfg.max !== null ? ' — ' : ''}{cfg.max !== null && cfg.max !== undefined ? `máx ${cfg.max}` : ''} {cfg.unidade ?? ''}
        </p>
      ) : null}
      {fora && cfg.exibir_referencia !== false && <p className="text-xs text-red-500">Valor fora do intervalo esperado</p>}
    </div>
  )
}

// Sim / Não
function CampoSimNao({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const val = atividade.resposta
  const esperado = atividade.config?.esperado
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {['sim', 'nao'].map(op => (
          <button key={op} onClick={() => onChange(op)}
            className={`flex-1 py-3.5 rounded-xl text-sm font-bold border-2 transition-all ${
              val === op
                ? op === 'sim' ? 'bg-green-500 border-green-500 text-white' : 'bg-red-500 border-red-500 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {op === 'sim' ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
      {esperado && val && val !== esperado && atividade.config?.exibir_referencia !== false && (
        <p className="text-xs text-red-500">Esperado: {esperado === 'sim' ? 'Sim' : 'Não'}</p>
      )}
    </div>
  )
}

// Múltipla escolha (com e_valido)
function CampoMultiplaEscolha({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const opcoes = atividade.opcoesMC ?? []
  const multiplo = atividade.config?.multiplo ?? false
  const val = atividade.resposta

  if (!opcoes.length) return (
    <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">Nenhuma opção cadastrada.</p>
  )

  // Mais de 3 opções e seleção única: usar dropdown para economizar espaço
  if (!multiplo && opcoes.length > 3) {
    const opSelecionada = opcoes.find(op => op.valor === val)
    const invalido = !!opSelecionada && !opSelecionada.e_valido
    return (
      <div className="space-y-1">
        <select
          value={val ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className={`w-full px-3 py-2 border-2 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 ${
            invalido ? 'border-red-400 text-red-700' : 'border-gray-200 text-gray-700'
          }`}
        >
          <option value="">Selecione...</option>
          {opcoes.map(op => (
            <option key={op.id} value={op.valor}>{op.label}</option>
          ))}
        </select>
        {invalido && (
          <p className="text-xs text-red-500 flex items-center gap-1"><XCircle size={12} /> Resposta fora do esperado</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {opcoes.map(op => {
        const selecionado = multiplo ? (Array.isArray(val) && val.includes(op.valor)) : val === op.valor
        const invalido = selecionado && !op.e_valido
        return (
          <button key={op.id} onClick={() => {
            if (multiplo) {
              const arr: string[] = Array.isArray(val) ? [...val] : []
              onChange(selecionado ? arr.filter(x => x !== op.valor) : [...arr, op.valor])
            } else {
              onChange(selecionado ? null : op.valor)
            }
          }}
            className={`w-full text-left px-4 py-3 rounded-xl text-sm border-2 transition-all flex items-center justify-between gap-2 ${
              invalido  ? 'bg-red-50 border-red-400 text-red-700' :
              selecionado ? 'bg-orange-50 border-orange-400 text-orange-700 font-medium' :
              'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selecionado ? (invalido ? 'border-red-400 bg-red-400' : 'border-orange-400 bg-orange-400') : 'border-gray-300'
              }`}>
                {selecionado && <div className="w-2 h-2 bg-white rounded-full" />}
              </div>
              {op.label}
            </div>
            {invalido && <XCircle size={14} className="text-red-400 flex-shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}

// Catálogo
function CampoCatalogo({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const [itens, setItens] = useState<any[]>([])
  const [catalogo, setCatalogo] = useState<any>(null)
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const val = atividade.resposta

  useEffect(() => {
    const catId = atividade.config?.catalogo_id
    if (!catId) { setCarregando(false); return }
    const sb = createClient()

    // Tenta online; ao obter, cacheia p/ uso offline. Se falhar (sem rede),
    // cai no cache local.
    const usarCache = () => carregarCatalogoCache(catId).then(snap => {
      if (snap) { setCatalogo(snap.catalogo); setItens(snap.valores) }
      setCarregando(false)
    })

    buscarCatalogo(sb, catId)
      .then(snap => {
        if (snap) {
          setCatalogo(snap.catalogo)
          setItens(snap.valores)
          setCarregando(false)
          salvarCatalogoCache(catId, snap)
        } else {
          usarCache()
        }
      })
      .catch(() => { usarCache() })
  }, [atividade.id])

  if (!atividade.config?.catalogo_id) return (
    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">Catálogo não configurado.</p>
  )
  if (carregando) return <p className="text-xs text-gray-400 py-2">Carregando catálogo...</p>

  function norm(s: string | null | undefined) {
    return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  }
  const buscaNorm = norm(busca)
  const filtrados = itens.filter(i =>
    norm(i.valor_chave).includes(buscaNorm) ||
    norm(i.atributo_1).includes(buscaNorm) ||
    norm(i.atributo_2).includes(buscaNorm)
  )

  const selecionado = itens.find(i => i.id === val?.id)

  // Monta lista de atributos nomeados do catálogo para exibir no card
  function atributosItem(item: any) {
    const labels = [catalogo?.atributo_1, catalogo?.atributo_2, catalogo?.atributo_3, catalogo?.atributo_4]
    const vals   = [item.atributo_1,     item.atributo_2,     item.atributo_3,     item.atributo_4]
    return labels.map((l, i) => ({ label: l, valor: vals[i] })).filter(x => x.label && x.valor)
  }

  if (selecionado) {
    const attrs = atributosItem(selecionado)
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
        {/* Imagem se existir */}
        {selecionado.imagem_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selecionado.imagem_url} alt={selecionado.valor_chave}
            className="w-full max-h-48 object-cover border-b border-orange-100" />
        )}
        <div className="px-3 py-2.5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide">
                {catalogo?.campo_chave ?? 'Código'}
              </p>
              <p className="text-base font-bold text-orange-900 leading-tight">{selecionado.valor_chave}</p>
            </div>
            <button onClick={() => onChange(null)} className="p-1 text-orange-400 hover:text-orange-600 flex-shrink-0 mt-0.5">
              <X size={15} />
            </button>
          </div>
          {attrs.length > 0 && (
            <div className="space-y-1.5 mt-2 pt-2 border-t border-orange-100">
              {attrs.map(({ label, valor }) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="text-xs text-orange-500 font-medium min-w-[80px] flex-shrink-0">{label}:</span>
                  <span className="text-xs text-orange-800">{valor}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder={`Buscar ${catalogo?.campo_chave ?? 'item'}...`}
          className="w-full pl-8 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
      </div>
      {busca && (
        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
          {filtrados.length === 0
            ? <p className="text-xs text-gray-400 px-3 py-3 text-center">Nenhum resultado</p>
            : filtrados.slice(0, 20).map(item => (
              <button key={item.id} onClick={() => { onChange(item); setBusca('') }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-orange-50 border-b border-gray-100 last:border-0 transition-colors flex items-center gap-3">
                {item.imagem_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imagem_url} alt="" className="w-9 h-9 object-cover rounded-lg flex-shrink-0 border border-gray-100" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{item.valor_chave}</p>
                  {item.atributo_1 && <p className="text-xs text-gray-400 truncate">{item.atributo_1}</p>}
                </div>
              </button>
            ))
          }
        </div>
      )}
    </div>
  )
}

// Padrão: o usuário escolhe a combinação de variáveis aplicável e informa o
// valor numérico medido. O sistema procura a instância com a combinação exata
// e guarda a faixa [valor_min, valor_max] resolvida junto da resposta — assim
// calcularValidacao() compara sem precisar acessar o banco de novo.
function CampoPadrao({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const padraoId = atividade.config?.padrao_id
  const val = atividade.resposta ?? {}
  const [carregando, setCarregando] = useState(true)
  const [variaveis, setVariaveis] = useState<{ id: string; nome: string; valores: { id: string; valor: string }[] }[]>([])
  const [instancias, setInstancias] = useState<{ id: string; valor_min: number | null; valor_max: number | null; combinacao: Record<string, string> }[]>([])

  useEffect(() => {
    if (!padraoId) { setCarregando(false); return }
    const sb = createClient()
    Promise.all([
      sb.from('padrao_variaveis').select('ordem, variavel:variaveis(id, nome, variavel_valores(id, valor, ordem))')
        .eq('padrao_id', padraoId).order('ordem'),
      sb.from('padrao_instancias').select('id, valor_min, valor_max, padrao_instancia_valores(variavel_id, valor_id)')
        .eq('padrao_id', padraoId),
    ]).then(([{ data: pv }, { data: insts }]) => {
      setVariaveis((pv ?? []).map((x: any) => ({
        id: x.variavel.id, nome: x.variavel.nome,
        valores: (x.variavel.variavel_valores ?? []).sort((a: any, b: any) => a.ordem - b.ordem),
      })))
      setInstancias((insts ?? []).map((i: any) => ({
        id: i.id,
        valor_min: i.valor_min === null ? null : Number(i.valor_min),
        valor_max: i.valor_max === null ? null : Number(i.valor_max),
        combinacao: Object.fromEntries((i.padrao_instancia_valores ?? []).map((v: any) => [v.variavel_id, v.valor_id])),
      })))
      setCarregando(false)
    })
  }, [atividade.id, padraoId])

  if (!padraoId) return <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">Padrão não configurado.</p>
  if (carregando) return <p className="text-xs text-gray-400 py-2">Carregando padrão...</p>

  const valoresEscolhidos: Record<string, string> = val.valores ?? {}
  const combinacaoCompleta = variaveis.length > 0 && variaveis.every(v => valoresEscolhidos[v.id])
  const instanciaResolvida = combinacaoCompleta
    ? instancias.find(i => variaveis.every(v => i.combinacao[v.id] === valoresEscolhidos[v.id]))
    : undefined

  function setValorVariavel(variavelId: string, valorId: string) {
    const novosValores = { ...valoresEscolhidos, [variavelId]: valorId }
    aplicar(novosValores, val.numero)
  }
  function setNumero(numero: string) {
    aplicar(valoresEscolhidos, numero)
  }
  function aplicar(valores: Record<string, string>, numero: any) {
    const completa = variaveis.length > 0 && variaveis.every(v => valores[v.id])
    const inst = completa ? instancias.find(i => variaveis.every(v => i.combinacao[v.id] === valores[v.id])) : undefined
    onChange({
      valores,
      numero,
      instancia_id: inst?.id ?? null,
      valor_min: inst?.valor_min ?? null,
      valor_max: inst?.valor_max ?? null,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {variaveis.map(v => (
          <div key={v.id}>
            <label className="block text-xs text-gray-500 mb-1">{v.nome}</label>
            <select value={valoresEscolhidos[v.id] ?? ''} onChange={e => setValorVariavel(v.id, e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Selecione...</option>
              {v.valores.map(o => <option key={o.id} value={o.id}>{o.valor}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Valor medido</label>
        <input value={val.numero ?? ''} onChange={e => setNumero(e.target.value)}
          inputMode="decimal" placeholder="Digite o valor..."
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
      </div>

      {combinacaoCompleta && !instanciaResolvida && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          Não há valor de referência cadastrado para essa combinação — a resposta não poderá ser validada automaticamente.
        </p>
      )}
      {instanciaResolvida && val.numero !== '' && val.numero !== undefined && val.numero !== null && (
        <p className="text-xs text-gray-400">
          Faixa de referência: {instanciaResolvida.valor_min ?? '–'} a {instanciaResolvida.valor_max ?? '–'}
        </p>
      )}
    </div>
  )
}

// Localização (apenas GPS)
function CampoLocalizacao({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const [buscando, setBuscando] = useState(false)
  const [erroGPS, setErroGPS] = useState<string | null>(null)
  const val = atividade.resposta

  async function pegarLocalizacao() {
    if (!navigator.geolocation) { setErroGPS('GPS não disponível neste dispositivo.'); return }
    setBuscando(true)
    setErroGPS(null)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        let endereco = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
            headers: { 'Accept-Language': 'pt-BR' }
          })
          const data = await r.json()
          if (data.display_name) endereco = data.display_name
        } catch { /* usa coordenadas */ }
        onChange({ lat, lng, endereco })
        setBuscando(false)
      },
      err => {
        let msg = 'Não foi possível obter sua localização.'
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permissão de localização negada. Habilite o acesso à localização nas configurações do navegador para este site.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Localização indisponível neste dispositivo/rede. Tente em um celular com GPS ou em outra rede.'
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tempo esgotado ao obter localização. Tente novamente em um local com melhor sinal.'
        }
        if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
          msg = 'A localização só funciona em conexões seguras (HTTPS). Acesse o sistema via https:// para usar este recurso.'
        }
        setErroGPS(msg)
        setBuscando(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  if (val?.endereco) return (
    <div className="space-y-2">
      <div className="flex items-start justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 gap-2">
        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-green-800 font-medium">Localização capturada</p>
            <p className="text-xs text-green-700 mt-0.5">{val.endereco}</p>
          </div>
        </div>
        <button onClick={() => onChange(null)} className="text-green-400 hover:text-green-600 flex-shrink-0">
          <X size={14} />
        </button>
      </div>
      <button onClick={pegarLocalizacao} disabled={buscando}
        className="w-full py-2 text-xs text-orange-500 border border-orange-200 rounded-xl hover:bg-orange-50 transition-colors">
        Atualizar localização
      </button>
    </div>
  )

  return (
    <div className="space-y-2">
      <button onClick={pegarLocalizacao} disabled={buscando}
        className="w-full py-3.5 bg-orange-500 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-60 transition-colors active:scale-[0.99]">
        {buscando ? <><Clock size={16} className="animate-pulse" />Obtendo localização...</> : <><Locate size={16} />Usar localização atual</>}
      </button>
      {erroGPS && <p className="text-xs text-red-500">{erroGPS}</p>}
      {atividade.config?.endereco && (
        <p className="text-xs text-gray-400">Referência: {atividade.config.endereco}</p>
      )}
    </div>
  )
}

// ── Limites de mídia (fixos, globais) ─────────────────────────
const MAX_FOTOS = 5              // máximo de fotos por evidência (plano de ação)
const MAX_VIDEO_SEG = 10         // duração máxima do vídeo gravado
const VIDEO_BITRATE = 1_500_000  // ~1,5 Mbps de vídeo → ~2 MB em 10s
const FOTO_MAX_PX = 1600         // lado maior após compressão
const FOTO_QUALIDADE = 0.8       // qualidade JPEG

// Comprime/redimensiona uma imagem no navegador antes do upload, para
// padronizar o tamanho e poupar a cota de armazenamento. Se algo falhar,
// devolve o arquivo original (degradação graciosa).
async function comprimirImagem(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, FOTO_MAX_PX / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * escala)
    const h = Math.round(bitmap.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', FOTO_QUALIDADE))
    if (!blob) return file
    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// Data/Hora — pré-preenche com o horário atual (local) quando ainda não respondida
function CampoDataHora({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  useEffect(() => {
    if (atividade.resposta) return
    const agora = new Date()
    // Ajusta o fuso para o formato datetime-local (YYYY-MM-DDTHH:mm)
    const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    onChange(local.toISOString().slice(0, 16))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <input type="datetime-local" value={atividade.resposta ?? ''} onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
  )
}

// Foto
function CampoFoto({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const val = atividade.resposta

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const comprimida = await comprimirImagem(file)
    const url = URL.createObjectURL(comprimida)
    onChange({ file: comprimida, url, nome: comprimida.name })
  }

  if (val?.url) return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={val.url} alt="Foto" className="w-full max-h-48 object-cover rounded-xl border border-gray-200" />
      <button onClick={() => onChange(null)}
        className="w-full py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
        Remover foto
      </button>
    </div>
  )

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFile} />
      <button onClick={() => inputRef.current?.click()}
        className="w-full py-3.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 flex items-center justify-center gap-2 hover:border-orange-300 hover:text-orange-500 transition-colors active:scale-[0.99]">
        <ImagePlus size={18} />Tirar foto / Selecionar imagem
      </button>
    </>
  )
}

// base64 (sem o prefixo data:) de um Blob — para enviar a imagem à IA.
function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

// Preenchimento por foto (IA): captura uma imagem, envia à IA com o prompt da
// atividade e devolve o valor do campo (escalar) + a foto (guardada p/ evidência
// no finalize). Exige conexão. Usado em texto/sim_nao/numero com config.ia_foto.
function CampoIAFoto({ atividade, foto, onValor, onFoto }: {
  atividade: Atividade
  foto?: { file: File; url: string }
  onValor: (v: any) => void
  onFoto: (f: { file: File; url: string } | null) => void
}) {
  const { empresaAtiva, unidadeAtiva } = useSession()
  const online = useOnlineStatus()
  const inputRef = useRef<HTMLInputElement>(null)
  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro] = useState('')
  const [preview, setPreview] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErro(''); setAnalisando(true)
    try {
      const comprimida = await comprimirImagem(file)
      const url = URL.createObjectURL(comprimida)
      const base64 = await blobParaBase64(comprimida)
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/ia/interpretar-foto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          atividadeId: atividade.id, imageBase64: base64,
          mimeType: comprimida.type || 'image/jpeg',
          empresaId: empresaAtiva?.id, unidadeId: unidadeAtiva?.id,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error ?? 'Não foi possível analisar a imagem.'); return }
      onValor(json.valor ?? '')
      onFoto({ file: comprimida, url })
    } catch {
      setErro('Falha ao analisar a imagem. Tente novamente.')
    } finally {
      setAnalisando(false)
    }
  }

  return (
    <div className="mt-2">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {foto?.url && (
        <div className="flex items-center gap-2 mb-2">
          <button type="button" onClick={() => setPreview(true)} title="Ver imagem"
            className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 hover:border-violet-300 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.url} alt="Foto analisada" className="w-full h-full object-cover" />
          </button>
          <span className="text-xs text-gray-500">Foto analisada pela IA (guardada como evidência)</span>
        </div>
      )}
      {preview && foto?.url && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={() => setPreview(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt="Foto analisada pela IA" className="max-w-full max-h-full rounded-lg" />
          <button type="button" onClick={() => setPreview(false)}
            className="absolute top-4 right-4 text-white/90 bg-white/10 rounded-full p-2 hover:bg-white/20">
            <X size={20} />
          </button>
        </div>
      )}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={analisando || !online}
        className="w-full py-2.5 border-2 border-dashed border-violet-200 rounded-xl text-sm text-violet-600 flex items-center justify-center gap-2 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50 transition-colors active:scale-[0.99]">
        {analisando ? <><Loader2 size={16} className="animate-spin" />Analisando…</> : <><Sparkles size={16} />{foto ? 'Refazer análise por foto' : 'Preencher por foto (IA)'}</>}
      </button>
      {!online && <p className="text-[11px] text-amber-600 mt-1">Sem conexão — a análise por IA precisa de internet.</p>}
      {erro && <p className="text-xs text-red-500 mt-1">{erro}</p>}
    </div>
  )
}

// Gravador de vídeo inline via getUserMedia (funciona em desktop e mobile)
function GravadorVideo({ onGravado }: { onGravado: (file: File, url: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [tempoSeg, setTempoSeg] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))
  }, [])

  const iniciarStream = useCallback(async () => {
    setErro(null)
    try {
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: mobile
          ? { facingMode: 'environment' }
          : { facingMode: 'user', aspectRatio: { ideal: 1 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setPronto(true)
    } catch {
      setErro('Não foi possível acessar a câmera. Verifique as permissões do navegador.')
    }
  }, [])

  useEffect(() => {
    iniciarStream()
    return () => {
      // Para gravação ativa antes de limpar a stream
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [iniciarStream])

  function iniciarGravacao() {
    if (!streamRef.current) return
    chunksRef.current = []
    // Bitrate fixo para manter o arquivo pequeno e previsível (~2 MB em 10s)
    let mr: MediaRecorder
    try {
      mr = new MediaRecorder(streamRef.current, { videoBitsPerSecond: VIDEO_BITRATE, audioBitsPerSecond: 128_000 })
    } catch {
      mr = new MediaRecorder(streamRef.current) // fallback se o navegador recusar as opções
    }
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const file = new File([blob], `gravacao_${Date.now()}.webm`, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      streamRef.current?.getTracks().forEach(t => t.stop())
      onGravado(file, url)
    }
    mediaRecorderRef.current = mr
    mr.start()
    setGravando(true)
    setTempoSeg(0)
    // Para automaticamente ao atingir a duração máxima
    timerRef.current = setInterval(() => setTempoSeg(s => {
      const novo = s + 1
      if (novo >= MAX_VIDEO_SEG) pararGravacao()
      return novo
    }), 1000)
  }

  function pararGravacao() {
    mediaRecorderRef.current?.stop()
    setGravando(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const mm = String(Math.floor(tempoSeg / 60)).padStart(2, '0')
  const ss = String(tempoSeg % 60).padStart(2, '0')

  return (
    <div className="space-y-2">
      {erro ? (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{erro}</p>
        </div>
      ) : (
        <div className={`relative bg-black rounded-xl overflow-hidden ${isMobile ? '' : 'aspect-square max-w-sm mx-auto'}`}>
          <video ref={videoRef} muted playsInline
            className={isMobile ? 'w-full max-h-56 object-cover' : 'w-full h-full object-cover'} />
          {gravando && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-0.5">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-white font-mono">{mm}:{ss} / 00:{String(MAX_VIDEO_SEG).padStart(2, '0')}</span>
            </div>
          )}
        </div>
      )}
      {!erro && (
        gravando ? (
          <button onClick={pararGravacao}
            className="w-full py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-600 active:scale-[0.99] transition-all">
            <span className="w-3 h-3 bg-white rounded-sm" />
            Parar gravação
          </button>
        ) : (
          pronto && (
            <button onClick={iniciarGravacao}
              className="w-full py-2.5 bg-pink-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-pink-700 active:scale-[0.99] transition-all">
              <Camera size={16} />
              Iniciar gravação (máx {MAX_VIDEO_SEG}s)
            </button>
          )
        )
      )}
    </div>
  )
}

// Vídeo (câmera via getUserMedia ou galeria)
function CampoVideo({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const inputGaleriaRef = useRef<HTMLInputElement>(null)
  const [modoCamera, setModoCamera] = useState(false)
  const val = atividade.resposta

  function handleFile(file: File, origem: 'camera' | 'galeria') {
    const dataArquivo = new Date(file.lastModified)
    const agora = new Date()
    const diffHoras = (agora.getTime() - dataArquivo.getTime()) / (1000 * 60 * 60)
    const antigo = origem === 'galeria' && diffHoras > 1
    const url = URL.createObjectURL(file)
    onChange({ file, url, nome: file.name, origem, dataArquivo: dataArquivo.toISOString(), antigo })
  }

  if (modoCamera) return (
    <div className="space-y-2">
      <GravadorVideo onGravado={(file, url) => {
        setModoCamera(false)
        const agora = new Date().toISOString()
        onChange({ file, url, nome: file.name, origem: 'camera', dataArquivo: agora, antigo: false })
      }} />
      <button onClick={() => setModoCamera(false)}
        className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors">
        Cancelar
      </button>
    </div>
  )

  if (val?.url) return (
    <div className="space-y-2">
      {val.antigo && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Arquivo antigo detectado</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Este vídeo foi criado em {new Date(val.dataArquivo).toLocaleString('pt-BR')}.
              Certifique-se de que é o vídeo correto.
            </p>
          </div>
        </div>
      )}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <video src={val.url} controls className="w-full max-h-56 object-contain" />
      </div>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          {val.origem === 'camera'
            ? <Camera size={12} className="text-gray-400" />
            : <Video size={12} className="text-gray-400" />
          }
          <p className="text-xs text-gray-400">
            {val.origem === 'camera' ? 'Gravado agora' : `Da galeria · ${new Date(val.dataArquivo).toLocaleString('pt-BR')}`}
          </p>
        </div>
        <button onClick={() => onChange(null)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
          <X size={12} />Remover
        </button>
      </div>
    </div>
  )

  return (
    <>
      <input ref={inputGaleriaRef} type="file" accept="video/*"
        className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, 'galeria'); e.target.value = '' }} />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setModoCamera(true)}
          className="py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 flex flex-col items-center justify-center gap-2 hover:border-pink-300 hover:text-pink-500 transition-colors active:scale-[0.99]">
          <Camera size={20} />
          <span className="text-xs font-medium">Gravar vídeo</span>
        </button>
        <button onClick={() => inputGaleriaRef.current?.click()}
          className="py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 flex flex-col items-center justify-center gap-2 hover:border-pink-300 hover:text-pink-500 transition-colors active:scale-[0.99]">
          <Video size={20} />
          <span className="text-xs font-medium">Escolher da galeria</span>
        </button>
      </div>
    </>
  )
}

// Dispatcher
function CampoResposta({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const cfg = atividade.config ?? {}
  switch (atividade.tipo) {
    case 'texto':            return <CampoTexto atividade={atividade} onChange={onChange} />
    case 'numero':           return <CampoNumero atividade={atividade} onChange={onChange} />
    case 'sim_nao':          return <CampoSimNao atividade={atividade} onChange={onChange} />
    case 'multipla_escolha': return <CampoMultiplaEscolha atividade={atividade} onChange={onChange} />
    case 'catalogo':         return <CampoCatalogo atividade={atividade} onChange={onChange} />
    case 'padrao':           return <CampoPadrao atividade={atividade} onChange={onChange} />
    case 'localizacao':      return <CampoLocalizacao atividade={atividade} onChange={onChange} />
    case 'foto':             return <CampoFoto atividade={atividade} onChange={onChange} />
    case 'video':            return <CampoVideo atividade={atividade} onChange={onChange} />
    case 'assinatura':
      return (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center">
          <PenLine size={22} className="text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-gray-400">Assinatura (disponível no app móvel)</p>
        </div>
      )
    case 'data_hora':      return <CampoDataHora atividade={atividade} onChange={onChange} />

    default:
      return (
        <input value={atividade.resposta ?? ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
      )
  }
}

// ─── Modal Plano de Ação ──────────────────────────────────────────────────────

interface DadosPlano {
  observacao: string
  fotos: { file: File; url: string }[]
  video: { file: File; url: string } | null
  causaRaizId?: string | null
  causaRaizObs?: string
}

interface CausaOpt { id: string; nome: string }
interface OcorrenciaItem { id: string; observacao: string | null; criado_em: string; causa_nome: string; usuario_nome: string | null }

function PlanoAcaoModal({ atividade, subgrupoId, checklistId, unidadeId, dadosIniciais, onClose, onConfirmar }: {
  atividade: Atividade
  subgrupoId: string | null
  checklistId: string
  unidadeId: string
  dadosIniciais?: DadosPlano
  onClose: () => void
  onConfirmar: (dados: DadosPlano) => void
}) {
  const [observacao, setObservacao] = useState(dadosIniciais?.observacao ?? '')
  const [fotos, setFotos] = useState<{ file: File; url: string }[]>(dadosIniciais?.fotos ?? [])
  const [video, setVideo] = useState<{ file: File; url: string } | null>(dadosIniciais?.video ?? null)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Causa raiz — só para quem resolve (N1/N2). Banco de causas (≠ ocorrências).
  const [ehResolvedor, setEhResolvedor] = useState(false)
  const [causas, setCausas] = useState<CausaOpt[]>([])
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaItem[]>([])
  const [causaRaizId, setCausaRaizId] = useState(dadosIniciais?.causaRaizId ?? '')
  const [causaRaizObs, setCausaRaizObs] = useState(dadosIniciais?.causaRaizObs ?? '')
  const [adicionando, setAdicionando] = useState(false)
  const [novaCausaNome, setNovaCausaNome] = useState('')
  const [salvandoCausa, setSalvandoCausa] = useState(false)

  async function carregarCausas() {
    const { data } = await createClient().from('causa_raiz')
      .select('id, nome').eq('atividade_id', atividade.id).eq('status', 'ativo').order('nome')
    if (data) setCausas(data)
  }

  // Causa raiz NÃO pertence à abertura do plano — é análise da MODERAÇÃO
  // (N1/N2 na tela do plano em /gestao/planos-acao). Aqui o operador só reporta
  // a não conformidade. Por isso o campo fica desabilitado na abertura.
  useEffect(() => { setEhResolvedor(false) }, [atividade.id, subgrupoId])

  async function adicionarCausa() {
    const nome = novaCausaNome.trim()
    if (!nome) return
    setSalvandoCausa(true)
    const sb = createClient()
    const { data: sg } = await sb.from('subgrupos').select('grupo_id').eq('id', subgrupoId!).maybeSingle()
    const { data: nova, error } = await sb.from('causa_raiz').insert({
      nome, unidade_id: unidadeId, subgrupo_id: subgrupoId, grupo_id: sg?.grupo_id ?? null,
      checklist_id: checklistId, atividade_id: atividade.id, status: 'ativo',
    }).select('id, nome').single()
    setSalvandoCausa(false)
    if (error || !nova) return
    await carregarCausas()
    setCausaRaizId(nova.id)
    setNovaCausaNome('')
    setAdicionando(false)
  }

  async function adicionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (fotos.length >= MAX_FOTOS) return
    const comprimida = await comprimirImagem(file)
    setFotos(prev => prev.length >= MAX_FOTOS ? prev : [...prev, { file: comprimida, url: URL.createObjectURL(comprimida) }])
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ClipboardList size={15} className="text-red-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">Abrir Plano de Ação</p>
              <p className="text-xs text-gray-400 truncate max-w-[220px]">{atividade.nome}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          {/* Observação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observação <span className="text-red-400">*</span>
            </label>
            <textarea
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Descreva o problema encontrado e o contexto..."
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
            />
          </div>

          {/* Causa raiz — só para quem resolve (N1/N2) */}
          {ehResolvedor && (
            <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/50 space-y-2.5">
              <label className="block text-sm font-medium text-gray-700">Causa raiz <span className="text-gray-400 font-normal">(opcional)</span></label>

              {!adicionando ? (
                <div className="flex gap-2">
                  <select value={causaRaizId} onChange={e => setCausaRaizId(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200">
                    <option value="">Selecione a causa raiz…</option>
                    {causas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <button type="button" onClick={() => setAdicionando(true)}
                    className="px-3 py-2 text-sm text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 whitespace-nowrap">+ Nova</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={novaCausaNome} onChange={e => setNovaCausaNome(e.target.value)}
                    placeholder="Nome da nova causa raiz" autoFocus
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200" />
                  <button type="button" onClick={adicionarCausa} disabled={salvandoCausa || !novaCausaNome.trim()}
                    className="px-3 py-2 text-sm bg-orange-500 text-white rounded-lg disabled:opacity-40">{salvandoCausa ? '...' : 'Salvar'}</button>
                  <button type="button" onClick={() => { setAdicionando(false); setNovaCausaNome('') }}
                    className="px-2 py-2 text-sm text-gray-400">✕</button>
                </div>
              )}

              {causaRaizId && (
                <textarea value={causaRaizObs} onChange={e => setCausaRaizObs(e.target.value)} rows={2}
                  placeholder="Observação da causa raiz (opcional)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
              )}

              {ocorrencias.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs text-gray-400 mb-1">Últimas ocorrências deste campo:</p>
                  <ul className="space-y-1">
                    {ocorrencias.map(o => (
                      <li key={o.id} className="text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{o.causa_nome}</span>
                        {o.observacao && <span> — {o.observacao}</span>}
                        <span className="text-gray-400"> ({new Date(o.criado_em).toLocaleDateString('pt-BR')}{o.usuario_nome ? `, ${o.usuario_nome}` : ''})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Evidências */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Evidências</label>
            <p className="text-xs text-gray-400 mb-3">Adicione até <strong>{MAX_FOTOS} fotos</strong> ou <strong>um vídeo de {MAX_VIDEO_SEG}s</strong> — não os dois.{fotos.length > 0 && <span className="text-gray-500"> ({fotos.length}/{MAX_FOTOS})</span>}</p>

            {/* Grid de fotos existentes */}
            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {fotos.map((f, i) => (
                  <div key={i} className="relative aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className="w-full h-full object-cover rounded-xl border border-gray-200" />
                    <button onClick={() => setFotos(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Botão adicionar foto — disponível se não tiver vídeo e abaixo do limite */}
            {video === null && fotos.length < MAX_FOTOS && (
              <>
                <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={adicionarFoto} />
                <button onClick={() => fotoInputRef.current?.click()}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 flex items-center justify-center gap-2 hover:border-red-300 hover:text-red-500 transition-colors mb-2">
                  <ImagePlus size={15} />
                  {fotos.length > 0 ? 'Adicionar mais fotos' : 'Adicionar foto'}
                </button>
              </>
            )}
            {video === null && fotos.length >= MAX_FOTOS && (
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-2">Limite de {MAX_FOTOS} fotos atingido.</p>
            )}

            {/* Separador OU */}
            {fotos.length === 0 && video === null && (
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400">ou</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            )}

            {/* Vídeo — disponível se não tiver fotos */}
            {fotos.length === 0 && (
              video ? (
                <div className="space-y-2">
                  <video src={video.url} controls className="w-full rounded-xl border border-gray-200 max-h-44 bg-black" />
                  <button onClick={() => setVideo(null)}
                    className="w-full py-2 text-xs text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
                    Remover vídeo
                  </button>
                </div>
              ) : (
                <>
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setVideo({ file: f, url: URL.createObjectURL(f) }); e.target.value = '' }} />
                  <button onClick={() => videoInputRef.current?.click()}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 flex items-center justify-center gap-2 hover:border-red-300 hover:text-red-500 transition-colors">
                    <Video size={15} />Adicionar vídeo
                  </button>
                </>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium">
            Cancelar
          </button>
          <button
            onClick={() => { if (observacao.trim()) onConfirmar({ observacao: observacao.trim(), fotos, video, causaRaizId: causaRaizId || null, causaRaizObs: causaRaizObs.trim() }) }}
            disabled={!observacao.trim()}
            className="flex-1 py-3 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600 disabled:opacity-40 transition-colors">
            Abrir plano
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Item de atividade ────────────────────────────────────────────────────────

function AtividadeItem({ atividade, onResposta, onAbrirPlanoAcao, planosCapturados, motivosAtividade, onFotoIA, fotosIA, permiteOffline, iaDisponivel, nivel = 0 }: {
  atividade: Atividade
  onResposta: (id: string, val: any) => void
  onAbrirPlanoAcao: (atv: Atividade) => void
  planosCapturados: Record<string, DadosPlano>
  motivosAtividade: Motivo[]
  onFotoIA: (id: string, foto: { file: File; url: string } | null) => void
  fotosIA: Record<string, { file: File; url: string }>
  permiteOffline: boolean
  iaDisponivel: boolean
  nivel?: number
}) {
  const [escolhendoMotivo, setEscolhendoMotivo] = useState(false)
  const [motivoSel, setMotivoSel] = useState('')

  const respondida = atividade.resposta !== undefined && atividade.resposta !== null && atividade.resposta !== ''
  const naoExecutavel = typeof atividade.resposta === 'object' && atividade.resposta?._nao_executavel
  const validacao = calcularValidacao(atividade)

  function confirmarNaoExecutar() {
    if (!motivoSel) return
    const m = motivosAtividade.find(mo => mo.id === motivoSel)
    onResposta(atividade.id, { _nao_executavel: true, motivo_id: motivoSel, motivo_descricao: m?.descricao ?? '' })
    setEscolhendoMotivo(false)
    setMotivoSel('')
  }

  const dependentesVisiveis = (atividade.dependentes ?? []).filter(dep => {
    if (!dep.valor_gatilho) return true
    const resp = atividade.resposta
    if (Array.isArray(resp)) return resp.includes(dep.valor_gatilho)
    return String(resp ?? '') === dep.valor_gatilho
  })

  return (
    <div className={nivel > 0 ? 'ml-3 border-l-2 border-orange-100 pl-3' : ''}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
        <div className="flex items-start gap-3 mb-3">
          <TipoIcon tipo={atividade.tipo} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-gray-800 leading-snug">
                {atividade.nome}
                {(atividade.obrigatoria || atividade.critica) && <span className="text-red-400 ml-1">*</span>}
              </p>
            </div>
            {respondida && <ValidacaoTag valido={validacao} />}
          </div>
          {respondida && validacao === null && (
            <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
          )}
        </div>
        {naoExecutavel ? (
          <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
            <AlertTriangle size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-600">Não executado</p>
              <p className="text-xs text-gray-500 mt-0.5">Motivo: {atividade.resposta.motivo_descricao}</p>
            </div>
            <button onClick={() => onResposta(atividade.id, undefined)}
              className="text-xs text-gray-400 hover:text-gray-600 underline flex-shrink-0">Desfazer</button>
          </div>
        ) : (() => {
          // IA por foto exige internet no momento da captura → escondida se o
          // checklist permite offline (evita capturar online e perder a evidência ao finalizar offline).
          const usaIaFoto = iaDisponivel && !permiteOffline && ['texto', 'sim_nao', 'numero'].includes(atividade.tipo) && atividade.config?.ia_foto
          const iaEditavel = atividade.config?.ia_editavel !== false
          const campoIA = usaIaFoto
            ? <CampoIAFoto atividade={atividade} foto={fotosIA[atividade.id]}
                onValor={v => onResposta(atividade.id, v)} onFoto={f => onFotoIA(atividade.id, f)} />
            : null
          // IA-foto travada (não editável): mostra o valor read-only + a captura
          if (usaIaFoto && !iaEditavel) {
            return (
              <>
                {respondida && (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
                    {atividade.tipo === 'sim_nao' ? (atividade.resposta === 'sim' ? 'Sim' : 'Não') : String(atividade.resposta)}
                    {atividade.tipo === 'numero' && atividade.config?.unidade ? ` ${atividade.config.unidade}` : ''}
                  </div>
                )}
                {campoIA}
              </>
            )
          }
          return <>
            <CampoResposta atividade={atividade} onChange={val => onResposta(atividade.id, val)} />
            {campoIA}
          </>
        })()}

        {/* Não consigo executar esta atividade */}
        {!naoExecutavel && atividade.obrigatoria && motivosAtividade.length > 0 && (
          <div className="mt-2">
            {escolhendoMotivo ? (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                <select value={motivoSel} onChange={e => setMotivoSel(e.target.value)}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200">
                  <option value="">Selecione o motivo...</option>
                  {motivosAtividade.map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
                </select>
                <button onClick={confirmarNaoExecutar} disabled={!motivoSel}
                  className="text-xs font-medium text-orange-600 disabled:opacity-40 flex-shrink-0">Confirmar</button>
                <button onClick={() => { setEscolhendoMotivo(false); setMotivoSel('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setEscolhendoMotivo(true)}
                className="text-xs text-gray-400 hover:text-orange-500 underline transition-colors">
                Não consigo executar esta atividade
              </button>
            )}
          </div>
        )}

        {/* Botão plano de ação — aparece quando validação falha e atividade tem gera_plano_acao */}
        {validacao === false && atividade.gera_plano_acao && (
          <div className="mt-3">
            {planosCapturados[atividade.id] ? (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <CheckCircle2 size={14} className="text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700 font-medium flex-1">Plano de ação registrado</p>
                <button onClick={() => onAbrirPlanoAcao(atividade)}
                  className="text-xs text-amber-600 underline font-medium">Editar</button>
              </div>
            ) : (
              <button onClick={() => onAbrirPlanoAcao(atividade)}
                className="w-full py-2.5 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 hover:bg-red-100 active:scale-[0.99] transition-all">
                <ClipboardList size={14} />Abrir Plano de Ação
              </button>
            )}
          </div>
        )}
      </div>
      {dependentesVisiveis.map(dep => (
        <AtividadeItem key={dep.id} atividade={dep} onResposta={onResposta}
          onAbrirPlanoAcao={onAbrirPlanoAcao} planosCapturados={planosCapturados}
          motivosAtividade={motivosAtividade} onFotoIA={onFotoIA} fotosIA={fotosIA} permiteOffline={permiteOffline} iaDisponivel={iaDisponivel} nivel={nivel + 1} />
      ))}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ExecucaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { unidadeAtiva, empresaAtiva, flagsHabilitadas } = useSession()
  // IA por foto depende da característica 'ia' do plano (opt-in: null = sem restrição).
  const iaDisponivel = flagsHabilitadas === null || flagsHabilitadas.has('ia')
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [respostas, setRespostas] = useState<Record<string, any>>({})
  // Fotos capturadas p/ preenchimento por IA (texto/sim_nao/numero). Guardadas
  // aqui até o finalize, quando são enviadas ao storage como evidência.
  const [fotosIA, setFotosIA] = useState<Record<string, { file: File; url: string }>>({})
  const [secaoAberta, setSecaoAberta] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroFinalizar, setErroFinalizar] = useState<string | null>(null)
  const [concluido, setConcluido] = useState(false)
  const [enfileiradoOffline, setEnfileiradoOffline] = useState(false)
  const [resultadoFinal, setResultadoFinal] = useState<'aprovado' | 'reprovado' | null>(null)
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'gerando' | 'pronto' | 'erro'>('idle')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [execConcluidaId, setExecConcluidaId] = useState<string | null>(null)
  // Planos de ação capturados durante a execução (salvos no finalizar)
  const [planosCapturados, setPlanosCapturados] = useState<Record<string, DadosPlano>>({})
  const [modalPlanoAtividade, setModalPlanoAtividade] = useState<Atividade | null>(null)
  // ID do item de workflow que originou esta execução (vem via ?wf_item=)
  const [wfItemId, setWfItemId] = useState<string | null>(null)
  // ID de uma execução agendada pendente (vem via ?exec=) — completa a
  // execução existente em vez de criar uma nova
  const [execAgendadaId, setExecAgendadaId] = useState<string | null>(null)
  // Início desta sessão de execução (abertura da tela) — usado só na execução
  // "de uma vez" (fresh insert) para medir o tempo médio nos painéis. Retomada,
  // agendada e workflow não usam (a média fica sobre execuções contínuas).
  const iniciadoEmRef = useRef(new Date().toISOString())
  // Motivos de não execução associados ao checklist (separados por tipo)
  const [motivosChecklist, setMotivosChecklist] = useState<Motivo[]>([])
  const [motivosAtividade, setMotivosAtividade] = useState<Motivo[]>([])
  const [naoExecModal, setNaoExecModal] = useState(false)
  const [motivoChecklistSel, setMotivoChecklistSel] = useState('')
  const [obsNaoExec, setObsNaoExec] = useState('')
  const [enviandoNaoExec, setEnviandoNaoExec] = useState(false)

  const online = useOnlineStatus()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setWfItemId(params.get('wf_item'))
    setExecAgendadaId(params.get('exec'))
  }, [])

  // Aguarda a unidade ativa carregar (SessionContext é assíncrono) antes de
  // buscar — senão a query roda com unidade vazia e falha com "não encontrado".
  useEffect(() => { if (unidadeAtiva?.id) carregar() }, [id, unidadeAtiva?.id])

  // Constrói o formulário (árvore de atividades + seções + motivos) a partir
  // dos dados crus. Usado tanto pelo carregamento online quanto pelo cache offline.
  function montarFormulario(
    cl: any,
    secoesData: any[] | null,
    atvsData: any[],
    opcoesMap: Record<string, OpcaoMC[]>,
    motivosTodos: Motivo[],
  ) {
    setChecklist(cl)

    const atvMap = new Map<string, Atividade>()
    atvsData.forEach((a: any) => atvMap.set(a.id, { ...a, dependentes: [], opcoesMC: opcoesMap[a.id] ?? [] }))
    const raizes: Atividade[] = []
    atvsData.forEach((a: any) => {
      if (a.atividade_pai_id && atvMap.has(a.atividade_pai_id)) {
        atvMap.get(a.atividade_pai_id)!.dependentes!.push(atvMap.get(a.id)!)
      } else {
        raizes.push(atvMap.get(a.id)!)
      }
    })

    const secoesComAtv: Secao[] = (secoesData ?? []).map((s: any) => ({
      ...s, atividades: raizes.filter(a => a.secao_id === s.id),
    }))
    const semSecao = raizes.filter(a => !a.secao_id)
    if (semSecao.length > 0) {
      secoesComAtv.push({ id: '__sem_secao__', nome: 'Atividades', ordem: 9999, atividades: semSecao })
    }

    setSecoes(secoesComAtv)
    if (secoesComAtv.length > 0) setSecaoAberta(secoesComAtv[0].id)

    setMotivosChecklist(motivosTodos.filter(m => m.tipo === 'checklist'))
    setMotivosAtividade(motivosTodos.filter(m => m.tipo === 'atividade'))
  }

  async function carregar() {
    setLoading(true); setErroCarregar(null)
    const sb = createClient()
    const cacheKey = chaveChecklist(id, unidadeAtiva!.id)

    const { data: cl, error: clErr } = await sb.from('checklists')
      .select('id, nome, descricao, tempo_guarda_meses, subgrupo_id, permite_continuar_depois, permite_offline')
      .eq('id', id)
      .eq('unidade_id', unidadeAtiva!.id)
      .single()

    // Sem rede (ou sem acesso): tenta a definição cacheada para renderizar o
    // formulário mesmo offline.
    if (clErr || !cl) {
      const snap = await carregarChecklistCache(cacheKey)
      if (snap) {
        montarFormulario(
          snap.cl, snap.secoesData as any[], snap.atvsData as any[],
          snap.opcoesMap as any, snap.motivos as any,
        )
        setLoading(false)
        return
      }
      setErroCarregar(`Checklist não encontrado ou sem permissão de acesso`); setLoading(false); return
    }

    const { data: secoesData } = await sb.from('checklist_secoes')
      .select('id, nome, ordem').eq('checklist_id', id).order('ordem')

    const { data: atvsData, error: atvErr } = await sb.from('checklist_atividades')
      .select('id, nome, tipo, obrigatoria, critica, gera_plano_acao, plano_acao_sla_horas, config, ordem, atividade_pai_id, valor_gatilho, secao_id')
      .eq('checklist_id', id).order('ordem')

    if (atvErr) { setErroCarregar(`Erro: ${atvErr.message}`); setLoading(false); return }
    if (!atvsData || atvsData.length === 0) { setErroCarregar(`Checklist sem atividades`); setLoading(false); return }

    // Busca opções de múltipla escolha de todas as atividades de uma vez
    const idsMC = atvsData.filter((a: any) => a.tipo === 'multipla_escolha').map((a: any) => a.id)
    const opcoesMap: Record<string, OpcaoMC[]> = {}
    if (idsMC.length > 0) {
      const { data: opcs } = await sb.from('checklist_atividade_opcoes')
        .select('id, atividade_id, label, valor, ordem, e_valido')
        .in('atividade_id', idsMC).order('ordem')
      if (opcs) {
        for (const op of opcs) {
          if (!opcoesMap[op.atividade_id]) opcoesMap[op.atividade_id] = []
          opcoesMap[op.atividade_id].push(op)
        }
      }
    }

    // Carrega motivos de não execução associados a este checklist
    const { data: motivosVinculo } = await sb
      .from('checklist_nao_execucao_motivos')
      .select('motivo:motivo_id(id, descricao, tipo)')
      .eq('checklist_id', id)
    const motivosTodos: Motivo[] = (motivosVinculo ?? [])
      .map((m: any) => Array.isArray(m.motivo) ? m.motivo[0] : m.motivo)
      .filter(Boolean)

    // Monta o formulário e guarda a definição em cache (uso offline futuro).
    montarFormulario(cl, secoesData, atvsData, opcoesMap, motivosTodos)
    salvarChecklistCache(cacheKey, {
      cl, secoesData: secoesData ?? [], atvsData, opcoesMap, motivos: motivosTodos, cachedAt: Date.now(),
    } as any)

    // Retomada: se reabrindo uma execução existente (?exec=), restaura as
    // respostas já salvas (fotos/vídeos voltam como {url} — a UI faz preview).
    const execParam = new URLSearchParams(window.location.search).get('exec')
    if (execParam) {
      const { data: respSalvas } = await sb.from('checklist_execucao_respostas')
        .select('atividade_id, resposta')
        .eq('execucao_id', execParam)
      if (respSalvas && respSalvas.length > 0) {
        const mapa: Record<string, any> = {}
        for (const r of respSalvas) if (r.resposta != null) {
          const rv = r.resposta
          // IA-foto: resposta salva = { valor, foto_ia } → restaura só o valor (escalar)
          mapa[r.atividade_id] = (rv && typeof rv === 'object' && 'foto_ia' in rv) ? rv.valor : rv
        }
        setRespostas(mapa)
      }
    }

    setLoading(false)
  }

  function setResposta(atividadeId: string, valor: any) {
    setRespostas(prev => ({ ...prev, [atividadeId]: valor }))
  }

  function setFotoIA(atividadeId: string, foto: { file: File; url: string } | null) {
    setFotosIA(prev => { const n = { ...prev }; if (foto) n[atividadeId] = foto; else delete n[atividadeId]; return n })
  }

  function injetarRespostas(atividades: Atividade[]): Atividade[] {
    return atividades.map(a => ({
      ...a, resposta: respostas[a.id],
      dependentes: injetarRespostas(a.dependentes ?? []),
    }))
  }

  // Conta só atividades visíveis (respeita gatilhos de dependentes)
  function calcularProgresso() {
    let total = 0, respondidas = 0
    function contar(atividades: Atividade[]) {
      atividades.forEach(a => {
        total++
        const r = respostas[a.id]
        if (r !== undefined && r !== null && r !== '' && !(Array.isArray(r) && r.length === 0)) respondidas++
        const visiveis = (a.dependentes ?? []).filter(dep => {
          if (!dep.valor_gatilho) return true
          const resp = respostas[a.id]
          return Array.isArray(resp) ? resp.includes(dep.valor_gatilho) : String(resp ?? '') === dep.valor_gatilho
        })
        if (visiveis.length) contar(visiveis)
      })
    }
    secoes.forEach(s => contar(s.atividades))
    return { total, respondidas }
  }

  // Retorna lista plana de todas as atividades visíveis (para validação e save)
  function listarAtividadesVisiveis(): Atividade[] {
    const lista: Atividade[] = []
    function coletar(atividades: Atividade[]) {
      atividades.forEach(a => {
        const comResp = { ...a, resposta: respostas[a.id] }
        lista.push(comResp)
        const visiveis = (a.dependentes ?? []).filter(dep => {
          if (!dep.valor_gatilho) return true
          const resp = respostas[a.id]
          return Array.isArray(resp) ? resp.includes(dep.valor_gatilho) : String(resp ?? '') === dep.valor_gatilho
        })
        if (visiveis.length) coletar(visiveis)
      })
    }
    secoes.forEach(s => coletar(s.atividades))
    return lista
  }

  // Seção que contém uma atividade (busca raízes + dependentes) — usada para
  // levar o operador até um campo pendente que está numa seção colapsada.
  function secaoDaAtividade(atividadeId: string): string | null {
    const contem = (atvs: Atividade[]): boolean =>
      atvs.some(a => a.id === atividadeId || contem(a.dependentes ?? []))
    return secoes.find(s => contem(s.atividades))?.id ?? null
  }

  // Abre a seção do campo e rola até ela (o acordeão mantém só uma seção aberta;
  // sem isso, o erro de finalização aponta para um campo que o operador não vê).
  function irParaAtividade(atividadeId: string) {
    const secId = secaoDaAtividade(atividadeId)
    if (!secId) return
    setSecaoAberta(secId)
    setTimeout(() => {
      document.getElementById(`secao-${secId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  // Limite de tamanho para uploads
  const MAX_FOTO_MB = 10
  const MAX_VIDEO_MB = 100

  // Registra que o checklist inteiro não pôde ser executado, com motivo selecionado
  async function naoExecutarChecklist() {
    if (!unidadeAtiva || !checklist || !motivoChecklistSel) return
    setEnviandoNaoExec(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setEnviandoNaoExec(false); return }

    const agora = new Date()
    const expiracao = new Date(Date.UTC(agora.getFullYear(), agora.getMonth() + (checklist.tempo_guarda_meses ?? 12), agora.getDate()))
    const dataExpiracao = `${expiracao.getUTCFullYear()}-${String(expiracao.getUTCMonth() + 1).padStart(2, '0')}-${String(expiracao.getUTCDate()).padStart(2, '0')}`

    // Veio de um agendado (?exec=): reaproveita a MESMA linha (marca não
    // executado + assume o operador), senão ela ficaria eterna em "Agendados
    // pendentes" (em_andamento/executado_por null). Avulso: insere linha nova.
    const { error } = execAgendadaId
      ? await sb.from('checklist_execucoes').update({
          executado_por: user.id,
          status: 'nao_executado',
          data_expiracao: dataExpiracao,
          motivo_nao_execucao_id: motivoChecklistSel,
          motivo_nao_execucao_obs: obsNaoExec.trim() || null,
        }).eq('id', execAgendadaId)
      : await sb.from('checklist_execucoes').insert({
          checklist_id: checklist.id,
          unidade_id: unidadeAtiva.id,
          executado_por: user.id,
          data_execucao: agora.toISOString(),
          data_expiracao: dataExpiracao,
          status: 'nao_executado',
          motivo_nao_execucao_id: motivoChecklistSel,
          motivo_nao_execucao_obs: obsNaoExec.trim() || null,
        })

    setEnviandoNaoExec(false)
    if (error) { setErroFinalizar('Erro ao registrar não execução. Tente novamente.'); return }
    setNaoExecModal(false)
    router.push('/operacao')
  }

  // Salva o progresso parcial e volta — só para checklists "pode continuar depois"
  async function continuarDepois() {
    if (!unidadeAtiva || !checklist) return
    setErroFinalizar(null)

    // Exige internet: "Continuar depois" cria/atualiza um em_andamento no
    // servidor. Offline não há onde guardar o parcial (sem rascunho local) —
    // avisa em vez de falhar em silêncio (getUser volta null offline).
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErroFinalizar('"Continuar depois" precisa de internet. Offline, finalize o checklist para salvá-lo no aparelho (ele sincroniza ao reconectar).')
      return
    }

    // Bloqueio por limite do plano — só ao criar uma execução nova
    if (!execAgendadaId && empresaAtiva?.id) {
      const { data: pode } = await createClient().rpc('billing_pode_executar', { p_empresa_id: empresaAtiva.id })
      if (pode === false) {
        setErroFinalizar('Limite de execuções do plano atingido neste período. Contate o administrador para fazer upgrade ou comprar um pacote adicional.')
        return
      }
    }

    setSalvando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSalvando(false); return }
    const agora = new Date()

    // Reutiliza a execução reaberta (?exec=) ou cria um header em_andamento novo
    let execId = execAgendadaId
    if (execId) {
      await sb.from('checklist_execucoes').update({ executado_por: user.id, status: 'em_andamento' }).eq('id', execId)
    } else {
      const { data, error } = await sb.from('checklist_execucoes').insert({
        checklist_id: checklist.id, unidade_id: unidadeAtiva.id,
        executado_por: user.id, status: 'em_andamento', data_execucao: agora.toISOString(),
      }).select('id').single()
      if (error || !data) { setSalvando(false); setErroFinalizar('Erro ao salvar o progresso. Tente novamente.'); return }
      execId = data.id
    }

    const uploadArquivo = async (file: File, path: string): Promise<string | null> => {
      const { error } = await sb.storage.from('execucoes').upload(path, file, { contentType: file.type, upsert: true })
      if (error) return null
      registrarUsoArmazenamento(empresaAtiva?.id, 'execucao', file.size)
      return sb.storage.from('execucoes').getPublicUrl(path).data.publicUrl
    }

    const visiveis = listarAtividadesVisiveis()
    const linhas = await Promise.all(visiveis
      .filter(a => { const r = respostas[a.id]; return r !== undefined && r !== null && r !== '' })
      .map(async a => {
        let resposta: any = respostas[a.id]
        if (a.tipo === 'foto' && resposta?.file instanceof File) {
          const ext = resposta.file.name.split('.').pop() ?? 'jpg'
          const url = await uploadArquivo(resposta.file, `${execId}/${a.id}.${ext}`)
          resposta = url ? { url, nome: resposta.nome } : { nome: resposta.nome }
        }
        if (a.tipo === 'video' && resposta?.file instanceof File) {
          const ext = resposta.file.name.split('.').pop() ?? 'mp4'
          const url = await uploadArquivo(resposta.file, `${execId}/${a.id}.${ext}`)
          resposta = url ? { url, nome: resposta.nome, origem: resposta.origem, dataArquivo: resposta.dataArquivo } : { nome: resposta.nome }
        }
        return { execucao_id: execId, atividade_id: a.id, resposta: JSON.parse(JSON.stringify(resposta)) }
      }))

    // Regrava o snapshot parcial das respostas
    await sb.from('checklist_execucao_respostas').delete().eq('execucao_id', execId)
    if (linhas.length > 0) await sb.from('checklist_execucao_respostas').insert(linhas)

    setSalvando(false)
    router.push('/operacao')
  }

  async function finalizar() {
    if (!unidadeAtiva || !checklist) return
    setErroFinalizar(null)

    // Bloqueio por limite do plano (só para execução nova — agendada já foi
    // contada). Pula offline: a checagem de billing exige rede; a fila reenvia
    // depois e o admin acerta cobrança se necessário.
    if (navigator.onLine && !execAgendadaId && empresaAtiva?.id) {
      const { data: pode } = await createClient().rpc('billing_pode_executar', { p_empresa_id: empresaAtiva.id })
      if (pode === false) {
        setErroFinalizar('Limite de execuções do plano atingido neste período. Contate o administrador para fazer upgrade ou comprar um pacote adicional.')
        return
      }
    }

    // Valida obrigatórias
    const visiveis = listarAtividadesVisiveis()
    const pendentes = visiveis.filter(a => {
      if (!a.obrigatoria) return false
      const r = respostas[a.id]
      return r === undefined || r === null || r === '' || (Array.isArray(r) && r.length === 0)
    })
    if (pendentes.length > 0) {
      setErroFinalizar(`${pendentes.length} campo(s) obrigatório(s) sem resposta: ${pendentes.map(a => a.nome).join(', ')}`)
      irParaAtividade(pendentes[0].id)
      return
    }

    // Reprovar item com "gera plano de ação" EXIGE o plano preenchido (a
    // observação é obrigatória no modal). Sem isso, a não conformidade ficaria
    // sem tratativa registrada.
    const planosFaltando = visiveis.filter(a =>
      a.gera_plano_acao && calcularValidacao(a) === false && !planosCapturados[a.id]
    )
    if (planosFaltando.length > 0) {
      setErroFinalizar(`Abra o plano de ação para: ${planosFaltando.map(a => a.nome).join(', ')}`)
      irParaAtividade(planosFaltando[0].id)
      return
    }

    // Valida tamanho dos arquivos antes de enviar
    for (const a of visiveis) {
      const r = respostas[a.id]
      if (a.tipo === 'foto' && r?.file instanceof File) {
        if (r.file.size > MAX_FOTO_MB * 1024 * 1024) {
          setErroFinalizar(`Foto em "${a.nome}" excede ${MAX_FOTO_MB}MB. Reduza o tamanho e tente novamente.`)
          return
        }
      }
      if (a.tipo === 'video' && r?.file instanceof File) {
        if (r.file.size > MAX_VIDEO_MB * 1024 * 1024) {
          setErroFinalizar(`Vídeo em "${a.nome}" excede ${MAX_VIDEO_MB}MB. Reduza o tamanho e tente novamente.`)
          return
        }
      }
    }

    // Valida tamanho das evidências de planos de ação
    for (const [, plano] of Object.entries(planosCapturados)) {
      for (const f of plano.fotos) {
        if (f.file.size > MAX_FOTO_MB * 1024 * 1024) {
          setErroFinalizar(`Uma foto do plano de ação excede ${MAX_FOTO_MB}MB.`)
          return
        }
      }
      if (plano.video && plano.video.file.size > MAX_VIDEO_MB * 1024 * 1024) {
        setErroFinalizar(`O vídeo do plano de ação excede ${MAX_VIDEO_MB}MB.`)
        return
      }
    }

    // Bloqueio por capacidade de armazenamento do plano (online apenas)
    if (navigator.onLine && empresaAtiva?.id) {
      let bytesUpload = 0
      for (const a of visiveis) {
        const r = respostas[a.id]
        if ((a.tipo === 'foto' || a.tipo === 'video') && r?.file instanceof File) bytesUpload += r.file.size
      }
      for (const [, plano] of Object.entries(planosCapturados)) {
        for (const f of plano.fotos) bytesUpload += f.file.size
        if (plano.video) bytesUpload += plano.video.file.size
      }
      if (bytesUpload > 0) {
        const { data: cabe } = await createClient().rpc('billing_armazenamento_disponivel', { p_empresa_id: empresaAtiva.id, p_bytes: bytesUpload })
        if (cabe === false) {
          setErroFinalizar('Capacidade de armazenamento do plano atingida. Contate o administrador para ampliar o plano ou comprar mais espaço.')
          return
        }
      }
    }

    // ── Caminho OFFLINE: sem rede, enfileira a execução (incl. planos de ação)
    // para envio automático quando a conexão voltar. Workflow e execução
    // agendada ainda exigem conexão (entram por outro fluxo).
    if (!navigator.onLine) {
      if (wfItemId || execAgendadaId) {
        setErroFinalizar('Sem conexão. Esta execução (workflow ou execução agendada) precisa de internet para finalizar. Use "Continuar depois" e finalize quando a conexão voltar.')
        return
      }
      setSalvando(true)
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) { setSalvando(false); setErroFinalizar('Sessão expirada. Faça login novamente.'); return }

      const agora = new Date()
      const expiracao = new Date(Date.UTC(agora.getFullYear(), agora.getMonth() + (checklist.tempo_guarda_meses ?? 12), agora.getDate()))
      const dataExpiracao = `${expiracao.getUTCFullYear()}-${String(expiracao.getUTCMonth() + 1).padStart(2, '0')}-${String(expiracao.getUTCDate()).padStart(2, '0')}`
      const naoConformesOff = visiveis.filter(a => calcularValidacao({ ...a, resposta: respostas[a.id] }) === false)
      const resultadoOff: 'aprovado' | 'reprovado' = naoConformesOff.length > 0 ? 'reprovado' : 'aprovado'
      const execId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

      const respostasPend = visiveis.map(a => {
        const r: any = respostas[a.id] ?? null
        const conforme = calcularValidacao({ ...a, resposta: r })
        let arquivo: any = null
        let valor: any = null
        if ((a.tipo === 'foto' || a.tipo === 'video') && r?.file instanceof File) {
          const ext = r.file.name.split('.').pop() ?? (a.tipo === 'foto' ? 'jpg' : 'mp4')
          arquivo = { blob: r.file, nome: r.nome ?? null, ext, origem: r.origem, dataArquivo: r.dataArquivo }
        } else {
          valor = r !== null ? JSON.parse(JSON.stringify(r)) : null
        }
        return { atividade_id: a.id, tipo: a.tipo, conforme, valor, arquivo, obrigatoria: !!a.obrigatoria }
      })

      // Planos de ação capturados → blobs (foto/vídeo) p/ envio na sincronização
      const planosPend = Object.entries(planosCapturados).map(([atividadeId, plano]) => ({
        atividadeId,
        observacao: plano.observacao,
        slaHoras: visiveis.find(a => a.id === atividadeId)?.plano_acao_sla_horas ?? null,
        causaRaizId: plano.causaRaizId ?? null,
        causaRaizObs: plano.causaRaizObs ?? null,
        fotos: plano.fotos.map(f => ({ blob: f.file, ext: f.file.name.split('.').pop() ?? 'jpg' })),
        video: plano.video ? { blob: plano.video.file, ext: plano.video.file.name.split('.').pop() ?? 'mp4' } : null,
      }))

      await enfileirarSubmissao({
        localId: execId, execId, checklistId: checklist.id, checklistSubgrupoId: checklist.subgrupo_id ?? null,
        unidadeId: unidadeAtiva.id, empresaId: empresaAtiva?.id ?? null, userId: session.user.id,
        agoraISO: agora.toISOString(), dataExpiracao, resultado: resultadoOff,
        respostas: respostasPend, planos: planosPend, createdAt: Date.now(),
      })

      setSalvando(false)
      setEnfileiradoOffline(true)
      return
    }

    setSalvando(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()

    if (!user) {
      setSalvando(false)
      setErroFinalizar('Sessão expirada. Faça login novamente.')
      return
    }

    const agora = new Date()
    const expiracao = new Date(Date.UTC(agora.getFullYear(), agora.getMonth() + (checklist.tempo_guarda_meses ?? 12), agora.getDate()))
    const dataExpiracao = `${expiracao.getUTCFullYear()}-${String(expiracao.getUTCMonth() + 1).padStart(2, '0')}-${String(expiracao.getUTCDate()).padStart(2, '0')}`

    // Busca o nome do usuário uma única vez (fora do loop de planos)
    const { data: perfil } = await sb.from('usuarios').select('nome').eq('id', user.id).single()
    const atorNome = perfil?.nome ?? 'Operador'

    // Calcula resultado global
    const naoConformes = visiveis.filter(a => calcularValidacao({ ...a, resposta: respostas[a.id] }) === false)
    const resultado: 'aprovado' | 'reprovado' = naoConformes.length > 0 ? 'reprovado' : 'aprovado'

    // Header da execução: cria uma nova OU completa a execução agendada pendente
    const statusInicial = wfItemId ? 'em_andamento' : 'concluido'
    let execId: string

    if (execAgendadaId) {
      // Execução agendada: assume a pendência existente em vez de duplicar
      const { data: assumida, error: execErr } = await sb.from('checklist_execucoes').update({
        executado_por: user.id,
        data_execucao: agora.toISOString(),
        data_expiracao: dataExpiracao,
        status: statusInicial,
        resultado: wfItemId ? null : resultado,
      }).eq('id', execAgendadaId).eq('status', 'em_andamento').select('id')

      if (execErr || !assumida || assumida.length === 0) {
        setSalvando(false)
        setErroFinalizar('Esta execução agendada não está mais disponível (pode já ter sido concluída por outro operador).')
        return
      }
      execId = execAgendadaId
    } else {
      const { data: execucao, error: execErr } = await sb.from('checklist_execucoes').insert({
        checklist_id: checklist.id,
        unidade_id: unidadeAtiva.id,
        executado_por: user.id,
        data_execucao: agora.toISOString(),
        data_expiracao: dataExpiracao,
        status: statusInicial,
        resultado: wfItemId ? null : resultado,
        // Só na execução "de uma vez" (sem workflow): marca o início da sessão
        // p/ o tempo médio dos painéis. Workflow começa em_andamento e não conta.
        iniciado_em: wfItemId ? null : iniciadoEmRef.current,
      }).select('id').single()

      if (execErr || !execucao) {
        setSalvando(false)
        setErroFinalizar('Erro ao salvar execução. Tente novamente.')
        return
      }
      execId = execucao.id
    }

    // Se veio de workflow: linka o item antes de concluir
    if (wfItemId) {
      await sb.from('workflow_item_execucoes').update({
        checklist_execucao_id: execId,
        status: 'em_andamento',
        iniciado_em: agora.toISOString(),
      }).eq('id', wfItemId)
    }

    // Helper de upload com validação de erro
    async function uploadArquivo(file: File, path: string): Promise<string | null> {
      const { error } = await sb.storage.from('execucoes').upload(path, file, { contentType: file.type, upsert: true })
      if (error) return null
      registrarUsoArmazenamento(empresaAtiva?.id, 'execucao', file.size)
      return sb.storage.from('execucoes').getPublicUrl(path).data.publicUrl
    }

    // Monta respostas com uploads. Falha de upload em atividade OBRIGATÓRIA
    // aborta a finalização — sem isso, uma foto obrigatória sumia em silêncio.
    const falhasUpload: string[] = []
    const linhasRespostas = await Promise.all(visiveis.map(async a => {
      let resposta = respostas[a.id] ?? null
      if (a.tipo === 'foto' && resposta?.file instanceof File) {
        const ext = resposta.file.name.split('.').pop() ?? 'jpg'
        const url = await uploadArquivo(resposta.file, `${execId}/${a.id}.${ext}`)
        if (!url && a.obrigatoria) falhasUpload.push(a.nome)
        resposta = url ? { url, nome: resposta.nome } : { nome: resposta.nome }
      }
      if (a.tipo === 'video' && resposta?.file instanceof File) {
        const ext = resposta.file.name.split('.').pop() ?? 'mp4'
        const url = await uploadArquivo(resposta.file, `${execId}/${a.id}.${ext}`)
        if (!url && a.obrigatoria) falhasUpload.push(a.nome)
        resposta = url ? { url, nome: resposta.nome, origem: resposta.origem, dataArquivo: resposta.dataArquivo } : { nome: resposta.nome }
      }
      // IA por foto (texto/sim_nao/numero): sobe a foto como evidência e grava
      // { valor, foto_ia }. `conforme` vem do valor (calcularValidacao desempacota).
      if (fotosIA[a.id]?.file && ['texto', 'sim_nao', 'numero'].includes(a.tipo)) {
        const url = await uploadArquivo(fotosIA[a.id].file, `${execId}/iafoto_${a.id}.jpg`)
        resposta = { valor: resposta ?? null, foto_ia: url ?? null }
      }
      return {
        execucao_id: execId,
        atividade_id: a.id,
        resposta: resposta !== null ? JSON.parse(JSON.stringify(resposta)) : null,
        conforme: calcularValidacao({ ...a, resposta }),
      }
    }))

    if (falhasUpload.length > 0) {
      // Reverte o header para não deixar execução fantasma e devolve ao operador
      if (execAgendadaId) {
        await sb.from('checklist_execucoes').update({
          executado_por: null, status: 'em_andamento', resultado: null,
        }).eq('id', execId)
      } else {
        await sb.from('checklist_execucoes').delete().eq('id', execId)
      }
      if (wfItemId) {
        await sb.from('workflow_item_execucoes').update({
          status: 'liberado', checklist_execucao_id: null, iniciado_em: null,
        }).eq('id', wfItemId)
      }
      setSalvando(false)
      setErroFinalizar(`Falha ao enviar evidência obrigatória (${falhasUpload.join(', ')}). Verifique sua conexão e tente novamente.`)
      return
    }

    const { data: respostasInseridas, error: respErr } = await sb
      .from('checklist_execucao_respostas')
      .insert(linhasRespostas)
      .select('id, atividade_id')

    if (respErr || !respostasInseridas) {
      // Execução já foi criada — marca como incompleta para não perder o registro
      await sb.from('checklist_execucoes').update({ status: 'nao_executado' }).eq('id', execId)
      // Workflow: devolve o item para 'liberado', senão o estágio trava para sempre
      if (wfItemId) {
        await sb.from('workflow_item_execucoes').update({
          status: 'liberado', checklist_execucao_id: null, iniciado_em: null,
        }).eq('id', wfItemId)
      }
      setSalvando(false)
      setErroFinalizar('Erro ao salvar respostas. Tente novamente.')
      return
    }

    // Salva planos de ação — só se o checklist tem subgrupo_id
    const temPlanos = Object.keys(planosCapturados).length > 0
    if (temPlanos && !checklist.subgrupo_id) {
      // Avisa mas não bloqueia — a execução foi salva com sucesso
      console.warn('[CheckFlow] Planos de ação não criados: checklist sem subgrupo_id.')
    }

    if (temPlanos && checklist.subgrupo_id) {
      for (const [atividadeId, plano] of Object.entries(planosCapturados)) {
        const resposta = respostasInseridas.find((r: any) => r.atividade_id === atividadeId)
        if (!resposta) continue

        const atv = visiveis.find(a => a.id === atividadeId)
        const slaHoras = atv?.plano_acao_sla_horas
        const slaPrazo = slaHoras && slaHoras > 0
          ? new Date(agora.getTime() + slaHoras * 3600000).toISOString()
          : null

        const { data: planoInserido, error: planoErr } = await sb.from('planos_acao').insert({
          unidade_id: unidadeAtiva.id,
          subgrupo_id: checklist.subgrupo_id,
          checklist_execucao_id: execId,
          checklist_execucao_resposta_id: resposta.id,
          atividade_id: atividadeId,
          observacao_abertura: plano.observacao,
          sla_prazo: slaPrazo,
          criado_por: user.id,
        }).select('id').single()

        if (planoErr || !planoInserido) {
          console.error('[CheckFlow] Erro ao criar plano de ação:', planoErr?.message)
          continue
        }

        // Upload e registro das evidências
        const evidencias: { plano_acao_id: string; tipo: string; url: string; ordem: number }[] = []

        for (let i = 0; i < plano.fotos.length; i++) {
          const f = plano.fotos[i]
          const ext = f.file.name.split('.').pop() ?? 'jpg'
          const url = await uploadArquivo(f.file, `planos/${planoInserido.id}/foto_${i}.${ext}`)
          if (url) evidencias.push({ plano_acao_id: planoInserido.id, tipo: 'foto', url, ordem: i })
        }

        if (plano.video) {
          const ext = plano.video.file.name.split('.').pop() ?? 'mp4'
          const url = await uploadArquivo(plano.video.file, `planos/${planoInserido.id}/video.${ext}`)
          if (url) evidencias.push({ plano_acao_id: planoInserido.id, tipo: 'video', url, ordem: 0 })
        }

        if (evidencias.length > 0) {
          const { error: evErr } = await sb.from('plano_acao_evidencias').insert(evidencias)
          if (evErr) console.error('[CheckFlow] Erro ao inserir evidências:', evErr.message)
        }

        // Movimentação inicial
        const { error: movErr } = await sb.from('plano_acao_movimentacoes').insert({
          plano_acao_id: planoInserido.id,
          usuario_id: user.id,
          acao: 'aberto',
          observacao: plano.observacao,
        })
        if (movErr) console.error('[CheckFlow] Erro ao inserir movimentação:', movErr.message)

        // Ocorrência de causa raiz (se escolhida por quem resolve)
        if (plano.causaRaizId) {
          const { error: ocErr } = await sb.from('causa_raiz_ocorrencias').insert({
            causa_raiz_id: plano.causaRaizId,
            atividade_id: atividadeId,
            plano_acao_id: planoInserido.id,
            unidade_id: unidadeAtiva.id,
            observacao: plano.causaRaizObs || null,
            criado_por: user.id,
          })
          if (ocErr) console.error('[CheckFlow] Erro ao registrar ocorrência de causa raiz:', ocErr.message)
        }

        // Notifica N1/N2 (fire-and-forget)
        notificarPlanoAberto({
          plano_id: planoInserido.id,
          observacao: plano.observacao,
          ator_nome: atorNome,
        })
      }
    }

    // Workflow: atualiza para 'concluido' → dispara trigger de avanço
    if (wfItemId) {
      await sb.from('checklist_execucoes').update({
        status: 'concluido',
        resultado,
      }).eq('id', execId)
    }

    setSalvando(false)
    setResultadoFinal(resultado)
    setExecConcluidaId(execId)
    setPdfStatus('idle')
    setPdfUrl(null)
    setConcluido(true)
  }

  // Geração do PDF sob demanda (não é mais automática)
  async function gerarPdf() {
    if (!execConcluidaId) return
    setPdfStatus('gerando')
    const sb = createClient()
    const { data: { session } } = await sb.auth.getSession()
    if (!session?.access_token) { setPdfStatus('erro'); return }
    try {
      const res = await fetch(`/api/execucoes/${execConcluidaId}/pdf`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.pdf_url) { setPdfUrl(json.pdf_url); setPdfStatus('pronto') }
      else setPdfStatus('erro')
    } catch { setPdfStatus('erro') }
  }

  // ─── Estados de loading / erro / concluído ─────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (erroCarregar) return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center">
        <AlertCircle size={40} className="text-red-300 mx-auto mb-3" />
        <p className="text-sm text-red-600 font-medium">Erro ao carregar checklist</p>
        <p className="text-xs text-gray-400 mt-1">{erroCarregar}</p>
      </div>
    </div>
  )

  // Execução finalizada SEM conexão: guardada no aparelho, será enviada depois.
  if (enfileiradoOffline) return (
    <div className="flex items-center justify-center min-h-[80vh] px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <WifiOff size={30} className="text-amber-500" />
        </div>
        <p className="text-lg font-semibold text-gray-800">Execução salva no aparelho</p>
        <p className="text-sm text-gray-500 mt-2">
          Você está sem conexão. Esta execução será enviada automaticamente assim que a internet voltar — pode fechar o app com segurança.
        </p>
        <button onClick={() => router.push('/operacao')}
          className="mt-6 w-full px-4 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors">
          Voltar
        </button>
      </div>
    </div>
  )

  if (concluido) {
    const aprovado = resultadoFinal === 'aprovado'
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-6">
        <div className="text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${aprovado ? 'bg-green-100' : 'bg-red-100'}`}>
            {aprovado
              ? <CheckCircle2 size={40} className="text-green-500" />
              : <XCircle size={40} className="text-red-500" />}
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Checklist concluído!</h2>
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full mb-4 ${aprovado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {aprovado ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {aprovado ? 'Aprovado' : 'Reprovado'}
          </span>
          <p className="text-sm text-gray-500 mb-6">Execução registrada com sucesso.</p>

          {/* PDF da execução — gerado sob demanda */}
          <div className="mb-6 flex items-center justify-center">
            {pdfStatus === 'idle' && (
              <button onClick={gerarPdf}
                className="inline-flex items-center gap-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 hover:bg-orange-100 transition-colors">
                <FileText size={13} /> Gerar PDF da execução
              </button>
            )}
            {pdfStatus === 'gerando' && (
              <span className="inline-flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <Loader2 size={13} className="animate-spin" /> Gerando PDF…
              </span>
            )}
            {pdfStatus === 'pronto' && pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 hover:bg-orange-100 transition-colors">
                <FileText size={13} /> Baixar PDF da execução
              </a>
            )}
            {pdfStatus === 'erro' && (
              <button onClick={gerarPdf}
                className="inline-flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-100 transition-colors">
                <FileText size={13} /> Falha ao gerar — tentar novamente
              </button>
            )}
          </div>

          <button onClick={() => router.push('/operacao')}
            className="bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors">
            Voltar aos checklists
          </button>
        </div>
      </div>
    )
  }

  if (!checklist) return null

  const { total, respondidas } = calcularProgresso()
  const progresso = total > 0 ? Math.round((respondidas / total) * 100) : 0

  return (
    <>
    {modalPlanoAtividade && (
      <PlanoAcaoModal
        atividade={modalPlanoAtividade}
        subgrupoId={checklist?.subgrupo_id ?? null}
        checklistId={checklist?.id ?? ''}
        unidadeId={unidadeAtiva?.id ?? ''}
        dadosIniciais={planosCapturados[modalPlanoAtividade.id]}
        onClose={() => setModalPlanoAtividade(null)}
        onConfirmar={dados => {
          setPlanosCapturados(prev => ({ ...prev, [modalPlanoAtividade.id]: dados }))
          setModalPlanoAtividade(null)
        }}
      />
    )}
    {naoExecModal && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Não foi possível executar</h3>
            <button onClick={() => setNaoExecModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
              <X size={16} />
            </button>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Motivo</label>
              <select value={motivoChecklistSel} onChange={e => setMotivoChecklistSel(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200">
                <option value="">Selecione o motivo...</option>
                {motivosChecklist.map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Observação (opcional)</label>
              <textarea value={obsNaoExec} onChange={e => setObsNaoExec(e.target.value)} rows={3}
                placeholder="Detalhe o que ocorreu..."
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
            </div>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={() => setNaoExecModal(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
            <button onClick={naoExecutarChecklist} disabled={!motivoChecklistSel || enviandoNaoExec}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
              {enviandoNaoExec ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Confirmar
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header fixo */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-800 text-sm leading-tight truncate">{checklist.nome}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all duration-300"
                  style={{ width: `${progresso}%` }} />
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{respondidas}/{total}</span>
            </div>
          </div>
        </div>
      </div>

      {!online && (
        <div className="px-4 sm:px-6 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <WifiOff size={13} className="text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700 font-medium">
            Sem conexão — suas respostas estão sendo salvas neste aparelho. Finalize quando a internet voltar.
          </p>
        </div>
      )}
      {wfItemId && (
        <div className="px-4 sm:px-6 py-2.5 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
          <GitBranch size={13} className="text-violet-500 flex-shrink-0" />
          <p className="text-xs text-violet-700 font-medium">Execução vinculada a um workflow</p>
        </div>
      )}
      {/* Não foi possível executar este checklist */}
      {motivosChecklist.length > 0 && (
        <div className="px-4 sm:px-6 pt-3 flex justify-end">
          <button onClick={() => setNaoExecModal(true)}
            className="text-xs text-gray-400 hover:text-orange-500 underline transition-colors">
            Não foi possível executar este checklist
          </button>
        </div>
      )}

      {/* Seções */}
      <div className="px-4 sm:px-6 pt-4 space-y-3">
        {secoes.map((secao, idx) => {
          const aberta = secaoAberta === secao.id
          const atvsComResp = injetarRespostas(secao.atividades)
          const respondHere = secao.atividades.filter(a => {
            const r = respostas[a.id]; return r !== undefined && r !== null && r !== ''
          }).length
          const todaRespondida = respondHere === secao.atividades.length && secao.atividades.length > 0

          // Plano de ação pendente: atividade não conforme, que gera plano e ainda
          // não foi registrado. Percorre dependentes visíveis (respeita gatilhos).
          const temPlanoPendente = (atvs: Atividade[]): boolean => atvs.some(a => {
            const proprio = calcularValidacao(a) === false && a.gera_plano_acao && !planosCapturados[a.id]
            const visiveis = (a.dependentes ?? []).filter(dep => {
              if (!dep.valor_gatilho) return true
              return Array.isArray(a.resposta) ? a.resposta.includes(dep.valor_gatilho) : String(a.resposta ?? '') === dep.valor_gatilho
            })
            return proprio || temPlanoPendente(visiveis)
          })
          const planoPendente = todaRespondida && temPlanoPendente(atvsComResp)

          return (
            <div key={secao.id} id={`secao-${secao.id}`} className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 scroll-mt-4">
              <button onClick={() => setSecaoAberta(aberta ? null : secao.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                    planoPendente ? 'bg-amber-400 text-white'
                      : todaRespondida ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {todaRespondida && !planoPendente ? <CheckCircle2 size={14} /> : idx + 1}
                  </div>
                  <span className="font-semibold text-sm text-gray-800">{secao.nome}</span>
                  <span className="text-xs text-gray-400">({respondHere}/{secao.atividades.length})</span>
                </div>
                {aberta ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </button>

              {aberta && (
                <div className="px-4 pb-4">
                  {atvsComResp.length === 0
                    ? <p className="text-xs text-gray-400 py-2 text-center">Nenhuma atividade nesta seção.</p>
                    : <div className="space-y-0">
                        {atvsComResp.map(atv => (
                          <AtividadeItem key={atv.id} atividade={atv} onResposta={setResposta}
                            onAbrirPlanoAcao={setModalPlanoAtividade} planosCapturados={planosCapturados}
                            motivosAtividade={motivosAtividade} onFotoIA={setFotoIA} fotosIA={fotosIA}
                            permiteOffline={checklist?.permite_offline ?? false} iaDisponivel={iaDisponivel} />
                        ))}
                      </div>
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>


      {/* Botão finalizar fixo */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
        {erroFinalizar && (
          <div className="px-4 pt-3">
            <div className="max-w-2xl mx-auto flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{erroFinalizar}</p>
            </div>
          </div>
        )}
        <div className="max-w-2xl mx-auto p-4 space-y-2">
          <button onClick={finalizar} disabled={salvando}
            className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-60 transition-colors shadow-lg shadow-orange-200 active:scale-[0.99]">
            {salvando
              ? <><Clock size={16} className="animate-pulse" />Salvando...</>
              : <><Send size={16} />Finalizar checklist</>}
          </button>
          {/* Continuar depois — só para checklists pausáveis; exige internet */}
          {checklist.permite_continuar_depois !== false && (
            <>
              <button onClick={continuarDepois} disabled={salvando || !online}
                className="w-full py-2.5 text-gray-500 rounded-xl font-medium text-sm flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-colors">
                <Clock size={15} />Continuar depois
              </button>
              {!online && (
                <p className="text-center text-xs text-gray-400">Indisponível offline — finalize para salvar no aparelho.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>

    </>
  )
}
