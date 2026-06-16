import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Testa o cliente HTTP do Asaas: seleção de URL/chave por ambiente, fallback,
// formato da requisição, parsing de erro e passagem do split.
// Como BASE_URL/IS_PROD são avaliados na carga do módulo, cada caso de ambiente
// usa vi.resetModules() + import dinâmico.

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

async function importAsaas() {
  vi.resetModules()
  return await import('./asaas')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('asaas — seleção de ambiente e chave', () => {
  beforeEach(() => {
    vi.stubEnv('ASAAS_API_KEY', '')
    vi.stubEnv('ASAAS_API_KEY_SANDBOX', 'key_sandbox')
    vi.stubEnv('ASAAS_API_KEY_PROD', 'key_prod')
  })

  it('usa a URL e a chave de sandbox quando ASAAS_ENV != production', async () => {
    vi.stubEnv('ASAAS_ENV', 'sandbox')
    const fetchFn = mockFetchOnce(200, { id: 'cus_1', name: 'X', cpfCnpj: '1' })
    const { asaasCriarCliente } = await importAsaas()

    await asaasCriarCliente({ name: 'X', cpfCnpj: '123' })

    const [url, opts] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api-sandbox.asaas.com/v3/customers')
    expect((opts as any).headers.access_token).toBe('key_sandbox')
  })

  it('usa a URL e a chave de produção quando ASAAS_ENV = production', async () => {
    vi.stubEnv('ASAAS_ENV', 'production')
    const fetchFn = mockFetchOnce(200, { id: 'cus_1' })
    const { asaasCriarCliente } = await importAsaas()

    await asaasCriarCliente({ name: 'X', cpfCnpj: '123' })

    const [url, opts] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.asaas.com/v3/customers')
    expect((opts as any).headers.access_token).toBe('key_prod')
  })

  it('faz fallback para ASAAS_API_KEY quando a chave específica não existe', async () => {
    vi.stubEnv('ASAAS_ENV', 'sandbox')
    vi.stubEnv('ASAAS_API_KEY_SANDBOX', '')
    vi.stubEnv('ASAAS_API_KEY', 'key_legado')
    const fetchFn = mockFetchOnce(200, { id: 'cus_1' })
    const { asaasCriarCliente } = await importAsaas()

    await asaasCriarCliente({ name: 'X', cpfCnpj: '123' })

    expect((fetchFn.mock.calls[0][1] as any).headers.access_token).toBe('key_legado')
  })

  it('lança erro quando nenhuma chave está configurada', async () => {
    vi.stubEnv('ASAAS_ENV', 'sandbox')
    vi.stubEnv('ASAAS_API_KEY_SANDBOX', '')
    vi.stubEnv('ASAAS_API_KEY', '')
    mockFetchOnce(200, {})
    const { asaasCriarCliente } = await importAsaas()

    await expect(asaasCriarCliente({ name: 'X', cpfCnpj: '1' })).rejects.toThrow(/ASAAS_API_KEY_SANDBOX/)
  })
})

describe('asaas — requisições e erros', () => {
  beforeEach(() => {
    vi.stubEnv('ASAAS_ENV', 'sandbox')
    vi.stubEnv('ASAAS_API_KEY_SANDBOX', 'key_sandbox')
  })

  it('envia o corpo como JSON com Content-Type correto', async () => {
    const fetchFn = mockFetchOnce(200, { id: 'sub_1', status: 'ACTIVE', value: 5, cycle: 'MONTHLY' })
    const { asaasCriarAssinatura } = await importAsaas()

    await asaasCriarAssinatura({ customer: 'cus_1', billingType: 'PIX', value: 5, nextDueDate: '2026-06-20', cycle: 'MONTHLY' })

    const opts = fetchFn.mock.calls[0][1] as any
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(opts.body)).toMatchObject({ customer: 'cus_1', billingType: 'PIX', value: 5, cycle: 'MONTHLY' })
  })

  it('extrai a mensagem de erro do Asaas (errors[].description)', async () => {
    mockFetchOnce(400, { errors: [{ description: 'cpfCnpj inválido' }] })
    const { asaasCriarCliente } = await importAsaas()

    await expect(asaasCriarCliente({ name: 'X', cpfCnpj: 'abc' })).rejects.toThrow('cpfCnpj inválido')
  })

  it('cai para "Asaas HTTP <status>" quando não há corpo de erro', async () => {
    mockFetchOnce(500, '')
    const { asaasObterCobranca } = await importAsaas()

    await expect(asaasObterCobranca('pay_1')).rejects.toThrow('Asaas HTTP 500')
  })

  it('repassa o split na criação da cobrança', async () => {
    const fetchFn = mockFetchOnce(200, { id: 'pay_1', status: 'PENDING', value: 10, billingType: 'PIX', dueDate: '2026-06-20' })
    const { asaasCriarCobranca } = await importAsaas()

    await asaasCriarCobranca({
      customer: 'cus_1', billingType: 'PIX', value: 10, dueDate: '2026-06-20',
      split: [{ walletId: 'wallet_abc', percentualValue: 20 }],
    })

    const body = JSON.parse((fetchFn.mock.calls[0][1] as any).body)
    expect(body.split).toEqual([{ walletId: 'wallet_abc', percentualValue: 20 }])
  })

  it('DELETE de assinatura usa o método e caminho corretos', async () => {
    const fetchFn = mockFetchOnce(200, { deleted: true, id: 'sub_1' })
    const { asaasCancelarAssinatura } = await importAsaas()

    await asaasCancelarAssinatura('sub_1')

    const [url, opts] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api-sandbox.asaas.com/v3/subscriptions/sub_1')
    expect((opts as any).method).toBe('DELETE')
  })
})
