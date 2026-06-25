// POST /api/checklist/sincronizar
// Recebe execuções e planos de ação offline do app móvel
// Valida, persiste em Supabase e retorna confirmação

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: 'ws' } }
)

interface SincronizacaoPayload {
  execucoes: Array<{
    id: string
    checklist_id: string
    unidade_id: string
    usuario_id: string
    data_inicio: string
    data_conclusao?: string
    status: 'em_andamento' | 'concluido' | 'nao_executado'
    resultado?: 'aprovado' | 'reprovado'
    respostas: Record<string, any>
    motivo_nao_execucao_id?: string
    motivo_nao_execucao_obs?: string
  }>
  planos: Array<{
    id: string
    checklist_execucao_id: string
    atividade_id: string
    status: string
    causa_raiz_id?: string
    observacao?: string
  }>
  timestamp: string
}

interface SincronizacaoResponse {
  sucesso: boolean
  execucoesProcessadas: number
  planosProcessados: number
  erros: Array<{ id: string; tipo: string; mensagem: string }>
  timestamp: string
}

export async function sincronizacaoRoutes(app: FastifyInstance) {
  app.post<{ Body: SincronizacaoPayload }>(
    '/api/checklist/sincronizar',
    { onRequest: [app.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const usuario = (request as any).user
        const payload = request.body

        const resposta: SincronizacaoResponse = {
          sucesso: true,
          execucoesProcessadas: 0,
          planosProcessados: 0,
          erros: [],
          timestamp: new Date().toISOString()
        }

        // ─── 1. PROCESSA EXECUÇÕES ──────────────────────────────────────

        for (const exec of payload.execucoes) {
          try {
            // Valida se a execução já existe (idempotência)
            const { data: existe } = await supabase
              .from('checklist_execucoes')
              .select('id')
              .eq('id', exec.id)
              .single()

            if (!existe) {
              // Insere nova execução
              const { error } = await supabase
                .from('checklist_execucoes')
                .insert({
                  id: exec.id,
                  checklist_id: exec.checklist_id,
                  unidade_id: exec.unidade_id,
                  usuario_id: usuario.id,
                  data_execucao: exec.data_inicio,
                  data_conclusao: exec.data_conclusao || new Date().toISOString(),
                  status: exec.status,
                  resultado: exec.resultado || null,
                  respostas_json: exec.respostas,
                  motivo_nao_execucao_id: exec.motivo_nao_execucao_id || null,
                  motivo_nao_execucao_obs: exec.motivo_nao_execucao_obs || null,
                  criado_em: exec.data_inicio
                })

              if (error) {
                resposta.erros.push({
                  id: exec.id,
                  tipo: 'execucao',
                  mensagem: error.message
                })
              } else {
                resposta.execucoesProcessadas++
              }
            } else {
              // Já existe → conta como processada
              resposta.execucoesProcessadas++
            }
          } catch (e: any) {
            resposta.erros.push({
              id: exec.id,
              tipo: 'execucao',
              mensagem: e.message
            })
          }
        }

        // ─── 2. PROCESSA PLANOS DE AÇÃO ─────────────────────────────────

        for (const plano of payload.planos) {
          try {
            // Valida se a execução existe
            const { data: execExiste } = await supabase
              .from('checklist_execucoes')
              .select('id')
              .eq('id', plano.checklist_execucao_id)
              .single()

            if (!execExiste) {
              resposta.erros.push({
                id: plano.id,
                tipo: 'plano',
                mensagem: `Execução ${plano.checklist_execucao_id} não encontrada`
              })
              continue
            }

            // Valida se plano já existe
            const { data: planoExiste } = await supabase
              .from('planos_acao')
              .select('id')
              .eq('id', plano.id)
              .single()

            if (!planoExiste) {
              // Cria novo plano
              const { error } = await supabase
                .from('planos_acao')
                .insert({
                  id: plano.id,
                  checklist_execucao_id: plano.checklist_execucao_id,
                  atividade_id: plano.atividade_id,
                  status: plano.status,
                  causa_raiz_id: plano.causa_raiz_id || null,
                  observacao: plano.observacao || null,
                  criado_por: usuario.id,
                  criado_em: new Date().toISOString()
                })

              if (error) {
                resposta.erros.push({
                  id: plano.id,
                  tipo: 'plano',
                  mensagem: error.message
                })
              } else {
                resposta.planosProcessados++
                // Notificar N1 do subgrupo (fila de notificação)
                // TODO: enqueue notification
              }
            } else {
              resposta.planosProcessados++
            }
          } catch (e: any) {
            resposta.erros.push({
              id: plano.id,
              tipo: 'plano',
              mensagem: e.message
            })
          }
        }

        resposta.sucesso = resposta.erros.length === 0
        return reply.send(resposta)
      } catch (err: any) {
        return reply.status(500).send({
          erro: 'Erro ao sincronizar',
          mensagem: err.message
        })
      }
    }
  )
}
