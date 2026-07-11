'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'

// Página PÚBLICA de dashboard (TV) — sem login. Lê /api/painel/[token] em
// polling e roda os painéis num carrossel. Escopada pelo token.

interface DiaPct { dia: string; total: number; conformes?: number; pct?: number | null }
interface DiaSeg { dia: string; total: number; seg: { valor: string; label: string; conforme: boolean; count: number }[] }
interface PainelData {
  id: string; titulo: string; tipo: string; janela_horas: number
  grafico?: 'linha' | 'padrao' | 'conformidade' | 'composicao'
  unidade?: string
  serie?: { t: string; v?: number; idx?: number | null; min?: number | null; max?: number | null }[]
  ref?: { min: number | null; max: number | null }; total?: number; fora?: number; modo?: 'ribbon' | 'indice'
  dias?: (DiaPct | DiaSeg)[]
  barras?: { label: string; count: number; conforme: boolean }[]; naoConformes?: number
  tendencia?: 'alta' | 'queda' | 'estavel'
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

function Painel({ p }: { p: PainelData }) {
  const porDia = p.grafico === 'conformidade' || p.grafico === 'composicao'
  return (
    <div className="h-full flex flex-col">
      <div className="mb-2">
        <p className="text-xl sm:text-3xl font-bold leading-tight">{p.titulo}</p>
        <p className="text-xs sm:text-sm text-gray-500">Últimas {p.janela_horas}h{porDia ? ' · por dia' : ''}</p>
      </div>
      <div className="flex-1 min-h-0">
        {p.grafico === 'linha' && <GraficoLinhaFaixa serie={(p.serie ?? []) as SerieV[]} band={p.ref ?? { min: null, max: null }} unidade={p.unidade} />}
        {p.grafico === 'padrao' && <GraficoPadrao p={p} />}
        {p.grafico === 'conformidade' && <GraficoConformidade p={p} />}
        {p.grafico === 'composicao' && <GraficoComposicao p={p} />}
        {!p.grafico && <SemDados />}
      </div>
    </div>
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
