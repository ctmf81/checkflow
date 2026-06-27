'use client'

// Fila de submissões offline (Fase 2b). Quando o operador finaliza um
// checklist SEM conexão, a execução completa (incl. fotos como Blob) é
// guardada aqui; ao voltar a internet, é reenviada ao Supabase.
//
// Escopo: execução simples E com plano de ação. Ainda exigem conexão
// (bloqueadas offline): workflow e execução agendada (entram por outro
// fluxo). O caminho de submissão ONLINE original (finalizar) é intocado.
//
// Idempotência (reenvio): header por upsert(id do cliente); respostas e
// planos no padrão "criar só se ainda não existem para este execId" — assim
// um reenvio nunca duplica nem quebra FK (sem deletes).

import { createClient } from './supabase'
import { registrarUsoArmazenamento } from './uso'
import { notificarPlanoAberto } from './notificacoes'
import { idbGetAll, idbPut, idbDelete } from './idb'

const STORE = 'pending_submissions'

export interface RespostaPendente {
  atividade_id: string
  tipo: string
  conforme: boolean | null
  valor: unknown | null // resposta não-arquivo (já serializável)
  arquivo: { blob: Blob; nome: string | null; ext: string; origem?: string; dataArquivo?: string } | null
  obrigatoria: boolean
}

export interface PlanoPendente {
  atividadeId: string
  observacao: string
  slaHoras: number | null
  causaRaizId: string | null
  causaRaizObs: string | null
  fotos: { blob: Blob; ext: string }[]
  video: { blob: Blob; ext: string } | null
}

export interface ExecucaoPendente {
  localId: string
  execId: string
  checklistId: string
  checklistSubgrupoId: string | null
  unidadeId: string
  empresaId: string | null
  userId: string
  agoraISO: string
  dataExpiracao: string
  resultado: 'aprovado' | 'reprovado'
  respostas: RespostaPendente[]
  planos: PlanoPendente[]
  createdAt: number
  tentativas: number
}

export async function enfileirarSubmissao(p: Omit<ExecucaoPendente, 'tentativas'>): Promise<void> {
  await idbPut(STORE, p.localId, { ...p, tentativas: 0 })
}

export async function listarPendentes(): Promise<ExecucaoPendente[]> {
  return idbGetAll<ExecucaoPendente>(STORE)
}

export async function contarPendentes(): Promise<number> {
  return (await listarPendentes()).length
}

// Reenvia UMA execução pendente. Retorna ok=true se sincronizou por completo.
async function submeterPendente(p: ExecucaoPendente): Promise<boolean> {
  const sb = createClient()

  // 1) Header da execução (upsert pelo id gerado no cliente → idempotente)
  const { error: headErr } = await sb.from('checklist_execucoes').upsert({
    id: p.execId,
    checklist_id: p.checklistId,
    unidade_id: p.unidadeId,
    executado_por: p.userId,
    data_execucao: p.agoraISO,
    data_expiracao: p.dataExpiracao,
    status: 'concluido',
    resultado: p.resultado,
  }, { onConflict: 'id' })
  if (headErr) return false

  const uploadArquivo = async (blob: Blob, path: string): Promise<string | null> => {
    const { error } = await sb.storage.from('execucoes').upload(path, blob, {
      contentType: blob.type || 'application/octet-stream', upsert: true,
    })
    if (error) return null
    registrarUsoArmazenamento(p.empresaId, 'execucao', blob.size)
    return sb.storage.from('execucoes').getPublicUrl(path).data.publicUrl
  }

  // 2) Respostas — cria só se ainda não existem para este execId (idempotente).
  let respostasInseridas: { id: string; atividade_id: string }[] = []
  const { data: respExistentes } = await sb.from('checklist_execucao_respostas')
    .select('id, atividade_id').eq('execucao_id', p.execId)

  if (respExistentes && respExistentes.length > 0) {
    respostasInseridas = respExistentes
  } else {
    const linhas: { execucao_id: string; atividade_id: string; resposta: unknown; conforme: boolean | null }[] = []
    for (const r of p.respostas) {
      let resposta: unknown = r.valor
      if (r.arquivo) {
        const url = await uploadArquivo(r.arquivo.blob, `${p.execId}/${r.atividade_id}.${r.arquivo.ext}`)
        if (!url && r.obrigatoria) return false // evidência obrigatória falhou → tenta depois
        resposta = url
          ? (r.tipo === 'video'
              ? { url, nome: r.arquivo.nome, origem: r.arquivo.origem, dataArquivo: r.arquivo.dataArquivo }
              : { url, nome: r.arquivo.nome })
          : { nome: r.arquivo.nome }
      }
      if (resposta === undefined) resposta = null
      linhas.push({ execucao_id: p.execId, atividade_id: r.atividade_id, resposta, conforme: r.conforme })
    }
    if (linhas.length > 0) {
      const { data, error: respErr } = await sb.from('checklist_execucao_respostas')
        .insert(linhas).select('id, atividade_id')
      if (respErr || !data) return false
      respostasInseridas = data
    }
  }

  // 3) Planos de ação — só se houver e o checklist tiver subgrupo. Idempotente:
  // cria apenas se ainda não há planos para este execId.
  if (p.planos && p.planos.length > 0 && p.checklistSubgrupoId) {
    const { data: planosExistentes } = await sb.from('planos_acao')
      .select('id').eq('checklist_execucao_id', p.execId).limit(1)

    if (!planosExistentes || planosExistentes.length === 0) {
      const { data: perfil } = await sb.from('usuarios').select('nome').eq('id', p.userId).single()
      const atorNome = perfil?.nome ?? 'Operador'
      const base = new Date(p.agoraISO).getTime()

      for (const plano of p.planos) {
        const resp = respostasInseridas.find(r => r.atividade_id === plano.atividadeId)
        if (!resp) continue
        const slaPrazo = plano.slaHoras && plano.slaHoras > 0
          ? new Date(base + plano.slaHoras * 3600000).toISOString()
          : null

        const { data: planoInserido, error: planoErr } = await sb.from('planos_acao').insert({
          unidade_id: p.unidadeId,
          subgrupo_id: p.checklistSubgrupoId,
          checklist_execucao_id: p.execId,
          checklist_execucao_resposta_id: resp.id,
          atividade_id: plano.atividadeId,
          observacao_abertura: plano.observacao,
          sla_prazo: slaPrazo,
          criado_por: p.userId,
        }).select('id').single()
        if (planoErr || !planoInserido) return false // mantém na fila p/ retry

        const evidencias: { plano_acao_id: string; tipo: string; url: string; ordem: number }[] = []
        for (let i = 0; i < plano.fotos.length; i++) {
          const url = await uploadArquivo(plano.fotos[i].blob, `planos/${planoInserido.id}/foto_${i}.${plano.fotos[i].ext}`)
          if (url) evidencias.push({ plano_acao_id: planoInserido.id, tipo: 'foto', url, ordem: i })
        }
        if (plano.video) {
          const url = await uploadArquivo(plano.video.blob, `planos/${planoInserido.id}/video.${plano.video.ext}`)
          if (url) evidencias.push({ plano_acao_id: planoInserido.id, tipo: 'video', url, ordem: 0 })
        }
        if (evidencias.length > 0) await sb.from('plano_acao_evidencias').insert(evidencias)

        await sb.from('plano_acao_movimentacoes').insert({
          plano_acao_id: planoInserido.id, usuario_id: p.userId, acao: 'aberto', observacao: plano.observacao,
        })

        if (plano.causaRaizId) {
          await sb.from('causa_raiz_ocorrencias').insert({
            causa_raiz_id: plano.causaRaizId, atividade_id: plano.atividadeId,
            plano_acao_id: planoInserido.id, unidade_id: p.unidadeId,
            observacao: plano.causaRaizObs || null, criado_por: p.userId,
          })
        }

        notificarPlanoAberto({ plano_id: planoInserido.id, observacao: plano.observacao, ator_nome: atorNome })
      }
    }
  }

  return true
}

let processando = false

// Processa a fila inteira. Chamado ao carregar e quando a conexão volta.
// Remove da fila as que sincronizaram; mantém as que falharam (retry depois).
export async function processarFila(): Promise<{ enviadas: number; restantes: number }> {
  if (processando || typeof navigator === 'undefined' || !navigator.onLine) {
    return { enviadas: 0, restantes: await contarPendentes() }
  }
  processando = true
  let enviadas = 0
  try {
    const pendentes = await listarPendentes()
    for (const p of pendentes) {
      try {
        const ok = await submeterPendente(p)
        if (ok) {
          await idbDelete(STORE, p.localId)
          enviadas++
        } else {
          await idbPut(STORE, p.localId, { ...p, tentativas: (p.tentativas ?? 0) + 1 })
        }
      } catch {
        await idbPut(STORE, p.localId, { ...p, tentativas: (p.tentativas ?? 0) + 1 })
      }
    }
  } finally {
    processando = false
  }
  return { enviadas, restantes: await contarPendentes() }
}
