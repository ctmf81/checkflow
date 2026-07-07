import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer'
import React from 'react'
import fs from 'fs'
import path from 'path'

// ─── Logo CheckFlow (embutida como base64 p/ evitar fetch no PDF) ────────────

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-checkflow.png')
const LOGO_DATA_URI = fs.existsSync(LOGO_PATH)
  ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
  : null

// ─── Supabase ─────────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET   = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_ANON     = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ─── Estilos do PDF ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:          { fontFamily: 'Helvetica', fontSize: 9, padding: 36, color: '#1f2937', backgroundColor: '#ffffff' },
  // Header
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 12, borderBottom: '1.5pt solid #f97316' },
  headerLeft:    { flexDirection: 'column', gap: 2 },
  logo:          { width: 100, height: 24, objectFit: 'contain', marginBottom: 2 },
  appName:       { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#f97316' },
  headerSub:     { fontSize: 8, color: '#9ca3af' },
  headerRight:   { flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  headerMeta:    { fontSize: 8, color: '#6b7280' },
  // Resultado badge
  badgeWrap:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  badgeAprov:    { backgroundColor: '#dcfce7', color: '#15803d', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  badgeReprov:   { backgroundColor: '#fee2e2', color: '#b91c1c', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  // Info block
  infoRow:       { flexDirection: 'row', gap: 24, marginBottom: 16 },
  infoBox:       { flex: 1, backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, border: '0.5pt solid #e5e7eb' },
  infoLabel:     { fontSize: 7, color: '#9ca3af', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  infoValue:     { fontSize: 9, color: '#111827' },
  // Seção
  secao:         { marginBottom: 14 },
  secaoTitulo:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#f97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingBottom: 3, borderBottom: '0.5pt solid #fed7aa' },
  // Atividade
  atv:           { marginBottom: 5, paddingBottom: 5, borderBottom: '0.5pt solid #f3f4f6' },
  atvNome:       { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 2 },
  atvResposta:   { fontSize: 8.5, color: '#4b5563' },
  atvConforme:   { fontSize: 7.5, color: '#15803d', fontFamily: 'Helvetica-Bold' },
  atvNaoConf:    { fontSize: 7.5, color: '#b91c1c', fontFamily: 'Helvetica-Bold' },
  atvNeutro:     { fontSize: 7.5, color: '#9ca3af' },
  atvFoto:       { width: 140, height: 105, objectFit: 'cover', borderRadius: 4, marginTop: 3, border: '0.5pt solid #e5e7eb' },
  // Planos de ação
  planosTitle:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151', marginTop: 16, marginBottom: 8, paddingBottom: 4, borderBottom: '1pt solid #e5e7eb' },
  planoCard:     { backgroundColor: '#fff7ed', border: '0.5pt solid #fed7aa', borderRadius: 6, padding: 8, marginBottom: 6 },
  planoHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  planoId:       { fontSize: 7.5, color: '#f97316', fontFamily: 'Helvetica-Bold' },
  planoStatus:   { fontSize: 7, fontFamily: 'Helvetica-Bold', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 99 },
  planoAtv:      { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 2 },
  planoObs:      { fontSize: 8, color: '#78350f' },
  // Footer
  footer:        { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTop: '0.5pt solid #e5e7eb', paddingTop: 6 },
  footerText:    { fontSize: 7, color: '#d1d5db' },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_PLANO_PDF: Record<string, { label: string; bg: string; cor: string }> = {
  em_moderacao_n1: { label: 'Aguarda N1',   bg: '#fef3c7', cor: '#92400e' },
  em_moderacao_n2: { label: 'Aguarda N2',   bg: '#ffedd5', cor: '#9a3412' },
  corrigido:       { label: 'Corrigido',     bg: '#dcfce7', cor: '#15803d' },
  nao_corrigido:   { label: 'Não corrigido', bg: '#fee2e2', cor: '#b91c1c' },
  reaberto:        { label: 'Reaberto',      bg: '#f3e8ff', cor: '#7e22ce' },
}

function formatarResposta(tipo: string, resposta: any): string {
  if (resposta === null || resposta === undefined) return '—'
  if (tipo === 'sim_nao')         return resposta === true || resposta === 'true' || resposta === 'sim' ? 'Sim' : 'Não'
  if (tipo === 'foto')            return resposta?.url ? '' : '—'
  if (tipo === 'video')           return resposta?.url ? '[Vídeo gravado]' : '—'
  if (tipo === 'localizacao')     return (resposta?.endereco ?? `${resposta?.lat ?? ''}, ${resposta?.lng ?? ''}`) || '—'
  if (tipo === 'multipla_escolha') {
    if (Array.isArray(resposta))  return resposta.map((r: any) => r.valor ?? r).join(', ')
    if (typeof resposta === 'object' && resposta?.valor) return resposta.valor
  }
  if (tipo === 'catalogo')        return resposta?.valor_chave ?? resposta?.valor ?? String(resposta)
  if (typeof resposta === 'object') return JSON.stringify(resposta)
  return String(resposta)
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Componente PDF ───────────────────────────────────────────────────────────

function PdfExecucao({ dados }: { dados: any }) {
  const { execucao, checklist, secoes, atividades, respostas, planos, empresa, unidade, executor } = dados
  const aprovado = execucao.resultado === 'aprovado'

  // Agrupa atividades por seção
  const atvPorSecao: Record<string, any[]> = {}
  for (const atv of atividades) {
    const sid = atv.secao_id ?? '__sem_secao__'
    if (!atvPorSecao[sid]) atvPorSecao[sid] = []
    atvPorSecao[sid].push(atv)
  }

  return React.createElement(
    Document,
    { title: `Execução — ${checklist?.nome ?? ''}` },
    React.createElement(
      Page,
      { size: 'A4', style: s.page },

      // Header
      React.createElement(View, { style: s.header },
        React.createElement(View, { style: s.headerLeft },
          LOGO_DATA_URI
            ? React.createElement(Image, { style: s.logo, src: LOGO_DATA_URI })
            : React.createElement(Text, { style: s.appName }, 'CheckFlow'),
          React.createElement(Text, { style: s.headerSub }, 'Relatório de Execução de Checklist'),
        ),
        React.createElement(View, { style: s.headerRight },
          React.createElement(Text, { style: s.headerMeta }, empresa ?? ''),
          React.createElement(Text, { style: s.headerMeta }, unidade ?? ''),
          React.createElement(Text, { style: s.headerMeta }, formatarData(execucao.data_execucao)),
        ),
      ),

      // Resultado badge — sem os símbolos ✓/✗ (não existem na Helvetica padrão do
      // PDF e renderizavam como glifo quebrado, sobrepondo o texto). A cor já indica.
      React.createElement(View, { style: s.badgeWrap },
        React.createElement(Text, { style: aprovado ? s.badgeAprov : s.badgeReprov },
          aprovado ? 'APROVADO' : 'REPROVADO'
        ),
      ),

      // Info boxes
      React.createElement(View, { style: s.infoRow },
        React.createElement(View, { style: s.infoBox },
          React.createElement(Text, { style: s.infoLabel }, 'Checklist'),
          React.createElement(Text, { style: s.infoValue }, checklist?.nome ?? '—'),
        ),
        React.createElement(View, { style: s.infoBox },
          React.createElement(Text, { style: s.infoLabel }, 'Executor'),
          React.createElement(Text, { style: s.infoValue }, executor ?? '—'),
        ),
        React.createElement(View, { style: s.infoBox },
          React.createElement(Text, { style: s.infoLabel }, 'ID da Execução'),
          React.createElement(Text, { style: s.infoValue }, execucao.id.slice(0, 8).toUpperCase()),
        ),
      ),

      // Seções e atividades
      ...secoes.map((sec: any) => {
        const atvs = atvPorSecao[sec.id] ?? []
        if (atvs.length === 0) return null

        return React.createElement(View, { key: sec.id, style: s.secao },
          React.createElement(Text, { style: s.secaoTitulo }, sec.nome),
          ...atvs.map((atv: any) => {
            const resp = respostas[atv.id]
            const conforme = resp?.conforme
            const fotoUrl = atv.tipo === 'foto' ? resp?.resposta?.url : null
            const textoResposta = formatarResposta(atv.tipo, resp?.resposta)

            return React.createElement(View, { key: atv.id, style: s.atv },
              React.createElement(Text, { style: s.atvNome }, atv.nome),
              textoResposta && React.createElement(Text, { style: s.atvResposta },
                `Resposta: ${textoResposta}`
              ),
              fotoUrl && React.createElement(Image, { style: s.atvFoto, src: fotoUrl }),
              conforme === true
                ? React.createElement(Text, { style: s.atvConforme }, '● Conforme')
                : conforme === false
                  ? React.createElement(Text, { style: s.atvNaoConf }, '● Não conforme')
                  : React.createElement(Text, { style: s.atvNeutro }, '● —'),
            )
          }),
        )
      }).filter(Boolean),

      // Planos de ação
      planos.length > 0 && React.createElement(View, {},
        React.createElement(Text, { style: s.planosTitle }, `Planos de Ação (${planos.length})`),
        ...planos.map((p: any) => {
          const sp = STATUS_PLANO_PDF[p.status] ?? { label: p.status, bg: '#f3f4f6', cor: '#6b7280' }
          return React.createElement(View, { key: p.id, style: s.planoCard },
            React.createElement(View, { style: s.planoHeader },
              p.identificador
                ? React.createElement(Text, { style: s.planoId }, p.identificador)
                : React.createElement(View, {}),
              React.createElement(Text, { style: { ...s.planoStatus, backgroundColor: sp.bg, color: sp.cor } }, sp.label),
            ),
            React.createElement(Text, { style: s.planoAtv }, p.checklist_atividades?.nome ?? '—'),
            p.observacao_abertura && React.createElement(Text, { style: s.planoObs }, p.observacao_abertura),
          )
        }),
      ),

      // Footer
      React.createElement(View, { style: s.footer, fixed: true },
        React.createElement(Text, { style: s.footerText }, `CheckFlow · Execução ${execucao.id.slice(0, 8).toUpperCase()}`),
        React.createElement(Text, { style: s.footerText }, `Gerado em ${formatarData(new Date().toISOString())}`),
      ),
    )
  )
}

// ─── POST /api/execucoes/[id]/pdf ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: execId } = await params

  // Auth
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return Response.json({ error: 'Não autorizado' }, { status: 401 })

  const sbPublic = createClient(SUPABASE_URL, SUPABASE_ANON)
  const { data: { user }, error: authErr } = await sbPublic.auth.getUser(token)
  if (authErr || !user) return Response.json({ error: 'Sessão inválida' }, { status: 401 })

  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)

  // Busca execução
  const { data: execucao } = await sb.from('checklist_execucoes')
    .select('id, resultado, data_execucao, checklist_id, unidade_id, executado_por')
    .eq('id', execId).single()
  if (!execucao) return Response.json({ error: 'Execução não encontrada' }, { status: 404 })

  // Dados relacionados em paralelo
  const [
    { data: checklist },
    { data: unidade },
    { data: executor },
    { data: secoes },
    { data: atividades },
    { data: respostasRaw },
    { data: planos },
  ] = await Promise.all([
    sb.from('checklists').select('nome').eq('id', execucao.checklist_id).single(),
    sb.from('unidades').select('nome, empresa_id, empresas(nome)').eq('id', execucao.unidade_id).single(),
    sb.from('usuarios').select('nome').eq('id', execucao.executado_por).single(),
    sb.from('checklist_secoes').select('id, nome, ordem').eq('checklist_id', execucao.checklist_id).order('ordem'),
    sb.from('checklist_atividades').select('id, nome, tipo, secao_id, ordem').eq('checklist_id', execucao.checklist_id).order('ordem'),
    sb.from('checklist_execucao_respostas').select('atividade_id, resposta, conforme').eq('execucao_id', execId),
    sb.from('planos_acao').select('id, identificador, status, observacao_abertura, checklist_atividades(nome)').eq('checklist_execucao_id', execId),
  ])

  // Indexa respostas por atividade_id
  const respostas: Record<string, any> = {}
  for (const r of (respostasRaw ?? [])) {
    respostas[r.atividade_id] = r
  }

  const empresa = (unidade as any)?.empresas?.nome ?? ''
  const unidadeNome = (unidade as any)?.nome ?? ''

  const dados = {
    execucao,
    checklist,
    secoes: secoes ?? [],
    atividades: atividades ?? [],
    respostas,
    planos: planos ?? [],
    empresa,
    unidade: unidadeNome,
    executor: executor?.nome ?? '',
  }

  // Gera PDF
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderToBuffer(React.createElement(PdfExecucao, { dados }) as any)
  } catch (err: any) {
    console.error('[pdf] erro ao renderizar:', err?.message)
    return Response.json({ error: 'Erro ao gerar PDF' }, { status: 500 })
  }

  // Upload no Supabase Storage
  const storagePath = `pdfs/${execId}.pdf`
  const { error: uploadErr } = await sb.storage
    .from('execucoes')
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('[pdf] erro no upload:', uploadErr.message)
    return Response.json({ error: 'Erro ao salvar PDF' }, { status: 500 })
  }

  const empresaId = (unidade as any)?.empresa_id
  if (empresaId) {
    await sb.from('uso_armazenamento').insert({
      empresa_id: empresaId, origem: 'pdf', tamanho_bytes: pdfBuffer.length, criado_por: user.id,
    })
  }

  const { data: { publicUrl } } = sb.storage.from('execucoes').getPublicUrl(storagePath)

  // Atualiza pdf_url na execução
  await sb.from('checklist_execucoes').update({ pdf_url: publicUrl }).eq('id', execId)

  return Response.json({ pdf_url: publicUrl })
}
