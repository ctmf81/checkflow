'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase'

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

const TIPOS = [
  { value: 'sim_nao',         label: '✅ Sim/Não',          validacao: true },
  { value: 'numero',          label: '🔢 Número',            validacao: true },
  { value: 'texto',           label: '📝 Texto',             validacao: false },
  { value: 'multipla_escolha',label: '☑️ Múltipla escolha',  validacao: true },
  { value: 'catalogo',        label: '📋 Catálogo',          validacao: false },
  { value: 'foto',            label: '📷 Foto',              validacao: false },
  { value: 'assinatura',      label: '✍️ Assinatura',        validacao: false },
  { value: 'data_hora',       label: '🗓️ Data/Hora',         validacao: false },
  { value: 'localizacao',     label: '📍 Localização',       validacao: true },
]

export default function AtividadeModal({ checklistId, secaoId, atividade, paiId, valorGatilho, ordemAtual, onClose, onSalva }: Props) {
  const isEdicao = !!atividade
  const isDependente = !!paiId

  const [nome, setNome] = useState(atividade?.nome ?? '')
  const [descricao, setDescricao] = useState(atividade?.descricao ?? '')
  const [tipo, setTipo] = useState(atividade?.tipo ?? 'sim_nao')
  const [obrigatoria, setObrigatoria] = useState(atividade?.obrigatoria ?? true)
  const [critica, setCritica] = useState(atividade?.critica ?? false)
  const [geraPlanoAcao, setGeraPlanoAcao] = useState(atividade?.gera_plano_acao ?? false)
  const [config, setConfig] = useState<Record<string, any>>(atividade?.config ?? {})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Config por tipo
  const [simNaoEsperado, setSimNaoEsperado] = useState(config.esperado ?? 'sim')
  const [numMin, setNumMin] = useState(config.min ?? '')
  const [numMax, setNumMax] = useState(config.max ?? '')
  const [numUnidade, setNumUnidade] = useState(config.unidade ?? '')
  const [textoMascara, setTextoMascara] = useState(config.mascara ?? '')
  const [textoQrcode, setTextoQrcode] = useState(config.qrcode ?? false)
  const [textoBarcode, setTextoBarcode] = useState(config.barcode ?? false)
  const [locLat, setLocLat] = useState(config.lat ?? '')
  const [locLng, setLocLng] = useState(config.lng ?? '')
  const [locRaio, setLocRaio] = useState(config.raio_metros ?? 100)
  const [dataAuto, setDataAuto] = useState(config.automatico ?? true)

  function buildConfig() {
    switch (tipo) {
      case 'sim_nao': return { esperado: simNaoEsperado }
      case 'numero': return { min: numMin !== '' ? Number(numMin) : null, max: numMax !== '' ? Number(numMax) : null, unidade: numUnidade || null }
      case 'texto': return { mascara: textoMascara || null, qrcode: textoQrcode, barcode: textoBarcode }
      case 'localizacao': return { lat: locLat ? Number(locLat) : null, lng: locLng ? Number(locLng) : null, raio_metros: Number(locRaio) }
      case 'data_hora': return { automatico: dataAuto }
      default: return {}
    }
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome da atividade.'); return }
    setErro('')
    setSalvando(true)
    const supabase = createClient()
    const configFinal = buildConfig()

    const payload = {
      checklist_id: checklistId,
      secao_id: secaoId,
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      tipo,
      obrigatoria,
      critica,
      gera_plano_acao: geraPlanoAcao,
      config: configFinal,
      atividade_pai_id: paiId ?? null,
      valor_gatilho: valorGatilho ?? null,
      ordem: atividade?.ordem ?? ordemAtual,
    }

    if (isEdicao) {
      const { error } = await supabase.from('checklist_atividades')
        .update({ ...payload, atualizado_em: new Date().toISOString() }).eq('id', atividade.id)
      if (error) { setErro('Erro ao salvar.'); setSalvando(false); return }
      onSalva({ id: atividade.id, ...payload } as Atividade)
    } else {
      const { data, error } = await supabase.from('checklist_atividades')
        .insert(payload).select('id').single()
      if (error || !data) { setErro('Erro ao criar.'); setSalvando(false); return }
      onSalva({ id: data.id, ...payload } as Atividade)
    }
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
              {TIPOS.map(t => (
                <button key={t.value} type="button" onClick={() => setTipo(t.value)}
                  className={`px-2 py-2 text-xs rounded-lg border transition-colors text-left ${
                    tipo === t.value ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Configurações específicas por tipo */}
          {tipo === 'sim_nao' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resposta esperada (aprovação)</label>
              <div className="flex gap-2">
                {['sim', 'nao'].map(v => (
                  <button key={v} type="button" onClick={() => setSimNaoEsperado(v)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                      simNaoEsperado === v ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {v === 'sim' ? 'Sim ✅' : 'Não ❌'}
                  </button>
                ))}
              </div>
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

          {tipo === 'localizacao' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
                  <input type="number" step="any" value={locLat} onChange={e => setLocLat(e.target.value)} placeholder="Ex: -23.5505"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
                  <input type="number" step="any" value={locLng} onChange={e => setLocLng(e.target.value)} placeholder="Ex: -46.6333"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Raio permitido (metros)</label>
                <input type="number" value={locRaio} onChange={e => setLocRaio(Number(e.target.value))} min={10}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-200" />
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
