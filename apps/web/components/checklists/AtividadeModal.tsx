'use client'

import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Type, Hash, ToggleLeft, List, BookOpen, Camera, PenLine, CalendarDays, MapPin, Upload, LocateFixed, Search, Loader2, Video } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'
import { useSession } from '@/contexts/SessionContext'

interface Atividade {
  id: string
  secao_id: string | null
  nome: string
  descricao: string | null
  tipo: string
  ordem: number
  obrigatoria: boolean
  critica: boolean
  gera_plano_acao: boolean
  plano_acao_sla_horas: number | null
  config: Record<string, any>
  atividade_pai_id: string | null
  valor_gatilho: string | null
}

interface Props {
  checklistId: string
  secaoId: string
  atividade?: Atividade
  paiId?: string
  valorGatilho?: string
  ordemAtual: number
  onClose: () => void
  onSalva: (atividade: Atividade) => void
}

import React from 'react'

const TIPO_CONFIG_MODAL: Record<string, { bg: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  texto:           { bg: 'bg-orange-400',  Icon: Type },
  numero:          { bg: 'bg-green-500',   Icon: Hash },
  sim_nao:         { bg: 'bg-emerald-500', Icon: ToggleLeft },
  multipla_escolha:{ bg: 'bg-blue-500',    Icon: List },
  catalogo:        { bg: 'bg-slate-500',   Icon: BookOpen },
  foto:            { bg: 'bg-rose-400',    Icon: Camera },
  video:           { bg: 'bg-pink-600',    Icon: Video },
  assinatura:      { bg: 'bg-purple-500',  Icon: PenLine },
  data_hora:       { bg: 'bg-sky-400',     Icon: CalendarDays },
  localizacao:     { bg: 'bg-amber-600',   Icon: MapPin },
}

const TIPOS: { value: string; label: string; validacao: boolean }[] = [
  { value: 'sim_nao',         label: 'Sim/Não',          validacao: true  },
  { value: 'numero',          label: 'Número',            validacao: true  },
  { value: 'texto',           label: 'Texto',             validacao: false },
  { value: 'multipla_escolha',label: 'Múltipla escolha',  validacao: true  },
  { value: 'catalogo',        label: 'Catálogo',          validacao: false },
  { value: 'foto',            label: 'Foto',              validacao: false },
  { value: 'video',           label: 'Vídeo',             validacao: false },
  { value: 'assinatura',      label: 'Assinatura',        validacao: false },
  { value: 'data_hora',       label: 'Data/Hora',         validacao: false },
  { value: 'localizacao',     label: 'Localização',       validacao: true  },
]

interface Opcao {
  id?: string
  label: string
  valor: string
  ordem: number
  e_valido: boolean
}

interface Catalogo {
  id: string
  nome: string
}

export default function AtividadeModal({ checklistId, secaoId, atividade, paiId, valorGatilho, ordemAtual, onClose, onSalva }: Props) {
  const isEdicao = !!atividade
  const isDependente = !!paiId
  const { unidadeAtiva } = useSession()

  const [nome, setNome] = useState(atividade?.nome ?? '')
  const [descricao, setDescricao] = useState(atividade?.descricao ?? '')
  const [tipo, setTipo] = useState(atividade?.tipo ?? 'sim_nao')
  const [obrigatoria, setObrigatoria] = useState(atividade?.obrigatoria ?? true)
  const [critica, setCritica] = useState(atividade?.critica ?? false)
  const [geraPlanoAcao, setGeraPlanoAcao] = useState(atividade?.gera_plano_acao ?? false)
  const [planoAcaoSlaHoras, setPlanoAcaoSlaHoras] = useState<string>(
    atividade?.plano_acao_sla_horas != null ? String(atividade.plano_acao_sla_horas) : ''
  )
  const [config, setConfig] = useState<Record<string, any>>(atividade?.config ?? {})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Config por tipo
  const [simNaoEsperado, setSimNaoEsperado] = useState(config.esperado ?? 'sim')
  const [simNaoExibirRef, setSimNaoExibirRef] = useState(config.exibir_referencia ?? true)
  const [numMin, setNumMin] = useState(config.min ?? '')
  const [numMax, setNumMax] = useState(config.max ?? '')
  const [numUnidade, setNumUnidade] = useState(config.unidade ?? '')
  const [numExibirRef, setNumExibirRef] = useState(config.exibir_referencia ?? true)
  const [textoMascara, setTextoMascara] = useState(config.mascara ?? '')
  const [textoQrcode, setTextoQrcode] = useState(config.qrcode ?? false)
  const [textoBarcode, setTextoBarcode] = useState(config.barcode ?? false)
  // Preenchimento por foto (IA) — texto/sim_nao/numero
  const [iaFoto, setIaFoto] = useState(config.ia_foto ?? false)
  const [iaPrompt, setIaPrompt] = useState(config.ia_prompt ?? '')
  const [iaEditavel, setIaEditavel] = useState(config.ia_editavel ?? true)
  const [locLat, setLocLat] = useState(config.lat ?? '')
  const [locLng, setLocLng] = useState(config.lng ?? '')
  const [locRaio, setLocRaio] = useState(config.raio_metros ?? 100)
  const [locEnderecoDisplay, setLocEnderecoDisplay] = useState(config.endereco ?? '')
  const [locNominatimConfirm, setLocNominatimConfirm] = useState('')
  const [locBusca, setLocBusca] = useState(config.endereco ?? '')
  const [locSugestoes, setLocSugestoes] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [locBuscando, setLocBuscando] = useState(false)
  const [locGPS, setLocGPS] = useState(false)
  const [dataAuto, setDataAuto] = useState(config.automatico ?? true)

  // Múltipla escolha
  const [opcoes, setOpcoes] = useState<Opcao[]>([])
  const [novaOpcaoLabel, setNovaOpcaoLabel] = useState('')

  // Catálogo
  const [catalogos, setCatalogos] = useState<Catalogo[]>([])
  const [catalogoId, setCatalogoId] = useState<string>(config.catalogo_id ?? '')

  // Carrega opções existentes (edição)
  useEffect(() => {
    if (!isEdicao || !atividade?.id) return
    if (atividade.tipo !== 'multipla_escolha') return
    const supabase = createClient()
    supabase
      .from('checklist_atividade_opcoes')
      .select('id, label, valor, ordem, e_valido')
      .eq('atividade_id', atividade.id)
      .order('ordem')
      .then(({ data }) => { if (data) setOpcoes(data) })
  }, [isEdicao, atividade?.id, atividade?.tipo])

  // Carrega catálogos da unidade
  useEffect(() => {
    if (tipo !== 'catalogo') return
    const supabase = createClient()
    supabase
      .from('catalogos')
      .select('id, nome')
      .eq('unidade_id', unidadeAtiva?.id)
      .eq('status', 'ativo')
      .order('nome')
      .then(({ data }) => { if (data) setCatalogos(data) })
  }, [tipo, unidadeAtiva?.id])

  function adicionarOpcao() {
    const label = novaOpcaoLabel.trim()
    if (!label) return
    const valor = label.toLowerCase().replace(/\s+/g, '_')
    setOpcoes(prev => [...prev, { label, valor, ordem: prev.length, e_valido: true }])
    setNovaOpcaoLabel('')
  }

  function removerOpcao(index: number) {
    setOpcoes(prev => prev.filter((_, i) => i !== index).map((o, i) => ({ ...o, ordem: i })))
  }

  function toggleValido(index: number) {
    setOpcoes(prev => prev.map((o, i) => i === index ? { ...o, e_valido: !o.e_valido } : o))
  }

  function importarCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const linhas = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      const novas: Opcao[] = []
      for (const linha of linhas) {
        // suporta: "label" ou "label,valido" ou "label;valido"
        const partes = linha.split(/[,;]/).map(p => p.trim().replace(/^"|"$/g, ''))
        const label = partes[0]
        if (!label) continue
        const eValido = partes[1] ? !['false', '0', 'nao', 'não', 'inválido', 'invalido'].includes(partes[1].toLowerCase()) : true
        const valor = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
        novas.push({ label, valor, ordem: opcoes.length + novas.length, e_valido: eValido })
      }
      setOpcoes(prev => [...prev, ...novas])
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function buscarEndereco() {
    if (!locBusca.trim()) return
    setLocBuscando(true)
    setLocSugestoes([])
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locBusca)}&format=json&limit=5&addressdetails=0`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      const data = await res.json()
      setLocSugestoes(data)
    } catch { /* silencia erro de rede */ }
    setLocBuscando(false)
  }

  function selecionarSugestao(s: { display_name: string; lat: string; lon: string }) {
    setLocLat(s.lat)
    setLocLng(s.lon)
    setLocEnderecoDisplay(locBusca.trim() || s.display_name)
    setLocNominatimConfirm(s.display_name)
    setLocSugestoes([])
    // mantém locBusca para o usuário poder editar o endereço salvo
  }

  function usarGPS() {
    if (!navigator.geolocation) return
    setLocGPS(true)
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords
      setLocLat(String(latitude))
      setLocLng(String(longitude))
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          { headers: { 'Accept-Language': 'pt-BR' } }
        )
        const data = await res.json()
        setLocEnderecoDisplay(data.display_name ?? `${latitude}, ${longitude}`)
      } catch {
        setLocEnderecoDisplay(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
      }
      setLocGPS(false)
    }, () => setLocGPS(false))
  }

  function buildConfig() {
    // Preenchimento por foto (IA) — comum a texto/sim_nao/numero
    const ia = iaFoto
      ? { ia_foto: true, ia_prompt: iaPrompt.trim() || null, ia_editavel: iaEditavel }
      : { ia_foto: false }
    switch (tipo) {
      case 'sim_nao': return { esperado: simNaoEsperado, exibir_referencia: simNaoExibirRef, ...ia }
      case 'numero': return { min: numMin !== '' ? Number(numMin) : null, max: numMax !== '' ? Number(numMax) : null, unidade: numUnidade || null, exibir_referencia: numExibirRef, ...ia }
      case 'texto': return { mascara: textoMascara || null, qrcode: textoQrcode, barcode: textoBarcode, ...ia }
      case 'localizacao': return { lat: locLat ? Number(locLat) : null, lng: locLng ? Number(locLng) : null, raio_metros: Number(locRaio), endereco: locEnderecoDisplay || null }
      case 'data_hora': return { automatico: dataAuto }
      case 'catalogo': return { catalogo_id: catalogoId || null }
      default: return {}
    }
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome da atividade.'); return }

    // Valida catálogo obrigatório
    if (tipo === 'catalogo' && !catalogoId) {
      setErro('Selecione um catálogo para esta atividade.'); return
    }

    // Preenchimento por foto (IA): exige o prompt de análise
    if (['texto', 'sim_nao', 'numero'].includes(tipo) && iaFoto && !iaPrompt.trim()) {
      setErro('Informe o prompt de análise da imagem para o preenchimento por foto (IA).'); return
    }

    // Valida SLA: se preenchido, deve ser número inteiro positivo
    if (geraPlanoAcao && planoAcaoSlaHoras !== '') {
      const sla = Number(planoAcaoSlaHoras)
      if (!Number.isInteger(sla) || sla <= 0) {
        setErro('O SLA deve ser um número inteiro de horas maior que zero.'); return
      }
    }

    setErro('')
    setSalvando(true)
    const supabase = createClient()
    const configFinal = buildConfig()

    const slaFinal = (() => {
      if (!geraPlanoAcao || planoAcaoSlaHoras === '') return null
      const v = Number(planoAcaoSlaHoras)
      return Number.isInteger(v) && v > 0 ? v : null
    })()

    const payload = {
      checklist_id: checklistId,
      secao_id: secaoId,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      tipo,
      obrigatoria,
      critica,
      gera_plano_acao: geraPlanoAcao,
      plano_acao_sla_horas: slaFinal,
      config: configFinal,
      atividade_pai_id: paiId ?? null,
      valor_gatilho: valorGatilho ?? null,
      ordem: atividade?.ordem ?? ordemAtual,
    }

    if (tipo === 'multipla_escolha' && opcoes.length === 0) {
      setErro('Adicione ao menos uma opção.'); setSalvando(false); return
    }

    let atividadeId: string
    if (isEdicao) {
      const { error } = await supabase.from('checklist_atividades')
        .update({ ...payload, atualizado_em: new Date().toISOString() }).eq('id', atividade.id)
      if (error) { setErro('Erro ao salvar.'); setSalvando(false); return }
      atividadeId = atividade.id
    } else {
      const { data, error } = await supabase.from('checklist_atividades')
        .insert(payload).select('id').single()
      if (error || !data) { setErro('Erro ao criar.'); setSalvando(false); return }
      atividadeId = data.id
    }

    if (tipo === 'multipla_escolha') {
      await supabase.from('checklist_atividade_opcoes').delete().eq('atividade_id', atividadeId)
      if (opcoes.length > 0) {
        await supabase.from('checklist_atividade_opcoes').insert(
          opcoes.map(o => ({ atividade_id: atividadeId, label: o.label, valor: o.valor, ordem: o.ordem, e_valido: o.e_valido }))
        )
      }
    }

    onSalva({ id: atividadeId, ...payload } as Atividade)
    setSalvando(false)
  }

  const tipoInfo = TIPOS.find(t => t.value === tipo)
  const temValidacao = tipoInfo?.validacao

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-800">
              {isEdicao ? 'Editar atividade' : isDependente ? `Atividade dependente (se "${valorGatilho?.toUpperCase()}")` : 'Nova atividade'}
            </h2>
            {isDependente && <p className="text-xs text-blue-500 mt-0.5">Aparece quando resposta = {valorGatilho?.toUpperCase()}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da atividade</label>
            <input value={nome} onChange={e => setNome(e.target.value)} autoFocus
              placeholder="Ex: EPI correto?"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS.map(t => {
                const cfg = TIPO_CONFIG_MODAL[t.value]
                const isSelected = tipo === t.value
                return (
                  <button key={t.value} type="button" onClick={() => setTipo(t.value)}
                    className={`flex items-center gap-2 px-2 py-2 rounded-xl border transition-all ${
                      isSelected ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                    {cfg && (
                      <div className={`w-7 h-7 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <cfg.Icon size={14} className="text-white" />
                      </div>
                    )}
                    <span className={`text-xs font-medium leading-tight text-left ${isSelected ? 'text-orange-700' : 'text-gray-600'}`}>
                      {t.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Configurações específicas por tipo */}
          {tipo === 'sim_nao' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resposta esperada (aprovação)</label>
                <div className="flex gap-2">
                  {['sim', 'nao'].map(v => (
                    <button key={v} type="button" onClick={() => setSimNaoEsperado(v)}
                      className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                        simNaoEsperado === v ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}>
                      {v === 'sim' ? 'Sim' : 'Não'}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setSimNaoExibirRef((v: boolean) => !v)}
                className="flex items-center gap-2 w-full text-left">
                <div className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${simNaoExibirRef ? 'bg-orange-500' : 'bg-gray-300'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${simNaoExibirRef ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-gray-600">Mostrar referência ao operador quando a resposta estiver fora do esperado</span>
              </button>
            </div>
          )}

          {tipo === 'numero' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mínimo</label>
                  <input type="number" value={numMin} onChange={e => setNumMin(e.target.value)} placeholder="—"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Máximo</label>
                  <input type="number" value={numMax} onChange={e => setNumMax(e.target.value)} placeholder="—"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unidade</label>
                  <input value={numUnidade} onChange={e => setNumUnidade(e.target.value)} placeholder="°C, kg..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              </div>
              <button type="button" onClick={() => setNumExibirRef((v: boolean) => !v)}
                className="flex items-center gap-2 w-full text-left">
                <div className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${numExibirRef ? 'bg-orange-500' : 'bg-gray-300'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${numExibirRef ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-gray-600">Mostrar referência ao operador quando o valor estiver fora do intervalo</span>
              </button>
            </div>
          )}

          {tipo === 'texto' && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Máscara <span className="font-normal text-gray-400">(opcional, ex: 999.999.999-99)</span></label>
                <input value={textoMascara} onChange={e => setTextoMascara(e.target.value)} placeholder="—"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 font-mono" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={textoQrcode} onChange={e => setTextoQrcode(e.target.checked)} className="accent-orange-500" />
                  Leitura por QR Code
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={textoBarcode} onChange={e => setTextoBarcode(e.target.checked)} className="accent-orange-500" />
                  Leitura por Barcode
                </label>
              </div>
              {(textoQrcode || textoBarcode) && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  ⚠️ A leitura por QR Code / Barcode usa a câmera e só está disponível no <strong>app mobile</strong>. No desktop, o operador digita o valor manualmente.
                </p>
              )}
            </div>
          )}

          {/* Preenchimento por foto (IA) — texto / sim_não / número */}
          {['texto', 'sim_nao', 'numero'].includes(tipo) && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input type="checkbox" checked={iaFoto} onChange={e => setIaFoto(e.target.checked)} className="accent-orange-500" />
                Preencher por foto (IA)
                <span className="text-xs font-normal text-gray-400">— o operador tira uma foto e a IA gera a resposta</span>
              </label>
              {iaFoto && (
                <div className="space-y-2 pl-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Prompt de análise da imagem</label>
                    <textarea value={iaPrompt} onChange={e => setIaPrompt(e.target.value)} rows={3}
                      placeholder="Ex: Analise o mostrador do manômetro e informe a pressão em bar."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                    <p className="text-[11px] text-gray-400 mt-1">
                      A IA recebe a foto + este prompt e retorna {tipo === 'texto' ? 'um texto resumido (até 4 linhas)' : tipo === 'sim_nao' ? 'a resposta sim ou não' : 'somente um número'}. Consome os tokens de IA do plano.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={iaEditavel} onChange={e => setIaEditavel(e.target.checked)} className="accent-orange-500" />
                    Operador pode editar o resultado da IA
                  </label>
                </div>
              )}
            </div>
          )}

          {tipo === 'data_hora' && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={dataAuto} onChange={e => setDataAuto(e.target.checked)} className="accent-orange-500" />
                Captura automática do timestamp do sistema
              </label>
            </div>
          )}

          {tipo === 'multipla_escolha' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Opções de resposta</label>
              {opcoes.length > 0 && (
                <ul className="space-y-1">
                  {opcoes.map((o, i) => (
                    <li key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <button type="button" onClick={() => toggleValido(i)}
                        title={o.e_valido ? 'Clique para marcar como inválido' : 'Clique para marcar como válido'}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 transition-colors ${
                          o.e_valido
                            ? 'border-green-300 bg-green-50 text-green-700'
                            : 'border-red-200 bg-red-50 text-red-600'
                        }`}>
                        {o.e_valido ? '✓ válido' : '✗ inválido'}
                      </button>
                      <span className="flex-1 text-sm text-gray-700">{o.label}</span>
                      <button type="button" onClick={() => removerOpcao(i)} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  value={novaOpcaoLabel}
                  onChange={e => setNovaOpcaoLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarOpcao() } }}
                  placeholder="Nova opção..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                <button type="button" onClick={adicionarOpcao}
                  className="flex items-center gap-1 px-3 py-2 text-sm bg-orange-50 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-100">
                  <Plus size={14} /> Adicionar
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-orange-300 hover:text-orange-500 cursor-pointer transition-colors">
                  <Upload size={12} /> Importar CSV
                  <input type="file" accept=".csv,.txt" className="hidden" onChange={importarCSV} />
                </label>
                <span className="text-xs text-gray-400">Uma opção por linha. Ex: <code className="bg-gray-100 px-1 rounded">Bom,true</code></span>
              </div>
              <p className="text-xs text-gray-400">Clique no badge verde/vermelho para alternar se a opção é válida (aprovação).</p>
            </div>
          )}

          {tipo === 'catalogo' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catálogo</label>
              {catalogos.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  Nenhum catálogo ativo encontrado para esta unidade.
                </p>
              ) : (
                <>
                  <select value={catalogoId} onChange={e => setCatalogoId(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 ${!catalogoId ? 'border-amber-300' : 'border-gray-200'}`}>
                    <option value="">— Selecione um catálogo —</option>
                    {catalogos.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  {!catalogoId && (
                    <p className="text-xs text-amber-600 mt-1">⚠ Selecione um catálogo — sem ele o checklist não poderá ser executado.</p>
                  )}
                </>
              )}
            </div>
          )}

          {tipo === 'localizacao' && (
            <div className="space-y-3">
              {/* Busca de endereço */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Endereço de referência
                  <span className="text-gray-400 font-normal ml-1">— inclua número e cidade</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={locBusca}
                    onChange={e => { setLocBusca(e.target.value); setLocEnderecoDisplay(e.target.value); setLocNominatimConfirm('') }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarEndereco() } }}
                    placeholder="Ex: Rua Lourenço de Souza Alencar, 89, Maceió"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                  <button type="button" onClick={buscarEndereco} disabled={locBuscando}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 hover:text-orange-500 hover:border-orange-300 disabled:opacity-50">
                    {locBuscando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  </button>
                  <button type="button" onClick={usarGPS} disabled={locGPS}
                    title="Usar minha localização atual"
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 hover:text-orange-500 hover:border-orange-300 disabled:opacity-50">
                    {locGPS ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}
                  </button>
                </div>

                {/* Sugestões */}
                {locSugestoes.length > 0 && (
                  <ul className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    {locSugestoes.map((s, i) => (
                      <li key={i}>
                        <button type="button" onClick={() => selecionarSugestao(s)}
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-orange-50 hover:text-orange-700 border-b border-gray-100 last:border-0">
                          {s.display_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Confirmação do Nominatim — coordenadas obtidas */}
                {locLat && locNominatimConfirm && (
                  <div className="mt-1 flex items-start gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <MapPin size={12} className="text-green-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-green-700 font-medium">Coordenadas obtidas</p>
                      <p className="text-xs text-green-600 truncate">{locNominatimConfirm}</p>
                      <p className="text-xs text-green-500">{Number(locLat).toFixed(6)}, {Number(locLng).toFixed(6)}</p>
                    </div>
                  </div>
                )}
                {locLat && !locNominatimConfirm && (
                  <p className="text-xs text-gray-400 mt-1">
                    Coordenadas: {Number(locLat).toFixed(6)}, {Number(locLng).toFixed(6)}
                  </p>
                )}
              </div>

              {/* Raio */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Raio de tolerância: <span className="text-orange-500 font-semibold">{locRaio}m</span>
                </label>
                <input type="range" min={10} max={2000} step={10} value={locRaio}
                  onChange={e => setLocRaio(Number(e.target.value))}
                  className="w-full accent-orange-500" />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>10m</span><span>500m</span><span>2km</span>
                </div>
              </div>
            </div>
          )}

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descrição <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
              placeholder="Orientações para o executor..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none" />
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={obrigatoria} onChange={e => setObrigatoria(e.target.checked)} className="accent-orange-500" />
              Obrigatória
            </label>
            {temValidacao && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={critica} onChange={e => setCritica(e.target.checked)} className="accent-red-500" />
                <span>Crítica <span className="text-xs text-gray-400">(reprova o checklist)</span></span>
              </label>
            )}
            {temValidacao && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={geraPlanoAcao} onChange={e => setGeraPlanoAcao(e.target.checked)} className="accent-orange-500" />
                <span>Gera plano de ação <span className="text-xs text-gray-400">(se reprovado)</span></span>
              </label>
            )}
          </div>

          {temValidacao && geraPlanoAcao && (
            <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SLA do plano de ação
                <span className="text-gray-400 font-normal ml-1">(horas para resolução)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={planoAcaoSlaHoras}
                  onChange={e => setPlanoAcaoSlaHoras(e.target.value)}
                  placeholder="Ex: 24"
                  className="w-28 px-3 py-2 text-sm border border-orange-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                <span className="text-sm text-gray-500">horas</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Deixe em branco se não houver prazo. Informe apenas números inteiros (ex: 24 = 1 dia).
              </p>
              {planoAcaoSlaHoras !== '' && (isNaN(Number(planoAcaoSlaHoras)) || Number(planoAcaoSlaHoras) <= 0 || !Number.isInteger(Number(planoAcaoSlaHoras))) && (
                <p className="text-xs text-red-500 mt-1">⚠ Valor inválido — use um número inteiro positivo.</p>
              )}
            </div>
          )}

          {erro && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : isEdicao ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
