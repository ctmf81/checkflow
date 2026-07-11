'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'

// Página PÚBLICA de dashboard (TV) — sem login. Lê /api/painel/[token] em
// polling e roda os painéis num carrossel. Escopada pelo token.

interface DiaPct { dia: string; total: number; conformes?: number; pct?: number | null }
interface DiaSeg { dia: string; total: number; seg: { valor: string; label: string; conforme: boolean; count: number }[] }
interface Placar { executados: number; aprovados: number; reprovados: number; naoExecutados: number; pctAprovacao: number | null }
interface DiaConf { dia: string; aprovados: number; reprovados: number; total: number }
interface TopNC { atividade: string; naoConformes: number; total: number; taxa: number }
interface PainelData {
  id: string; titulo: string; tipo: string; janela_horas: number
  grafico?: 'linha' | 'padrao' | 'conformidade' | 'composicao' | 'checklist'
  unidade?: string
  serie?: { t: string; v?: number; idx?: number | null; min?: number | null; max?: number | null }[]
  ref?: { min: number | null; max: number | null }; total?: number; fora?: number; modo?: 'ribbon' | 'indice'
  dias?: (DiaPct | DiaSeg)[]
  barras?: { label: string; count: number; conforme: boolean }[]; naoConformes?: number
  tendencia?: 'alta' | 'queda' | 'estavel'
  // Frescor + não execução (nível checklist)
  alerta_silencio_horas?: number | null
  ultimo_em?: string | null
  execucoes?: number
  nao_executadas?: number
  motivos?: { motivo: string; count: number }[]
  // Painel de checklist
  placar?: Placar
  conformidade_dias?: DiaConf[]
  top_nao_conformes?: TopNC[]
  tratamento?: { corrigidos: number; naoCorrigidos: number; aguardN1: number; aguardN2: number }
  tempo_medio?: { segundos: number; amostras: number } | null
}
interface DashData {
  dashboard: { nome: string; transicao_segundos: number; refresh_segundos: number }
  paineis: PainelData[]
}

export default function PainelPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<DashData | null>(null)
  const [erro, setErro] = useState('')
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const [nonce, setNonce] = useState(0)      // muda ao navegar manualmente → reinicia o timer
  const touchX = useRef<number | null>(null)

  const irPara = useCallback((i: number, total: number) => {
    if (total <= 0) return
    const x = ((i % total) + total) % total
    idxRef.current = x; setIdx(x); setNonce(v => v + 1)
  }, [])

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/painel/${token}`, { cache: 'no-store' })
      if (!r.ok) { setErro(r.status === 404 ? 'Dashboard não encontrado.' : 'Não foi possível carregar.'); return }
      const d = await r.json()
      setData(d); setErro('')
    } catch { setErro('Sem conexão.') }
  }, [token])

  // Carrega + polling
  useEffect(() => {
    carregar()
    const seg = data?.dashboard.refresh_segundos ?? 60
    const t = setInterval(carregar, Math.max(60, seg) * 1000)
    return () => clearInterval(t)
  }, [carregar, data?.dashboard.refresh_segundos])

  // Carrossel entre painéis
  useEffect(() => {
    const n = data?.paineis.length ?? 0
    if (n <= 1) return
    const seg = data?.dashboard.transicao_segundos ?? 15
    const t = setInterval(() => {
      idxRef.current = (idxRef.current + 1) % n
      setIdx(idxRef.current)
    }, Math.max(3, seg) * 1000)
    return () => clearInterval(t)
    // `nonce` reinicia o timer após uma navegação manual (não pula logo em seguida)
  }, [data?.paineis.length, data?.dashboard.transicao_segundos, nonce])

  if (erro) return <Tela><p className="text-2xl text-gray-400">{erro}</p></Tela>
  if (!data) return <Tela><p className="text-2xl text-gray-500 animate-pulse">Carregando…</p></Tela>
  if (data.paineis.length === 0) return <Tela><p className="text-2xl text-gray-400">Nenhum painel configurado.</p></Tela>

  const total = data.paineis.length
  const p = data.paineis[Math.min(idx, total - 1)]

  return (
    <div className="fixed inset-0 bg-gray-950 text-white flex flex-col select-none"
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) irPara(idxRef.current + (dx < 0 ? 1 : -1), total)
      }}>
      <div className="flex items-center justify-between px-6 sm:px-8 pt-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-200 truncate">{data.dashboard.nome}</h1>
        {total > 1 && (
          <div className="flex gap-2">
            {data.paineis.map((_, i) => (
              <button key={i} onClick={() => irPara(i, total)} aria-label={`Painel ${i + 1}`}
                className={`w-3 h-3 rounded-full transition-colors ${i === idx ? 'bg-orange-500' : 'bg-gray-700 hover:bg-gray-500'}`} />
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 px-6 sm:px-8 py-4">
        <Painel p={p} />
      </div>

      {/* Navegação manual (swipe já funciona; setas ajudam no toque/desktop) */}
      {total > 1 && (
        <>
          <button onClick={() => irPara(idxRef.current - 1, total)} aria-label="Anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-16 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-3xl">‹</button>
          <button onClick={() => irPara(idxRef.current + 1, total)} aria-label="Próximo"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-16 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-3xl">›</button>
        </>
      )}
    </div>
  )
}

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">{children}</div>
}

type SerieV = { t: string; v: number }

// "há X" a partir de um instante ISO; null se ausente.
function haQuanto(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `há ${h}h${String(m).padStart(2, '0')}` : `há ${h}h`
}

// Selo de frescor: verde/amarelo/vermelho pelo tempo sem nova leitura vs
// alerta_silencio_horas (amarelo na metade do prazo, vermelho ao estourar).
// Sem limite configurado → selo neutro só com "há X" (sem alarme).
function frescor(ultimoEm?: string | null, horas?: number | null) {
  if (!ultimoEm) return { texto: 'sem leituras', cor: 'bg-white/5 text-gray-400', alerta: false }
  const ms = Date.now() - new Date(ultimoEm).getTime()
  const ha = haQuanto(ultimoEm)
  if (!horas) return { texto: ha, cor: 'bg-white/5 text-gray-400', alerta: false }
  const lim = horas * 3600_000
  if (ms > lim) return { texto: `sem registro ${ha}`, cor: 'bg-red-500/15 text-red-400', alerta: true }
  if (ms > lim / 2) return { texto: ha, cor: 'bg-amber-500/15 text-amber-400', alerta: false }
  return { texto: ha, cor: 'bg-green-500/15 text-green-400', alerta: false }
}

// Cabeçalho comum: título + subtítulo + selo de frescor.
function CabecalhoPainel({ p, subtitulo }: { p: PainelData; subtitulo: string }) {
  const f = frescor(p.ultimo_em, p.alerta_silencio_horas)
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xl sm:text-3xl font-bold leading-tight">{p.titulo}</p>
        <p className="text-xs sm:text-sm text-gray-500">{subtitulo}</p>
      </div>
      <span className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs sm:text-sm font-medium ${f.cor} ${f.alerta ? 'animate-pulse' : ''}`}>
        <span className="text-[10px] leading-none">●</span>{f.texto}
      </span>
    </div>
  )
}

function Painel({ p }: { p: PainelData }) {
  if (p.grafico === 'checklist') return <ChecklistPainel p={p} />
  const porDia = p.grafico === 'conformidade' || p.grafico === 'composicao'
  const naoExec = p.nao_executadas ?? 0
  const motivos = (p.motivos ?? []).slice(0, 2).map(m => `${m.motivo} (${m.count})`).join(', ')
  return (
    <div className="h-full flex flex-col">
      <CabecalhoPainel p={p} subtitulo={`Últimas ${p.janela_horas}h${porDia ? ' · por dia' : ''}`} />
      <div className="flex-1 min-h-0">
        {p.grafico === 'linha' && <GraficoLinhaFaixa serie={(p.serie ?? []) as SerieV[]} band={p.ref ?? { min: null, max: null }} unidade={p.unidade} />}
        {p.grafico === 'padrao' && <GraficoPadrao p={p} />}
        {p.grafico === 'conformidade' && <GraficoConformidade p={p} />}
        {p.grafico === 'composicao' && <GraficoComposicao p={p} />}
        {!p.grafico && <SemDados />}
      </div>
      <div className="mt-2 pt-2 border-t border-gray-800 flex items-center gap-4 flex-wrap text-xs sm:text-sm">
        <span className="text-gray-400">{p.execucoes ?? 0} execuções</span>
        <span className={naoExec ? 'text-amber-400' : 'text-green-500'}>
          {naoExec} não executadas{naoExec && motivos ? ` — ${motivos}` : ''}
        </span>
      </div>
    </div>
  )
}

function fmtDuracao(seg: number): string {
  const m = Math.floor(seg / 60), s = seg % 60
  if (m < 1) return `${s}s`
  return s ? `${m}m ${s}s` : `${m}m`
}

// ── Painel de CHECKLIST: placar + conformidade/dia + top não conformes + rodapé ──
function ChecklistPainel({ p }: { p: PainelData }) {
  const pl = p.placar ?? { executados: 0, aprovados: 0, reprovados: 0, naoExecutados: 0, pctAprovacao: null }
  const dias = (p.conformidade_dias ?? []).filter(d => d.total > 0)
  const top = p.top_nao_conformes ?? []
  const trat = p.tratamento ?? { corrigidos: 0, naoCorrigidos: 0, aguardN1: 0, aguardN2: 0 }
  const motivos = (p.motivos ?? []).slice(0, 2).map(m => `${m.motivo} (${m.count})`).join(', ')
  const temTrat = trat.corrigidos + trat.naoCorrigidos + trat.aguardN1 + trat.aguardN2 > 0
  return (
    <div className="h-full flex flex-col">
      <CabecalhoPainel p={p} subtitulo={`Checklist · Últimas ${p.janela_horas}h`} />

      {/* Placar */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        <Tile label="Executados" valor={pl.executados} />
        <Tile label="Aprovação" valor={pl.pctAprovacao == null ? '–' : `${pl.pctAprovacao}%`} cor="text-green-400" fundo="bg-green-500/10" />
        <Tile label="Reprovados" valor={pl.reprovados} cor="text-red-400" fundo="bg-red-500/10" />
        <Tile label="Não executados" valor={pl.naoExecutados} cor="text-amber-400" fundo="bg-amber-500/10" />
        <Tile label="Tempo médio" valor={p.tempo_medio ? fmtDuracao(p.tempo_medio.segundos) : 'n/d'} cor="text-orange-400" />
      </div>

      {/* Conformidade por dia + Top não conformes */}
      <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] gap-4 mt-3">
        <div className="min-h-0 flex flex-col">
          <p className="text-xs sm:text-sm text-gray-400 mb-1">Conformidade por dia</p>
          <div className="flex-1 min-h-0"><BarrasConformidade dias={dias} /></div>
        </div>
        <div className="min-h-0 flex flex-col">
          <p className="text-xs sm:text-sm text-gray-400 mb-1">Top atividades não conformes</p>
          {top.length === 0
            ? <div className="flex-1 flex items-center justify-center"><p className="text-sm text-green-500">Sem não conformidades 🎉</p></div>
            : <div className="flex flex-col gap-2">
                {top.map((t, i) => {
                  const max = top[0].naoConformes || 1
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs sm:text-sm mb-0.5">
                        <span className="text-gray-300 truncate pr-2">{t.atividade}</span>
                        <span className="text-red-400 font-semibold flex-shrink-0">{t.naoConformes}</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full"><div className="h-1.5 bg-red-500 rounded-full" style={{ width: `${Math.round((t.naoConformes / max) * 100)}%` }} /></div>
                    </div>
                  )
                })}
              </div>}
        </div>
      </div>

      {/* Rodapé: tratamento + não execução */}
      <div className="mt-3 pt-2 border-t border-gray-800 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs sm:text-sm">
        <span className="text-gray-500 font-medium">Tratamento</span>
        <span className="text-green-400">● {trat.corrigidos} corrigidos</span>
        <span className="text-red-400">● {trat.naoCorrigidos} não corrigidos</span>
        <span className="text-amber-400">● {trat.aguardN1 + trat.aguardN2} aguardando N1/N2</span>
        {!temTrat && <span className="text-gray-600">sem reprovações a tratar</span>}
        {(p.nao_executadas ?? 0) > 0 && (
          <>
            <span className="text-gray-700">|</span>
            <span className="text-gray-400">não exec.: {motivos}</span>
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ label, valor, cor = 'text-white', fundo = 'bg-white/5' }: { label: string; valor: React.ReactNode; cor?: string; fundo?: string }) {
  return (
    <div className={`${fundo} rounded-lg px-2 py-2 sm:px-3`}>
      <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">{label}</p>
      <p className={`text-xl sm:text-3xl font-bold leading-none mt-1 ${cor}`}>{valor}</p>
    </div>
  )
}

// Barras empilhadas aprovado (verde) × reprovado (vermelho) por dia.
function BarrasConformidade({ dias }: { dias: DiaConf[] }) {
  if (dias.length === 0) return <SemDados />
  const W = 1000, H = 420, padX = 24, padY = 20
  const n = dias.length
  const bw = Math.min(90, ((W - 2 * padX) / n) * 0.6)
  const cx = (i: number) => padX + (n === 1 ? 0.5 : (i + 0.5) / n) * (W - 2 * padX)
  const areaH = H - 2 * padY
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {dias.map((d, i) => {
        const hRep = (d.reprovados / d.total) * areaH
        const hApr = (d.aprovados / d.total) * areaH
        const x = cx(i) - bw / 2
        return (
          <g key={i}>
            <rect x={x} y={padY} width={bw} height={Math.max(0, hApr - 1.5)} fill="#22c55e" rx={2} />
            <rect x={x} y={padY + hApr} width={bw} height={Math.max(0, hRep - 1.5)} fill="#ef4444" rx={2} />
            <text x={cx(i)} y={H - 4} textAnchor="middle" className="fill-gray-600" fontSize={15}>{rotDia(d.dia)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function trendInfo(t?: 'alta' | 'queda' | 'estavel') {
  return {
    alta:    { txt: 'não-conformidade em ALTA',  cor: 'text-red-500',   seta: '▲' },
    queda:   { txt: 'não-conformidade em QUEDA', cor: 'text-green-500', seta: '▼' },
    estavel: { txt: 'estável',                   cor: 'text-gray-400',  seta: '▬' },
  }[t ?? 'estavel']
}
const rotDia = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

// ── Linha + faixa sombreada (número; padrão-ribbon; padrão-índice) ──
function GraficoLinhaFaixa({ serie, band, unidade, corLinha = '#fb923c' }:
  { serie: SerieV[]; band: { min: number | null; max: number | null }; unidade?: string; corLinha?: string }) {
  if (serie.length === 0) return <SemDados />
  const W = 1000, H = 460, padX = 60, padY = 40
  const ts = serie.map(s => new Date(s.t).getTime())
  const vs = serie.map(s => s.v)
  const tMin = Math.min(...ts), tMax = Math.max(...ts)
  const cand = [...vs, band.min, band.max].filter((x): x is number => x != null)
  let yMin = Math.min(...cand), yMax = Math.max(...cand)
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const span = yMax - yMin; yMin -= span * 0.1; yMax += span * 0.1
  const x = (t: number) => padX + (tMax === tMin ? 0.5 : (t - tMin) / (tMax - tMin)) * (W - 2 * padX)
  const y = (v: number) => padY + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * padY)
  const fora = (v: number) => (band.min != null && v < band.min) || (band.max != null && v > band.max)
  const path = serie.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(new Date(s.t).getTime()).toFixed(1)} ${y(s.v).toFixed(1)}`).join(' ')
  const ultimo = serie[serie.length - 1]
  const foraN = serie.filter(s => fora(s.v)).length
  const pctFora = Math.round((foraN / serie.length) * 100)
  const bTop = y(band.max ?? yMax), bBot = y(band.min ?? yMin)
  const u = unidade ?? ''

  return (
    <div className="h-full flex flex-col sm:flex-row gap-3 sm:gap-6">
      <div className="flex-1 min-w-0 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {(band.min != null || band.max != null) && (
            <rect x={padX} y={Math.min(bTop, bBot)} width={W - 2 * padX} height={Math.abs(bBot - bTop)} fill="#22c55e" opacity={0.12} />
          )}
          {band.max != null && <RefLine y={y(band.max)} W={W} padX={padX} label={`máx ${band.max}${u}`} />}
          {band.min != null && <RefLine y={y(band.min)} W={W} padX={padX} label={`mín ${band.min}${u}`} />}
          <path d={path} fill="none" stroke={corLinha} strokeWidth={3} />
          {serie.map((s, i) => (
            <circle key={i} cx={x(new Date(s.t).getTime())} cy={y(s.v)} r={fora(s.v) ? 6 : 4}
              fill={fora(s.v) ? '#ef4444' : corLinha} />
          ))}
        </svg>
      </div>
      <div className="w-full sm:w-56 flex-shrink-0 flex flex-col justify-center items-center border-t sm:border-t-0 sm:border-l border-gray-800 pt-2 sm:pt-0 sm:pl-6">
        <p className="text-xs sm:text-sm text-gray-500">Valor atual</p>
        <p className={`text-4xl sm:text-6xl font-bold leading-tight ${fora(ultimo.v) ? 'text-red-500' : 'text-orange-400'}`}>
          {ultimo.v}<span className="text-lg sm:text-2xl text-gray-500 ml-1">{u}</span>
        </p>
        {(band.min != null || band.max != null) && (
          <p className="text-sm text-gray-500 mt-2">Faixa: {band.min ?? '–'} a {band.max ?? '–'} {u}</p>
        )}
        <p className={`mt-3 text-sm font-semibold ${foraN ? 'text-red-500' : 'text-green-500'}`}>{pctFora}% fora da faixa</p>
        <p className="text-xs text-gray-600 mt-1">{serie.length} leituras</p>
      </div>
    </div>
  )
}

// ── Padrão: ribbon (faixa única, unidades reais) ou índice normalizado (±100%) ──
function GraficoPadrao({ p }: { p: PainelData }) {
  if (p.modo === 'indice') {
    const serie = (p.serie ?? []).filter(s => s.idx != null).map(s => ({ t: s.t, v: s.idx as number }))
    return <GraficoLinhaFaixa serie={serie} band={{ min: -100, max: 100 }} unidade="%" corLinha="#a78bfa" />
  }
  const serie = (p.serie ?? []).map(s => ({ t: s.t, v: s.v ?? 0 }))
  return <GraficoLinhaFaixa serie={serie} band={p.ref ?? { min: null, max: null }} />
}

function RefLine({ y, W, padX, label }: { y: number; W: number; padX: number; label: string }) {
  return (
    <g>
      <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="#4b5563" strokeWidth={1.5} strokeDasharray="6 6" />
      <text x={W - padX} y={y - 6} textAnchor="end" className="fill-gray-500" fontSize={16}>{label}</text>
    </g>
  )
}

// ── Sim/Não: taxa de conformidade por dia (linha) ──────────────
function GraficoConformidade({ p }: { p: PainelData }) {
  const dias = ((p.dias ?? []) as DiaPct[]).filter(d => d.pct != null)
  if (dias.length === 0) return <SemDados />
  const W = 1000, H = 460, padX = 60, padY = 40
  const n = dias.length
  const x = (i: number) => padX + (n === 1 ? 0.5 : i / (n - 1)) * (W - 2 * padX)
  const y = (v: number) => padY + (1 - v / 100) * (H - 2 * padY)
  const media = Math.round(dias.reduce((s, d) => s + (d.pct as number), 0) / n)
  const path = dias.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.pct as number).toFixed(1)}`).join(' ')
  const totalB = (p.barras ?? []).reduce((s, b) => s + b.count, 0)
  const confGeral = totalB ? Math.round(((totalB - (p.naoConformes ?? 0)) / totalB) * 100) : 0
  const trend = trendInfo(p.tendencia)

  return (
    <div className="h-full flex flex-col sm:flex-row gap-3 sm:gap-6">
      <div className="flex-1 min-w-0 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <RefLine y={y(media)} W={W} padX={padX} label={`média ${media}%`} />
          <text x={padX - 8} y={y(100) + 5} textAnchor="end" className="fill-gray-600" fontSize={16}>100%</text>
          <text x={padX - 8} y={y(0) + 5} textAnchor="end" className="fill-gray-600" fontSize={16}>0%</text>
          <path d={path} fill="none" stroke="#38bdf8" strokeWidth={3} />
          {dias.map((d, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(d.pct as number)} r={5} fill="#38bdf8" />
              <text x={x(i)} y={H - 12} textAnchor="middle" className="fill-gray-600" fontSize={15}>{rotDia(d.dia)}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="w-full sm:w-56 flex-shrink-0 flex flex-col justify-center items-center border-t sm:border-t-0 sm:border-l border-gray-800 pt-2 sm:pt-0 sm:pl-6">
        <p className="text-xs sm:text-sm text-gray-500">Conformidade</p>
        <p className="text-4xl sm:text-6xl font-bold text-green-400 leading-tight">{confGeral}%</p>
        <p className={`mt-3 text-sm font-medium ${trend.cor}`}>{trend.seta} {trend.txt}</p>
        <p className="text-xs text-gray-600 mt-3">{p.naoConformes ?? 0} não conformes</p>
      </div>
    </div>
  )
}

const CORES_OK = ['#14b8a6', '#38bdf8', '#a78bfa', '#22c55e', '#eab308']

// ── Única escolha: composição (empilhado 100%) por dia ─────────
function GraficoComposicao({ p }: { p: PainelData }) {
  const dias = ((p.dias ?? []) as DiaSeg[]).filter(d => d.total > 0)
  if (dias.length === 0) return <SemDados />
  const opcoes = dias[0].seg
  let ci = 0
  const cor = opcoes.map(o => o.conforme ? CORES_OK[ci++ % CORES_OK.length] : '#ef4444')
  const W = 1000, H = 430, padX = 40, padY = 24
  const n = dias.length
  const bw = Math.min(80, ((W - 2 * padX) / n) * 0.6)
  const cx = (i: number) => padX + (n === 1 ? 0.5 : (i + 0.5) / n) * (W - 2 * padX)
  const areaH = H - 2 * padY
  const trend = trendInfo(p.tendencia)

  return (
    <div className="h-full flex flex-col sm:flex-row gap-3 sm:gap-6">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 min-h-0" preserveAspectRatio="xMidYMid meet">
          {dias.map((d, i) => {
            let acc = 0
            return (
              <g key={i}>
                {d.seg.map((s, j) => {
                  if (s.count === 0) return null
                  const h = (s.count / d.total) * areaH
                  const yTop = padY + acc
                  acc += h
                  return <rect key={j} x={cx(i) - bw / 2} y={yTop} width={bw} height={Math.max(1, h - 1.5)} fill={cor[j]} rx={2} />
                })}
                <text x={cx(i)} y={H - 6} textAnchor="middle" className="fill-gray-600" fontSize={15}>{rotDia(d.dia)}</text>
              </g>
            )
          })}
        </svg>
        <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-1">
          {opcoes.map((o, j) => (
            <span key={j} className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-400">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: cor[j] }} /> {o.label}
            </span>
          ))}
        </div>
      </div>
      <div className="w-full sm:w-56 flex-shrink-0 flex flex-col justify-center items-center border-t sm:border-t-0 sm:border-l border-gray-800 pt-2 sm:pt-0 sm:pl-6">
        <p className={`text-sm font-medium ${trend.cor}`}>{trend.seta} {trend.txt}</p>
        <p className="text-4xl sm:text-5xl font-bold text-red-500 mt-4">{p.naoConformes ?? 0}</p>
        <p className="text-xs text-gray-500">não conformes</p>
      </div>
    </div>
  )
}

function SemDados() {
  return <div className="h-full flex items-center justify-center"><p className="text-xl text-gray-600">Sem dados no período.</p></div>
}
