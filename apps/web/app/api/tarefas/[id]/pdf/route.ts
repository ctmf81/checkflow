import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderToBuffer, Document, Page, View, Text, Image, Link, StyleSheet } from '@react-pdf/renderer'
import React from 'react'
import fs from 'fs'
import path from 'path'

// Relatório da LISTA DE TAREFAS: dados gerais + detalhamento por execução
// (o que cada pessoa respondeu) com anexos (endereço do check-in + mídias).
// Mesmo padrão da rota /api/execucoes/[id]/pdf (server-side @react-pdf).

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-checkflow.png')
const LOGO_DATA_URI = fs.existsSync(LOGO_PATH)
  ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
  : null

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_ANON   = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Limites para manter o relatório e o tempo de resposta sob controle
const MAX_GEOCODE = 30   // endereços únicos resolvidos
const MAX_IMAGENS = 50   // fotos embutidas

const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#1f2937', backgroundColor: '#ffffff' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 12, borderBottom: '1.5pt solid #f97316' },
  headerLeft:  { flexDirection: 'column', gap: 2 },
  logo:        { width: 100, height: 24, objectFit: 'contain', marginBottom: 2 },
  appName:     { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#f97316' },
  headerSub:   { fontSize: 8, color: '#9ca3af' },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  headerMeta:  { fontSize: 8, color: '#6b7280' },
  titulo:      { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 12 },
  // KPIs
  kpiRow:      { flexDirection: 'row', gap: 12, marginBottom: 16 },
  kpiBox:      { flex: 1, backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, border: '0.5pt solid #e5e7eb' },
  kpiLabel:    { fontSize: 7, color: '#9ca3af', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  kpiValue:    { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111827' },
  // Seção
  secaoTitulo: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingBottom: 3, borderBottom: '0.5pt solid #fed7aa' },
  // Resumo por tarefa
  linhaTarefa: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, paddingBottom: 3, borderBottom: '0.5pt solid #f3f4f6' },
  tarefaNome:  { fontSize: 8.5, color: '#374151', flex: 1, paddingRight: 8 },
  tarefaStat:  { fontSize: 8.5, color: '#6b7280' },
  // Pessoa
  pessoaCard:  { marginBottom: 12, border: '0.5pt solid #e5e7eb', borderRadius: 6, padding: 8 },
  pessoaHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 4, borderBottom: '0.5pt solid #f3f4f6' },
  pessoaNome:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#111827' },
  pessoaMeta:  { fontSize: 7.5, color: '#9ca3af' },
  item:        { marginBottom: 6, paddingLeft: 4 },
  itemLinha:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemFeito:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#15803d' },
  itemNao:     { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#9ca3af' },
  itemNome:    { fontSize: 8.5, color: '#374151' },
  itemObs:     { fontSize: 8, color: '#6b7280', marginTop: 1, marginLeft: 12, fontStyle: 'italic' },
  itemEnd:     { fontSize: 7.5, color: '#2563eb', marginTop: 1, marginLeft: 12 },
  itemVideo:   { fontSize: 7.5, color: '#2563eb', marginTop: 1, marginLeft: 12 },
  foto:        { width: 150, height: 112, objectFit: 'cover', borderRadius: 4, marginTop: 3, marginLeft: 12, border: '0.5pt solid #e5e7eb' },
  footer:      { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTop: '0.5pt solid #e5e7eb', paddingTop: 6 },
  footerText:  { fontSize: 7, color: '#d1d5db' },
})

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
      { headers: { 'User-Agent': 'CheckFlow/1.0 (suporte@checkflow.digital)' } },
    )
    const data = await res.json()
    return data?.display_name || `${lat}, ${lng}`
  } catch {
    return `${lat}, ${lng}`
  }
}

async function fetchImagemDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || 'image/jpeg'
    if (!ct.startsWith('image/')) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 8_000_000) return null
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

const el = React.createElement

function PdfRelatorio({ dados }: { dados: any }) {
  const { titulo, empresa, unidade, execs, itens, statsPorItem, respostasCount, conclusaoMedia, enderecos, imagens } = dados

  return el(Document, { title: `Relatório — ${titulo}` },
    el(Page, { size: 'A4', style: s.page, wrap: true },

      // Header
      el(View, { style: s.header, fixed: true },
        el(View, { style: s.headerLeft },
          LOGO_DATA_URI ? el(Image, { style: s.logo, src: LOGO_DATA_URI }) : el(Text, { style: s.appName }, 'CheckFlow'),
          el(Text, { style: s.headerSub }, 'Relatório de Lista de Tarefas'),
        ),
        el(View, { style: s.headerRight },
          el(Text, { style: s.headerMeta }, empresa || ''),
          el(Text, { style: s.headerMeta }, unidade || ''),
          el(Text, { style: s.headerMeta }, fmt(new Date().toISOString())),
        ),
      ),

      el(Text, { style: s.titulo }, titulo),

      // KPIs
      el(View, { style: s.kpiRow },
        el(View, { style: s.kpiBox }, el(Text, { style: s.kpiLabel }, 'Respostas'), el(Text, { style: s.kpiValue }, String(respostasCount))),
        el(View, { style: s.kpiBox }, el(Text, { style: s.kpiLabel }, 'Conclusão média'), el(Text, { style: s.kpiValue }, `${conclusaoMedia}%`)),
        el(View, { style: s.kpiBox }, el(Text, { style: s.kpiLabel }, 'Tarefas'), el(Text, { style: s.kpiValue }, String(itens.length))),
      ),

      // Resumo por tarefa
      el(View, { style: { marginBottom: 16 } },
        el(Text, { style: s.secaoTitulo }, 'Resumo por tarefa (feito × total)'),
        ...statsPorItem.map((st: any) =>
          el(View, { key: st.id, style: s.linhaTarefa },
            el(Text, { style: s.tarefaNome }, st.titulo),
            el(Text, { style: s.tarefaStat }, `${st.feito}/${st.total} · ${st.total > 0 ? Math.round((st.feito / st.total) * 100) : 0}%`),
          ),
        ),
      ),

      // Detalhamento por pessoa
      el(Text, { style: s.secaoTitulo }, 'Detalhamento por execução'),
      ...execs.map((e: any) =>
        el(View, { key: e.id, style: s.pessoaCard, wrap: false },
          el(View, { style: s.pessoaHead },
            el(Text, { style: s.pessoaNome }, e.nome),
            el(Text, { style: s.pessoaMeta }, `${e.status === 'encerrada' ? 'Encerrada' : 'Em andamento'} · ${fmt(e.aberta_em)}`),
          ),
          ...itens.map((it: any) => {
            const r = e.respostas.find((x: any) => x.item_id === it.id)
            const feito = !!r?.feito
            const key = r && r.lat != null && r.lng != null ? `${Number(r.lat).toFixed(6)},${Number(r.lng).toFixed(6)}` : null
            const endereco = key ? enderecos[key] : null
            const imgUri = r?.evidencia_url && r.evidencia_tipo !== 'video' ? imagens[r.evidencia_url] : null
            return el(View, { key: it.id, style: s.item },
              el(View, { style: s.itemLinha },
                el(Text, { style: feito ? s.itemFeito : s.itemNao }, feito ? '[x]' : '[  ]'),
                el(Text, { style: s.itemNome }, it.titulo),
              ),
              r?.observacao ? el(Text, { style: s.itemObs }, `"${r.observacao}"`) : null,
              endereco ? el(Text, { style: s.itemEnd }, `Local: ${endereco}`) : null,
              imgUri ? el(Image, { style: s.foto, src: imgUri }) : null,
              r?.evidencia_url && r.evidencia_tipo === 'video'
                ? el(Link, { style: s.itemVideo, src: r.evidencia_url }, 'Vídeo (abrir no navegador)')
                : null,
            )
          }),
        ),
      ),

      el(View, { style: s.footer, fixed: true },
        el(Text, { style: s.footerText }, `CheckFlow · Relatório de tarefas`),
        el(Text, { style: s.footerText }, `Gerado em ${fmt(new Date().toISOString())}`),
      ),
    ),
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: listaId } = await params

  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  const sbPublic = createClient(SUPABASE_URL, SUPABASE_ANON)
  const { data: { user }, error: authErr } = await sbPublic.auth.getUser(token)
  if (authErr || !user) return Response.json({ error: 'Sessão inválida' }, { status: 401 })

  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  const { data: lista } = await sb.from('tarefa_listas').select('id, titulo, unidade_id').eq('id', listaId).single()
  if (!lista) return Response.json({ error: 'Lista não encontrada' }, { status: 404 })

  const [{ data: unidade }, { data: itensRaw }, { data: execRaw }] = await Promise.all([
    sb.from('unidades').select('nome, empresas(nome)').eq('id', lista.unidade_id).single(),
    sb.from('tarefa_itens').select('id, titulo, ordem').eq('lista_id', listaId).order('ordem'),
    sb.from('tarefa_execucoes')
      .select('id, status, aberta_em, usuario:usuario_id(nome), respostas:tarefa_respostas(item_id, feito, observacao, evidencia_url, evidencia_tipo, lat, lng, respondido_em)')
      .eq('lista_id', listaId).order('aberta_em', { ascending: false }),
  ])

  const itens = itensRaw ?? []
  const execs = (execRaw ?? []).map((e: any) => ({
    id: e.id, status: e.status, aberta_em: e.aberta_em,
    nome: (Array.isArray(e.usuario) ? e.usuario[0] : e.usuario)?.nome ?? '—',
    respostas: e.respostas ?? [],
  }))

  // Estatísticas gerais
  const total = execs.length
  const statsPorItem = itens.map((it: any) => {
    const feito = execs.reduce((n, e) => n + (e.respostas.some((r: any) => r.item_id === it.id && r.feito) ? 1 : 0), 0)
    return { id: it.id, titulo: it.titulo, feito, total }
  })
  const conclusaoMedia = (total === 0 || itens.length === 0) ? 0 : Math.round(
    (execs.reduce((acc, e) => acc + itens.filter((it: any) => e.respostas.some((r: any) => r.item_id === it.id && r.feito)).length / itens.length, 0) / total) * 100,
  )

  // Endereços (geocodificação reversa das coordenadas únicas, sequencial p/ respeitar o Nominatim)
  const coordsUnicas = new Map<string, { lat: number; lng: number }>()
  for (const e of execs) for (const r of e.respostas) {
    if (r.lat != null && r.lng != null) coordsUnicas.set(`${Number(r.lat).toFixed(6)},${Number(r.lng).toFixed(6)}`, { lat: r.lat, lng: r.lng })
  }
  const enderecos: Record<string, string> = {}
  let g = 0
  for (const [key, c] of coordsUnicas) {
    if (g >= MAX_GEOCODE) { enderecos[key] = `${c.lat}, ${c.lng}`; continue }
    enderecos[key] = await reverseGeocode(c.lat, c.lng)
    g++
    if (g < coordsUnicas.size && g < MAX_GEOCODE) await new Promise(r => setTimeout(r, 1100))
  }

  // Imagens (foto) embutidas como data URI, únicas, com teto
  const urlsFoto = Array.from(new Set(
    execs.flatMap(e => e.respostas.filter((r: any) => r.evidencia_url && r.evidencia_tipo !== 'video').map((r: any) => r.evidencia_url as string)),
  )).slice(0, MAX_IMAGENS)
  const imagens: Record<string, string> = {}
  await Promise.all(urlsFoto.map(async url => { const d = await fetchImagemDataUri(url); if (d) imagens[url] = d }))

  const dados = {
    titulo: lista.titulo,
    empresa: (unidade as any)?.empresas?.nome ?? '',
    unidade: (unidade as any)?.nome ?? '',
    execs, itens, statsPorItem, respostasCount: total, conclusaoMedia, enderecos, imagens,
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderToBuffer(el(PdfRelatorio, { dados }) as any)
  } catch (err: any) {
    console.error('[pdf-tarefas] erro ao renderizar:', err?.message)
    return Response.json({ error: 'Erro ao gerar PDF' }, { status: 500 })
  }

  // Retorna o PDF direto para download (relatório sob demanda, não ocupa storage)
  const nomeArq = `relatorio-tarefas-${(lista.titulo || 'lista').normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}.pdf`
  return new Response(pdfBuffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomeArq}"`,
    },
  })
}
