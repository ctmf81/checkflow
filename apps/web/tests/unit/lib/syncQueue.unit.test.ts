// Testes da lib/syncQueue.ts — fila de submissões offline (Fase 2b). Quando o
// operador finaliza um checklist sem conexão, a execução é guardada e reenviada
// ao voltar a internet. Cobre: enfileirar (tentativas começa em 0), listar/
// contar, o GUARD de não processar offline (sem tocar a rede), o caminho feliz
// que remove da fila ao sincronizar, a IDEMPOTÊNCIA (respostas já existentes não
// são reinseridas) e o retry (falha mantém na fila e incrementa tentativas).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/idb', () => ({
  idbPut: vi.fn().mockResolvedValue(undefined),
  idbGetAll: vi.fn().mockResolvedValue([]),
  idbDelete: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/uso', () => ({ registrarUsoArmazenamento: vi.fn() }))
vi.mock('@/lib/notificacoes', () => ({ notificarPlanoAberto: vi.fn() }))

import {
  enfileirarSubmissao, listarPendentes, contarPendentes, processarFila,
  type ExecucaoPendente,
} from '@/lib/syncQueue'
import { idbPut, idbGetAll, idbDelete } from '@/lib/idb'
import { createClient } from '@/lib/supabase'

const STORE = 'pending_submissions'
const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>

function execucao(over: Partial<ExecucaoPendente> = {}): ExecucaoPendente {
  return {
    localId: 'local-1',
    execId: 'exec-1',
    checklistId: 'cl1',
    checklistSubgrupoId: null,
    unidadeId: 'uni1',
    empresaId: 'emp1',
    userId: 'user1',
    agoraISO: '2026-06-27T12:00:00.000Z',
    dataExpiracao: '2026-12-27T12:00:00.000Z',
    resultado: 'aprovado',
    respostas: [
      { atividade_id: 'atv1', tipo: 'sim_nao', conforme: true, valor: 'sim', arquivo: null, obrigatoria: true },
    ],
    planos: [],
    createdAt: 1,
    tentativas: 0,
    ...over,
  }
}

// Mock de Supabase voltado ao submeterPendente sem arquivos/planos.
// `respExistentes` controla a idempotência; `headerResult` controla a falha
// no header. Registra as inserções de resposta para provar não-reinserção.
function makeSb(opts: { headerResult?: { error: unknown }; respExistentes?: { data: unknown[] } } = {}) {
  const respostaInserts: unknown[][] = []
  const thenable = (val: unknown) => ({ then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(val).then(res, rej) })
  const sb = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      if (table === 'checklist_execucoes') {
        chain.upsert = () => thenable(opts.headerResult ?? { error: null })
      } else if (table === 'checklist_execucao_respostas') {
        chain.select = () => chain
        chain.eq = () => thenable(opts.respExistentes ?? { data: [] })
        chain.insert = (linhas: unknown[]) => {
          respostaInserts.push(linhas)
          return { select: () => thenable({ data: [{ id: 'r1', atividade_id: 'atv1' }], error: null }) }
        }
      }
      return chain
    },
  }
  return { sb, respostaInserts }
}

beforeEach(() => {
  // resetAllMocks (não clearAllMocks) para que nenhuma implementação vaze entre
  // testes — ex.: o mockResolvedValue persistente do teste de guard offline não
  // pode virar o default do idbGetAll dos testes seguintes. Rearmamos os
  // defaults logo abaixo; createClient é configurado por teste.
  vi.resetAllMocks()
  mock(idbPut).mockResolvedValue(undefined)
  mock(idbDelete).mockResolvedValue(undefined)
  mock(idbGetAll).mockResolvedValue([])
  Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true })
})

describe('enfileirarSubmissao', () => {
  it('grava no store de pendentes sob o localId, com tentativas = 0', async () => {
    const { tentativas, ...semTentativas } = execucao()
    void tentativas
    await enfileirarSubmissao(semTentativas)
    const call = mock(idbPut).mock.calls.at(-1)
    expect(call?.[0]).toBe(STORE)
    expect(call?.[1]).toBe('local-1')
    expect((call?.[2] as ExecucaoPendente).tentativas).toBe(0)
  })
})

describe('listarPendentes / contarPendentes', () => {
  it('listarPendentes devolve o conteúdo do store', async () => {
    mock(idbGetAll).mockResolvedValue([execucao(), execucao({ localId: 'local-2' })])
    expect(await listarPendentes()).toHaveLength(2)
  })

  it('contarPendentes devolve a quantidade na fila', async () => {
    mock(idbGetAll).mockResolvedValue([execucao()])
    expect(await contarPendentes()).toBe(1)
  })
})

describe('processarFila — guard offline', () => {
  it('não toca a rede quando está offline; só reporta o que está pendente', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false })
    mock(idbGetAll).mockResolvedValue([execucao()])

    const r = await processarFila()

    expect(r).toEqual({ enviadas: 0, restantes: 1 })
    expect(createClient).not.toHaveBeenCalled()
    expect(idbDelete).not.toHaveBeenCalled()
  })
})

describe('processarFila — sincronização', () => {
  it('reenvia a execução e a remove da fila quando sincroniza', async () => {
    const { sb } = makeSb()
    mock(createClient).mockReturnValue(sb)
    // 1ª chamada (listarPendentes) traz a pendência; 2ª (contagem final) fila vazia.
    mock(idbGetAll).mockResolvedValueOnce([execucao()]).mockResolvedValueOnce([])

    const r = await processarFila()

    expect(r.enviadas).toBe(1)
    expect(r.restantes).toBe(0)
    expect(idbDelete).toHaveBeenCalledWith(STORE, 'local-1')
  })

  it('é idempotente: não reinsere respostas que já existem para o execId', async () => {
    const { sb, respostaInserts } = makeSb({ respExistentes: { data: [{ id: 'r1', atividade_id: 'atv1' }] } })
    mock(createClient).mockReturnValue(sb)
    mock(idbGetAll).mockResolvedValueOnce([execucao()]).mockResolvedValueOnce([])

    const r = await processarFila()

    expect(respostaInserts).toHaveLength(0) // nenhuma reinserção
    expect(r.enviadas).toBe(1)
    expect(idbDelete).toHaveBeenCalledWith(STORE, 'local-1')
  })

  it('mantém na fila e incrementa tentativas quando o header falha', async () => {
    const { sb } = makeSb({ headerResult: { error: { message: 'rls' } } })
    mock(createClient).mockReturnValue(sb)
    mock(idbGetAll).mockResolvedValueOnce([execucao({ tentativas: 0 })]).mockResolvedValueOnce([execucao()])

    const r = await processarFila()

    expect(r.enviadas).toBe(0)
    expect(idbDelete).not.toHaveBeenCalled()
    // Regravada com tentativas incrementada para retry posterior.
    const regravada = mock(idbPut).mock.calls.at(-1)
    expect(regravada?.[0]).toBe(STORE)
    expect((regravada?.[2] as ExecucaoPendente).tentativas).toBe(1)
  })
})
