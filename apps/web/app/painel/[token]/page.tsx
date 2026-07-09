'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'

// Página PÚBLICA de dashboard (TV) — sem login. Lê /api/painel/[token] em
// polling e roda os painéis num carrossel. Escopada pelo token.

interface PainelData {
  id: string; titulo: string; tipo: string; janela_horas: number
  grafico?: 'linha' | 'barras'
  // linha (numero/padrao)
  unidade?: string; serie?: { t: string; v: number }[]; ref?: { min: number | null; max: number | null }; total?: number
  // barras (sim_nao/multipla)
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

function Painel({ p }: { p: PainelData }) {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-2">
        <p className="text-xl sm:text-3xl font-bold leading-tight">{p.titulo}</p>
        <p className="text-xs sm:text-sm text-gray-500">Últimas {p.janela_horas}h</p>
      </div>
      <div className="flex-1 min-h-0">
        {p.grafico === 'linha' ? <GraficoLinha p={p} /> : <GraficoBarras p={p} />}
      </div>
    </div>
  )
}

// ── Gráfico de linha (número/padrão) ──────────────────────────
function GraficoLinha({ p }: { p: PainelData }) {
  const serie = p.serie ?? []
  if (serie.length === 0) return <SemDados />
  const W = 1000, H = 460, padX = 60, padY = 40
  const ts = serie.map(s => new Date(s.t).getTime())
  const vs = serie.map(s => s.v)
  const tMin = Math.min(...ts), tMax = Math.max(...ts)
  const cand = [...vs, p.ref?.min, p.ref?.max].filter((x): x is number => x != null)
  let yMin = Math.min(...cand), yMax = Math.max(...cand)
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const span = yMax - yMin; yMin -= span * 0.1; yMax += span * 0.1
  const x = (t: number) => padX + (tMax === tMin ? 0.5 : (t - tMin) / (tMax - tMin)) * (W - 2 * padX)
  const y = (v: number) => padY + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * padY)
  const fora = (v: number) => (p.ref?.min != null && v < p.ref.min) || (p.ref?.max != null && v > p.ref.max)
  const path = serie.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(new Date(s.t).getTime()).toFixed(1)} ${y(s.v).toFixed(1)}`).join(' ')
  const ultimo = serie[serie.length - 1]
  const ultimoFora = fora(ultimo.v)

  return (
    <div className="h-full flex flex-col sm:flex-row gap-3 sm:gap-6">
      <div className="flex-1 min-w-0 min-h-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* linhas de referência */}
          {p.ref?.max != null && <RefLine y={y(p.ref.max)} W={W} padX={padX} label={`máx ${p.ref.max}`} />}
          {p.ref?.min != null && <RefLine y={y(p.ref.min)} W={W} padX={padX} label={`mín ${p.ref.min}`} />}
          {/* linha do valor */}
          <path d={path} fill="none" stroke="#fb923c" strokeWidth={3} />
          {serie.map((s, i) => (
            <circle key={i} cx={x(new Date(s.t).getTime())} cy={y(s.v)} r={fora(s.v) ? 6 : 4}
              fill={fora(s.v) ? '#ef4444' : '#fb923c'} />
          ))}
        </svg>
      </div>
      {/* valor atual */}
      <div className="w-full sm:w-56 flex-shrink-0 flex flex-col justify-center items-center border-t sm:border-t-0 sm:border-l border-gray-800 pt-2 sm:pt-0 sm:pl-6">
        <p className="text-xs sm:text-sm text-gray-500">Valor atual</p>
        <p className={`text-4xl sm:text-6xl font-bold leading-tight ${ultimoFora ? 'text-red-500' : 'text-orange-400'}`}>
          {ultimo.v}<span className="text-lg sm:text-2xl text-gray-500 ml-1">{p.unidade}</span>
        </p>
        {(p.ref?.min != null || p.ref?.max != null) && (
          <p className="text-sm text-gray-500 mt-2">
            Ref: {p.ref?.min ?? '–'} a {p.ref?.max ?? '–'} {p.unidade}
          </p>
        )}
        {ultimoFora && <p className="mt-2 text-sm font-semibold text-red-500">FORA DA FAIXA</p>}
        <p className="text-xs text-gray-600 mt-4">{p.total} leituras</p>
      </div>
    </div>
  )
}

function RefLine({ y, W, padX, label }: { y: number; W: number; padX: number; label: string }) {
  return (
    <g>
      <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="#4b5563" strokeWidth={1.5} strokeDasharray="6 6" />
      <text x={W - padX} y={y - 6} textAnchor="end" className="fill-gray-500" fontSize={16}>{label}</text>
    </g>
  )
}

// ── Gráfico de barras (sim/não, única escolha) ────────────────
function GraficoBarras({ p }: { p: PainelData }) {
  const barras = p.barras ?? []
  const total = barras.reduce((s, b) => s + b.count, 0)
  if (total === 0) return <SemDados />
  const max = Math.max(...barras.map(b => b.count), 1)
  const trend = p.tendencia ?? 'estavel'
  const trendMap = {
    alta:  { txt: 'Não-conformidade em ALTA', cor: 'text-red-500', seta: '▲' },
    queda: { txt: 'Não-conformidade em QUEDA', cor: 'text-green-500', seta: '▼' },
    estavel: { txt: 'Estável', cor: 'text-gray-400', seta: '▬' },
  }[trend]

  return (
    <div className="h-full flex flex-col sm:flex-row gap-3 sm:gap-6">
      <div className="flex-1 min-h-0 flex items-end justify-around gap-3 sm:gap-4 pb-8 sm:pb-10 pt-4">
        {barras.map(b => (
          <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <p className="text-2xl sm:text-3xl font-bold mb-1">{b.count}</p>
            <div className="w-full rounded-t-lg transition-all"
              style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count > 0 ? 8 : 0,
                backgroundColor: b.conforme ? '#22c55e' : '#ef4444' }} />
            <p className="text-sm sm:text-lg text-gray-300 mt-2 text-center truncate w-full">{b.label}</p>
          </div>
        ))}
      </div>
      <div className="w-full sm:w-56 flex-shrink-0 flex sm:flex-col items-center justify-center gap-4 sm:gap-0 border-t sm:border-t-0 sm:border-l border-gray-800 pt-3 sm:pt-0 sm:pl-6">
        <div className="text-center">
          <p className={`text-xl sm:text-2xl font-bold ${trendMap.cor}`}>{trendMap.seta}</p>
          <p className={`text-xs sm:text-sm font-medium ${trendMap.cor}`}>{trendMap.txt}</p>
        </div>
        <div className="text-center sm:mt-6">
          <p className="text-4xl sm:text-5xl font-bold text-red-500">{p.naoConformes ?? 0}</p>
          <p className="text-xs sm:text-sm text-gray-500">não conformes</p>
        </div>
      </div>
    </div>
  )
}

function SemDados() {
  return <div className="h-full flex items-center justify-center"><p className="text-xl text-gray-600">Sem dados no período.</p></div>
}
