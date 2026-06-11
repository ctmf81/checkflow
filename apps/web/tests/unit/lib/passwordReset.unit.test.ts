/**
 * Testes unitários para apps/web/lib/passwordReset.ts
 *
 * Cobre o "login por código (OTP)" — Fases 2-6:
 * - hashValor: hashing determinístico (sha256) usado para nunca guardar
 *   código/token em texto puro em `password_reset_tokens`.
 * - criarCodigoOtp: gera código de 6 dígitos e grava o hash + expiração.
 * - contarSolicitacoesRecentes: anti-abuso (limite de envios/hora).
 * - validarCodigoOtp: todos os ramos (sem token, expirado, máx. tentativas,
 *   código errado incrementa tentativas, código certo gera sessaoToken).
 * - validarSessaoSenha: token de sessão de uso único (sem token, expirado,
 *   hash incorreto, sucesso marca usado=true).
 * - enviarCodigoUsuario: monta o payload correto para apps/api
 *   (`/whatsapp/enviar-codigo`), incluindo regra do e-mail "@checkflow.local".
 *
 * Se a lógica de `lib/passwordReset.ts` mudar (ex: TTLs, MAX_TENTATIVAS,
 * shape das tabelas), estes testes vão falhar e devem ser atualizados junto.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  hashValor,
  criarCodigoOtp,
  contarSolicitacoesRecentes,
  validarCodigoOtp,
  validarSessaoSenha,
  enviarCodigoUsuario,
} from '../../../lib/passwordReset'

// ─── Mock de SupabaseClient ────────────────────────────────────────────────
// Cada chamada a `.from(tabela)` consome a próxima resposta da fila
// `responses`, na ordem em que o código sob teste as faz (sequencial,
// por causa do `await`). `calls` registra table/op/payload de
// insert/update para asserções sobre o que foi gravado.

type MockResponse = { data?: any; error?: any; count?: number }

function chainFor(result: MockResponse) {
  const chain: any = {}
  const passthrough = ['select', 'eq', 'in', 'order', 'limit', 'gte']
  passthrough.forEach((m) => {
    chain[m] = () => chain
  })
  chain.maybeSingle = () => Promise.resolve(result)
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function createMockSupabase(responses: MockResponse[]) {
  let i = 0
  const calls: { table: string; op: 'insert' | 'update'; payload: any }[] = []

  const sb: any = {
    from: (table: string) => {
      const chain: any = {}
      const passthrough = ['select', 'eq', 'in', 'order', 'limit', 'gte']
      passthrough.forEach((m) => {
        chain[m] = () => chain
      })
      chain.maybeSingle = () => Promise.resolve(responses[i++] ?? { data: null, error: null })
      chain.then = (resolve: any, reject: any) =>
        Promise.resolve(responses[i++] ?? { data: null, error: null }).then(resolve, reject)
      chain.insert = (payload: any) => {
        calls.push({ table, op: 'insert', payload })
        return chainFor(responses[i++] ?? { data: null, error: null })
      }
      chain.update = (payload: any) => {
        calls.push({ table, op: 'update', payload })
        return chainFor(responses[i++] ?? { data: null, error: null })
      }
      return chain
    },
  }

  return { sb, calls }
}

// ─── hashValor ──────────────────────────────────────────────────────────────

describe('hashValor()', () => {
  it('gera hash sha256 determinístico (mesmo input → mesmo hash)', () => {
    expect(hashValor('123456')).toBe(hashValor('123456'))
  })

  it('gera hashes diferentes para inputs diferentes', () => {
    expect(hashValor('123456')).not.toBe(hashValor('654321'))
  })

  it('nunca retorna o valor original em texto puro', () => {
    expect(hashValor('123456')).not.toBe('123456')
    expect(hashValor('123456')).toMatch(/^[0-9a-f]{64}$/) // sha256 hex = 64 chars
  })
})

// ─── criarCodigoOtp ─────────────────────────────────────────────────────────

describe('criarCodigoOtp()', () => {
  it('retorna um código de 6 dígitos numéricos', async () => {
    const { sb } = createMockSupabase([{ data: null, error: null }])
    const codigo = await criarCodigoOtp(sb, 'user-1', 'self_service')
    expect(codigo).toMatch(/^\d{6}$/)
  })

  it('grava o hash do código (não o código em texto puro) com tipo e expiração', async () => {
    const { sb, calls } = createMockSupabase([{ data: null, error: null }])
    const codigo = await criarCodigoOtp(sb, 'user-1', 'reset_admin', 'admin-1')

    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('password_reset_tokens')
    expect(calls[0].op).toBe('insert')
    expect(calls[0].payload.usuario_id).toBe('user-1')
    expect(calls[0].payload.tipo).toBe('reset_admin')
    expect(calls[0].payload.criado_por).toBe('admin-1')
    expect(calls[0].payload.codigo_hash).toBe(hashValor(codigo))
    expect(calls[0].payload.codigo_hash).not.toBe(codigo)
    // expira_em ~15 min no futuro
    const expiraEm = new Date(calls[0].payload.expira_em).getTime()
    expect(expiraEm).toBeGreaterThan(Date.now() + 14 * 60_000)
    expect(expiraEm).toBeLessThan(Date.now() + 16 * 60_000)
  })

  it('usa criado_por null quando não informado', async () => {
    const { sb, calls } = createMockSupabase([{ data: null, error: null }])
    await criarCodigoOtp(sb, 'user-1', 'primeiro_acesso')
    expect(calls[0].payload.criado_por).toBeNull()
  })
})

// ─── contarSolicitacoesRecentes ─────────────────────────────────────────────

describe('contarSolicitacoesRecentes()', () => {
  it('retorna a contagem vinda da query', async () => {
    const { sb } = createMockSupabase([{ count: 3 }])
    const total = await contarSolicitacoesRecentes(sb, 'user-1', 'self_service')
    expect(total).toBe(3)
  })

  it('retorna 0 quando count vem null', async () => {
    const { sb } = createMockSupabase([{ count: null as any }])
    const total = await contarSolicitacoesRecentes(sb, 'user-1', 'self_service')
    expect(total).toBe(0)
  })
})

// ─── validarCodigoOtp ────────────────────────────────────────────────────────

describe('validarCodigoOtp()', () => {
  it('retorna erro quando não há token pendente', async () => {
    const { sb } = createMockSupabase([{ data: [] }])
    const r = await validarCodigoOtp(sb, 'user-1', '123456')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/inválido ou expirado/i)
  })

  it('retorna erro quando o token está expirado', async () => {
    const { sb } = createMockSupabase([
      {
        data: [
          {
            id: 'tok-1',
            codigo_hash: hashValor('123456'),
            tentativas: 0,
            usado: false,
            expira_em: new Date(Date.now() - 60_000).toISOString(), // 1 min atrás
            tipo: 'self_service',
          },
        ],
      },
    ])
    const r = await validarCodigoOtp(sb, 'user-1', '123456')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/expirado/i)
  })

  it('retorna erro quando o número máximo de tentativas foi excedido', async () => {
    const { sb } = createMockSupabase([
      {
        data: [
          {
            id: 'tok-1',
            codigo_hash: hashValor('123456'),
            tentativas: 5, // MAX_TENTATIVAS
            usado: false,
            expira_em: new Date(Date.now() + 5 * 60_000).toISOString(),
            tipo: 'self_service',
          },
        ],
      },
    ])
    const r = await validarCodigoOtp(sb, 'user-1', '123456')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/máximo de tentativas/i)
  })

  it('código incorreto: incrementa tentativas e retorna erro', async () => {
    const { sb, calls } = createMockSupabase([
      {
        data: [
          {
            id: 'tok-1',
            codigo_hash: hashValor('123456'),
            tentativas: 2,
            usado: false,
            expira_em: new Date(Date.now() + 5 * 60_000).toISOString(),
            tipo: 'self_service',
          },
        ],
      },
      { data: null, error: null }, // resultado do update tentativas
    ])
    const r = await validarCodigoOtp(sb, 'user-1', '999999')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/incorreto/i)

    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('update')
    expect(calls[0].payload).toEqual({ tentativas: 3 })
  })

  it('código correto: marca usado=true e cria token de sessão (sessaoToken)', async () => {
    const { sb, calls } = createMockSupabase([
      {
        data: [
          {
            id: 'tok-1',
            codigo_hash: hashValor('123456'),
            tentativas: 0,
            usado: false,
            expira_em: new Date(Date.now() + 5 * 60_000).toISOString(),
            tipo: 'self_service',
          },
        ],
      },
      { data: null, error: null }, // resultado do update usado=true
      { data: null, error: null }, // resultado do insert sessao_senha
    ])
    const r = await validarCodigoOtp(sb, 'user-1', '123456')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.sessaoToken).toMatch(/^[0-9a-f]{48}$/) // randomBytes(24).toString('hex')
    }

    expect(calls).toHaveLength(2)
    // 1) marca o token original como usado
    expect(calls[0].op).toBe('update')
    expect(calls[0].payload).toEqual({ usado: true })
    // 2) cria token de sessão com hash do sessaoToken (nunca em texto puro)
    expect(calls[1].op).toBe('insert')
    expect(calls[1].payload.usuario_id).toBe('user-1')
    expect(calls[1].payload.tipo).toBe('sessao_senha')
    if (r.ok) {
      expect(calls[1].payload.codigo_hash).toBe(hashValor(r.sessaoToken))
    }
  })
})

// ─── validarSessaoSenha ──────────────────────────────────────────────────────

describe('validarSessaoSenha()', () => {
  it('retorna false quando não há token de sessão', async () => {
    const { sb } = createMockSupabase([{ data: [] }])
    const ok = await validarSessaoSenha(sb, 'user-1', 'abc123')
    expect(ok).toBe(false)
  })

  it('retorna false quando o token de sessão está expirado', async () => {
    const { sb } = createMockSupabase([
      {
        data: [
          {
            id: 'sess-1',
            codigo_hash: hashValor('abc123'),
            usado: false,
            expira_em: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      },
    ])
    const ok = await validarSessaoSenha(sb, 'user-1', 'abc123')
    expect(ok).toBe(false)
  })

  it('retorna false quando o token de sessão não confere (hash diferente)', async () => {
    const { sb } = createMockSupabase([
      {
        data: [
          {
            id: 'sess-1',
            codigo_hash: hashValor('abc123'),
            usado: false,
            expira_em: new Date(Date.now() + 5 * 60_000).toISOString(),
          },
        ],
      },
    ])
    const ok = await validarSessaoSenha(sb, 'user-1', 'token-errado')
    expect(ok).toBe(false)
  })

  it('token correto: retorna true e marca usado=true (uso único)', async () => {
    const { sb, calls } = createMockSupabase([
      {
        data: [
          {
            id: 'sess-1',
            codigo_hash: hashValor('abc123'),
            usado: false,
            expira_em: new Date(Date.now() + 5 * 60_000).toISOString(),
          },
        ],
      },
      { data: null, error: null }, // resultado do update usado=true
    ])
    const ok = await validarSessaoSenha(sb, 'user-1', 'abc123')
    expect(ok).toBe(true)

    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe('update')
    expect(calls[0].payload).toEqual({ usado: true })
  })
})

// ─── enviarCodigoUsuario ─────────────────────────────────────────────────────

describe('enviarCodigoUsuario()', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('envia POST para /whatsapp/enviar-codigo com numero, codigo, nome, contexto e empresa_id', async () => {
    const { sb } = createMockSupabase([{ data: { empresa_id: 'empresa-1' } }])
    const usuario = { id: 'user-1', nome: 'João', telefone: '11999999999', email: 'joao@empresa.com' }

    await enviarCodigoUsuario(sb, usuario, '123456', 'self_service')

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = (global.fetch as any).mock.calls[0]
    expect(url).toMatch(/\/whatsapp\/enviar-codigo$/)
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.numero).toBe('11999999999')
    expect(body.codigo).toBe('123456')
    expect(body.nome).toBe('João')
    expect(body.contexto).toBe('self_service')
    expect(body.empresa_id).toBe('empresa-1')
    expect(body.email).toBe('joao@empresa.com')
  })

  it('omite o e-mail quando for o e-mail interno @checkflow.local', async () => {
    const { sb } = createMockSupabase([{ data: { empresa_id: 'empresa-1' } }])
    const usuario = { id: 'user-2', nome: 'Maria', telefone: '11988888888', email: 'user2@checkflow.local' }

    await enviarCodigoUsuario(sb, usuario, '654321', 'primeiro_acesso')

    const [, options] = (global.fetch as any).mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.email).toBeUndefined()
  })

  it('omite numero e empresa_id quando não disponíveis', async () => {
    const { sb } = createMockSupabase([{ data: null }])
    const usuario = { id: 'user-3', nome: 'Sem Telefone', telefone: null, email: null }

    await enviarCodigoUsuario(sb, usuario, '111111', 'reset_admin')

    const [, options] = (global.fetch as any).mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.numero).toBeUndefined()
    expect(body.empresa_id).toBeUndefined()
    expect(body.email).toBeUndefined()
  })

  it('não lança erro quando o fetch falha (rede indisponível)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as any
    const { sb } = createMockSupabase([{ data: { empresa_id: 'empresa-1' } }])
    const usuario = { id: 'user-4', nome: 'Teste', telefone: '11977777777', email: 'teste@empresa.com' }

    await expect(enviarCodigoUsuario(sb, usuario, '222222', 'self_service')).resolves.toBeUndefined()
  })
})
