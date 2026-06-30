// Testes da lib/offlineDraft.ts — rascunho local das respostas em andamento
// (IndexedDB), que protege o que foi digitado/selecionado contra queda de
// conexão / recarga. A regra crítica: NÃO persistir arquivos (File) — só
// valores serializáveis; fotos/vídeos são recapturados. Mockamos a camada
// ./idb para inspecionar exatamente o que seria gravado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/idb', () => ({
  idbPut: vi.fn(),
  idbGet: vi.fn(),
  idbGetAll: vi.fn(),
  idbDelete: vi.fn(),
}))

import { salvarDraftLocal, carregarDraftLocal, removerDraftLocal } from '@/lib/offlineDraft'
import { idbPut, idbGet, idbDelete } from '@/lib/idb'

const STORE = 'execucao_drafts'

// Restaura spies (ex.: Date.now) ao fim de cada teste — clearAllMocks no
// beforeEach só limpa chamadas, não desfaz uma implementação espiada.
afterEach(() => {
  vi.restoreAllMocks()
})

// Helper: extrai o payload gravado (3º arg de idbPut → na verdade 3º: store,key,value)
function ultimoPayloadGravado() {
  const call = (idbPut as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)
  return { store: call?.[0], key: call?.[1], value: call?.[2] }
}

describe('salvarDraftLocal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grava no store execucao_drafts com a chave informada', async () => {
    await salvarDraftLocal('exec-123', { a: 'sim' })
    const { store, key } = ultimoPayloadGravado()
    expect(store).toBe(STORE)
    expect(key).toBe('exec-123')
  })

  it('mantém valores serializáveis (texto, número, seleção)', async () => {
    await salvarDraftLocal('k', { texto: 'oi', numero: 42, mc: ['op1', 'op2'] })
    const { value } = ultimoPayloadGravado()
    expect(value.respostas).toEqual({ texto: 'oi', numero: 42, mc: ['op1', 'op2'] })
  })

  it('remove resposta cujo valor é um File (foto/vídeo não vai pro rascunho)', async () => {
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    await salvarDraftLocal('k', { foto: file, obs: 'texto' })
    const { value } = ultimoPayloadGravado()
    expect(value.respostas).toEqual({ obs: 'texto' })
    expect(value.respostas.foto).toBeUndefined()
  })

  it('remove resposta no formato { file: File } (wrapper de evidência)', async () => {
    const file = new File(['x'], 'v.mp4', { type: 'video/mp4' })
    await salvarDraftLocal('k', { evidencia: { file, nome: 'v.mp4' }, ok: true })
    const { value } = ultimoPayloadGravado()
    expect(value.respostas).toEqual({ ok: true })
  })

  it('preserva objeto que tem chave "file" mas NÃO é um File', async () => {
    // { file: 'algum-id' } não é arquivo — deve ser mantido.
    await salvarDraftLocal('k', { ref: { file: 'id-externo' } })
    const { value } = ultimoPayloadGravado()
    expect(value.respostas).toEqual({ ref: { file: 'id-externo' } })
  })

  it('carimba updatedAt com o instante do salvamento', async () => {
    const agora = 1_700_000_000_000
    vi.spyOn(Date, 'now').mockReturnValue(agora)
    await salvarDraftLocal('k', { a: 1 })
    const { value } = ultimoPayloadGravado()
    expect(value.updatedAt).toBe(agora)
  })

  it('serializa o payload (clone estrutural — sem refs ao objeto original)', async () => {
    const respostas = { aninhado: { x: 1 } }
    await salvarDraftLocal('k', respostas)
    const { value } = ultimoPayloadGravado()
    // Muda o original depois de salvar: o gravado não pode acompanhar.
    respostas.aninhado.x = 999
    expect(value.respostas.aninhado.x).toBe(1)
  })

  it('grava os planos de ação em preenchimento quando informados', async () => {
    const planos = { atv1: { observacao: 'vazou óleo', causaRaizId: 'cr-9', causaRaizObs: '' } }
    await salvarDraftLocal('k', { a: 1 }, planos)
    const { value } = ultimoPayloadGravado()
    expect(value.planos).toEqual({ atv1: { observacao: 'vazou óleo', causaRaizId: 'cr-9', causaRaizObs: '' } })
  })

  it('omite a chave planos quando não há plano (ou objeto vazio)', async () => {
    await salvarDraftLocal('k', { a: 1 })
    expect(ultimoPayloadGravado().value.planos).toBeUndefined()
    await salvarDraftLocal('k', { a: 1 }, {})
    expect(ultimoPayloadGravado().value.planos).toBeUndefined()
  })

  it('clona os planos (sem refs ao objeto original)', async () => {
    const planos = { atv1: { observacao: 'orig' } }
    await salvarDraftLocal('k', {}, planos)
    const { value } = ultimoPayloadGravado()
    planos.atv1.observacao = 'mudou'
    expect((value.planos as any).atv1.observacao).toBe('orig')
  })
})

describe('carregarDraftLocal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('delega a leitura ao idbGet no store correto', async () => {
    ;(idbGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ respostas: { a: 1 }, updatedAt: 1 })
    const r = await carregarDraftLocal('exec-9')
    expect(idbGet).toHaveBeenCalledWith(STORE, 'exec-9')
    expect(r).toEqual({ respostas: { a: 1 }, updatedAt: 1 })
  })

  it('repassa null quando não há rascunho', async () => {
    ;(idbGet as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect(await carregarDraftLocal('x')).toBeNull()
  })
})

describe('removerDraftLocal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('apaga o rascunho do store ao finalizar/descartar', async () => {
    await removerDraftLocal('exec-9')
    expect(idbDelete).toHaveBeenCalledWith(STORE, 'exec-9')
  })
})
