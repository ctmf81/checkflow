'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'
import {
  ArrowLeft, ChevronDown, ChevronUp, CheckCircle2, XCircle,
  Type, Hash, ToggleLeft, List, BookOpen, Camera, PenLine,
  CalendarDays, MapPin, AlertCircle, Send, Clock, Locate, Search,
  QrCode, ScanBarcode, X, ImagePlus, Video, AlertTriangle
} from 'lucide-react'

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

interface Checklist {
  id: string
  nome: string
  descricao: string | null
  tempo_guarda_meses: number
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

function calcularValidacao(atividade: Atividade): boolean | null {
  const val = atividade.resposta
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
  if (atividade.tipo === 'multipla_escolha') {
    const opcoes = atividade.opcoesMC ?? []
    if (!opcoes.length) return null
    const selecionados = Array.isArray(val) ? val : [val]
    // Não conforme se alguma selecionada tem e_valido=false
    const temInvalido = selecionados.some(v => {
      const op = opcoes.find(o => o.valor === v || o.label === v)
      return op && !op.e_valido
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

  function aplicarMascara(input: string): string {
    if (!mascara) return input
    let result = ''
    let j = 0
    for (let i = 0; i < mascara.length && j < input.length; i++) {
      if (mascara[i] === '9') {
        if (/\d/.test(input[j])) { result += input[j++] } else { j++; i-- }
      } else if (mascara[i] === 'A') {
        if (/[a-zA-Z]/.test(input[j])) { result += input[j++].toUpperCase() } else { j++; i-- }
      } else if (mascara[i] === '*') {
        result += input[j++]
      } else {
        result += mascara[i]
        if (input[j] === mascara[i]) j++
      }
    }
    return result
  }

  function handleScan(tipo: 'qrcode' | 'barcode') {
    setErroCodigo(null)
    lerCodigoDeCamera(tipo, val => {
      onChange(mascara ? aplicarMascara(val.replace(/\W/g, '')) : val)
    }, setErroCodigo)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={val}
          onChange={e => onChange(mascara ? aplicarMascara(e.target.value.replace(/\W/g, '')) : e.target.value)}
          placeholder={mascara || 'Digite aqui...'}
          className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
        />
        {cfg.qrcode && (
          <button title="Ler QR Code" onClick={() => handleScan('qrcode')}
            className="px-3 py-2.5 bg-gray-800 text-white rounded-xl text-xs flex items-center gap-1 hover:bg-gray-700 active:scale-95 transition-transform">
            <QrCode size={16} />
          </button>
        )}
        {cfg.barcode && (
          <button title="Ler código de barras" onClick={() => handleScan('barcode')}
            className="px-3 py-2.5 bg-gray-700 text-white rounded-xl text-xs flex items-center gap-1 hover:bg-gray-600 active:scale-95 transition-transform">
            <ScanBarcode size={16} />
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
        <input type="number" value={val} onChange={e => onChange(e.target.value)}
          placeholder="Digite o valor"
          className={`flex-1 px-3 py-2.5 text-sm border rounded-xl bg-gray-50 focus:outline-none focus:ring-2 ${
            fora ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-orange-200'
          }`} />
        {cfg.unidade && <span className="text-sm text-gray-500 font-medium whitespace-nowrap">{cfg.unidade}</span>}
      </div>
      {(cfg.min !== null && cfg.min !== undefined) || (cfg.max !== null && cfg.max !== undefined) ? (
        <p className="text-xs text-gray-400">
          Esperado: {cfg.min !== null && cfg.min !== undefined ? `mín ${cfg.min}` : ''}{cfg.min !== null && cfg.max !== null ? ' — ' : ''}{cfg.max !== null && cfg.max !== undefined ? `máx ${cfg.max}` : ''} {cfg.unidade ?? ''}
        </p>
      ) : null}
      {fora && <p className="text-xs text-red-500">Valor fora do intervalo esperado</p>}
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
      {esperado && val && val !== esperado && (
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
    Promise.all([
      sb.from('catalogos').select('id, nome, campo_chave, atributo_1, atributo_2, atributo_3, atributo_4').eq('id', catId).single(),
      sb.from('catalogo_valores').select('id, valor_chave, atributo_1, atributo_2, atributo_3, atributo_4, imagem_url').eq('catalogo_id', catId).order('valor_chave'),
    ]).then(([{ data: cat }, { data: vals }]) => {
      setCatalogo(cat)
      setItens(vals ?? [])
      setCarregando(false)
    })
  }, [atividade.id])

  if (!atividade.config?.catalogo_id) return (
    <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">Catálogo não configurado.</p>
  )
  if (carregando) return <p className="text-xs text-gray-400 py-2">Carregando catálogo...</p>

  const filtrados = itens.filter(i =>
    i.valor_chave?.toLowerCase().includes(busca.toLowerCase()) ||
    i.atributo_1?.toLowerCase().includes(busca.toLowerCase()) ||
    i.atributo_2?.toLowerCase().includes(busca.toLowerCase())
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
      err => { setErroGPS('Não foi possível obter sua localização.'); setBuscando(false) },
      { enableHighAccuracy: true, timeout: 10000 }
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

// Foto
function CampoFoto({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const val = atividade.resposta

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    onChange({ file, url, nome: file.name })
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

// Vídeo (câmera ou galeria, com alerta de data antiga)
function CampoVideo({ atividade, onChange }: { atividade: Atividade; onChange: (v: any) => void }) {
  const inputCameraRef = useRef<HTMLInputElement>(null)
  const inputGaleriaRef = useRef<HTMLInputElement>(null)
  const val = atividade.resposta

  function handleFile(e: React.ChangeEvent<HTMLInputElement>, origem: 'camera' | 'galeria') {
    const file = e.target.files?.[0]
    if (!file) return

    // lastModified é a data de modificação do arquivo (em ms desde epoch)
    const dataArquivo = new Date(file.lastModified)
    const agora = new Date()
    const diffHoras = (agora.getTime() - dataArquivo.getTime()) / (1000 * 60 * 60)
    const antigo = origem === 'galeria' && diffHoras > 1

    const url = URL.createObjectURL(file)
    onChange({
      file,
      url,
      nome: file.name,
      origem,
      dataArquivo: dataArquivo.toISOString(),
      antigo,
    })
    // limpa o input para permitir reselecionar o mesmo arquivo
    e.target.value = ''
  }

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
      <input ref={inputCameraRef} type="file" accept="video/*" capture="environment"
        className="hidden" onChange={e => handleFile(e, 'camera')} />
      <input ref={inputGaleriaRef} type="file" accept="video/*"
        className="hidden" onChange={e => handleFile(e, 'galeria')} />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => inputCameraRef.current?.click()}
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
    case 'data_hora':
      return (
        <input type="datetime-local" value={atividade.resposta ?? ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
      )
    default:
      return (
        <input value={atividade.resposta ?? ''} onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
      )
  }
}

// ─── Item de atividade ────────────────────────────────────────────────────────

function AtividadeItem({ atividade, onResposta, nivel = 0 }: {
  atividade: Atividade; onResposta: (id: string, val: any) => void; nivel?: number
}) {
  const respondida = atividade.resposta !== undefined && atividade.resposta !== null && atividade.resposta !== ''
  const validacao = calcularValidacao(atividade)

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
            <p className="text-sm font-semibold text-gray-800 leading-snug">
              {atividade.nome}
              {atividade.obrigatoria && <span className="text-red-400 ml-1">*</span>}
            </p>
            {respondida && <ValidacaoTag valido={validacao} />}
          </div>
          {respondida && validacao === null && (
            <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
          )}
        </div>
        <CampoResposta atividade={atividade} onChange={val => onResposta(atividade.id, val)} />
      </div>
      {dependentesVisiveis.map(dep => (
        <AtividadeItem key={dep.id} atividade={dep} onResposta={onResposta} nivel={nivel + 1} />
      ))}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function ExecucaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { unidadeAtiva, user } = useSession() as any
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [respostas, setRespostas] = useState<Record<string, any>>({})
  const [secaoAberta, setSecaoAberta] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => { carregar() }, [id])

  async function carregar() {
    setLoading(true); setErroCarregar(null)
    const sb = createClient()

    const { data: cl, error: clErr } = await sb.from('checklists')
      .select('id, nome, descricao, tempo_guarda_meses').eq('id', id).single()
    if (clErr || !cl) { setErroCarregar(`Checklist não encontrado`); setLoading(false); return }
    setChecklist(cl)

    const { data: secoesData } = await sb.from('checklist_secoes')
      .select('id, nome, ordem').eq('checklist_id', id).order('ordem')

    const { data: atvsData, error: atvErr } = await sb.from('checklist_atividades')
      .select('id, nome, tipo, obrigatoria, config, ordem, atividade_pai_id, valor_gatilho, secao_id')
      .eq('checklist_id', id).order('ordem')

    if (atvErr) { setErroCarregar(`Erro: ${atvErr.message}`); setLoading(false); return }
    if (!atvsData || atvsData.length === 0) { setErroCarregar(`Checklist sem atividades`); setLoading(false); return }

    // Busca opções de múltipla escolha de todas as atividades de uma vez
    const idsMC = atvsData.filter((a: any) => a.tipo === 'multipla_escolha').map((a: any) => a.id)
    let opcoesMap: Record<string, OpcaoMC[]> = {}
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

    // Monta árvore
    const atvMap = new Map<string, Atividade>()
    atvsData.forEach((a: any) => atvMap.set(a.id, {
      ...a, dependentes: [], opcoesMC: opcoesMap[a.id] ?? []
    }))
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
    setLoading(false)
  }

  function setResposta(atividadeId: string, valor: any) {
    setRespostas(prev => ({ ...prev, [atividadeId]: valor }))
  }

  function injetarRespostas(atividades: Atividade[]): Atividade[] {
    return atividades.map(a => ({
      ...a, resposta: respostas[a.id],
      dependentes: injetarRespostas(a.dependentes ?? []),
    }))
  }

  function calcularProgresso() {
    let total = 0, respondidas = 0
    function contar(atividades: Atividade[]) {
      atividades.forEach(a => {
        total++
        const r = respostas[a.id]
        if (r !== undefined && r !== null && r !== '' && !(Array.isArray(r) && r.length === 0)) respondidas++
        if (a.dependentes?.length) {
          const gatilhoAtivo = a.dependentes.some(d => {
            const resp = respostas[a.id]
            return !d.valor_gatilho || (Array.isArray(resp) ? resp.includes(d.valor_gatilho) : String(resp ?? '') === d.valor_gatilho)
          })
          if (gatilhoAtivo) contar(a.dependentes)
        }
      })
    }
    secoes.forEach(s => contar(s.atividades))
    return { total, respondidas }
  }

  async function finalizar() {
    if (!unidadeAtiva || !checklist) return
    setSalvando(true)
    const sb = createClient()
    const agora = new Date()
    const expiracao = new Date(agora)
    expiracao.setMonth(expiracao.getMonth() + (checklist.tempo_guarda_meses ?? 12))

    await sb.from('checklist_execucoes').insert({
      checklist_id: checklist.id,
      unidade_id: unidadeAtiva.id,
      executado_por: user?.id,
      data_execucao: agora.toISOString(),
      data_expiracao: expiracao.toISOString().split('T')[0],
      status: 'concluido',
    })

    setSalvando(false)
    setConcluido(true)
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

  if (concluido) return (
    <div className="flex items-center justify-center min-h-[80vh] px-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={40} className="text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Checklist concluído!</h2>
        <p className="text-sm text-gray-500 mb-6">Execução registrada com sucesso.</p>
        <button onClick={() => router.push('/operacao')}
          className="bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors">
          Voltar aos checklists
        </button>
      </div>
    </div>
  )

  if (!checklist) return null

  const { total, respondidas } = calcularProgresso()
  const progresso = total > 0 ? Math.round((respondidas / total) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto pb-32">
      {/* Header fixo */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/operacao')}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} />
          </button>
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

      {checklist.descricao && (
        <div className="px-4 sm:px-6 py-3 bg-blue-50 border-b border-blue-100">
          <p className="text-xs text-blue-700">{checklist.descricao}</p>
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

          return (
            <div key={secao.id} className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
              <button onClick={() => setSecaoAberta(aberta ? null : secao.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                    respondHere === secao.atividades.length && secao.atividades.length > 0
                      ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {respondHere === secao.atividades.length && secao.atividades.length > 0
                      ? <CheckCircle2 size={14} /> : idx + 1}
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
                          <AtividadeItem key={atv.id} atividade={atv} onResposta={setResposta} />
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
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-30">
        <div className="max-w-2xl mx-auto">
          <button onClick={finalizar} disabled={salvando}
            className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-60 transition-colors shadow-lg shadow-orange-200 active:scale-[0.99]">
            {salvando
              ? <><Clock size={16} className="animate-pulse" />Salvando...</>
              : <><Send size={16} />Finalizar checklist</>}
          </button>
        </div>
      </div>
    </div>
  )
}
