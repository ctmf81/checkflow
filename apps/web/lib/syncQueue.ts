'use client'

// Fila de submissões offline (Fase 2b). Quando o operador finaliza um
// checklist SEM conexão, a execução completa (incl. fotos como Blob) é
// guardada aqui; ao voltar a internet, é reenviada ao Supabase.
//
// Escopo v1 (seguro): apenas execuções SEM plano de ação e SEM workflow —
// essas exigem conexão (são multi-tabela e ficam fora do caminho offline).
// O caminho de submissão ONLINE original (finalizar) permanece intocado.

import { createClient } from './supabase'
import { registrarUsoArmazenamento } from './uso'
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

export interface ExecucaoPendente {
  localId: string
  execId: string
  checklistId: string
  unidadeId: string
  empresaId: string | null
  userId: string
  agoraISO: string
  dataExpiracao: string
  resultado: 'aprovado' | 'reprovado'
  respostas: RespostaPendente[]
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

// Reenvia UMA execução pendente. Idempotente: header por upsert(id) e
// respostas por delete+insert. Retorna ok=true se sincronizou.
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

  // 2) Uploads das fotos/vídeos
  const uploadArquivo = async (blob: Blob, path: string): Promise<string | null> => {
    const { error } = await sb.storage.from('execucoes').upload(path, blob, {
      contentType: blob.type || 'application/octet-stream', upsert: true,
    })
    if (error) return null
    registrarUsoArmazenamento(p.empresaId, 'execucao', blob.size)
    return sb.storage.from('execucoes').getPublicUrl(path).data.publicUrl
  }

  const linhas: { execucao_id: string; atividade_id: string; resposta: unknown; conforme: boolean | null }[] = []
  for (const r of p.respostas) {
    let resposta: unknown = r.valor
    if (r.arquivo) {
      const url = await uploadArquivo(r.arquivo.blob, `${p.execId}/${r.atividade_id}.${r.arquivo.ext}`)
      // Falha de upload de evidência obrigatória → tenta de novo depois
      if (!url && r.obrigatoria) return false
      resposta = url
        ? (r.tipo === 'video'
            ? { url, nome: r.arquivo.nome, origem: r.arquivo.origem, dataArquivo: r.arquivo.dataArquivo }
            : { url, nome: r.arquivo.nome })
        : { nome: r.arquivo.nome }
    }
    if (resposta === undefined) resposta = null
    linhas.push({ execucao_id: p.execId, atividade_id: r.atividade_id, resposta, conforme: r.conforme })
  }

  // 3) Respostas (delete + insert → idempotente em reenvios)
  await sb.from('checklist_execucao_respostas').delete().eq('execucao_id', p.execId)
  if (linhas.length > 0) {
    const { error: respErr } = await sb.from('checklist_execucao_respostas').insert(linhas)
    if (respErr) return false
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
