// ─── Cliente HTTP do gateway de pagamento Asaas ─────────────────────────────
// Credenciais por env (nunca commitar): ASAAS_API_KEY + ASAAS_ENV (sandbox|production).
// Sandbox: https://api-sandbox.asaas.com/v3 · Produção: https://api.asaas.com/v3
// Autenticação via header `access_token`.

const BASE_URL = process.env.ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://api-sandbox.asaas.com/v3'

function apiKey(): string {
  const k = process.env.ASAAS_API_KEY
  if (!k) throw new Error('ASAAS_API_KEY não configurada')
  return k
}

async function asaasFetch<T = any>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: apiKey(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const texto = await res.text()
  let json: any = null
  try { json = texto ? JSON.parse(texto) : null } catch { /* resposta não-JSON */ }

  if (!res.ok) {
    const msg = json?.errors?.[0]?.description ?? json?.message ?? `Asaas HTTP ${res.status}`
    throw new Error(msg)
  }
  return json as T
}

// ─── Tipos mínimos ──────────────────────────────────────────────────────────

export type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'
export type Cycle = 'MONTHLY' | 'YEARLY'

export interface SplitItem {
  walletId: string
  percentualValue?: number
  fixedValue?: number
}

export interface AsaasCustomer { id: string; name: string; cpfCnpj: string; email?: string }
export interface AsaasSubscription { id: string; status: string; value: number; cycle: string }
export interface AsaasPayment {
  id: string; status: string; value: number; billingType: string
  dueDate: string; invoiceUrl?: string; subscription?: string
}

// ─── Operações ──────────────────────────────────────────────────────────────

/** Cria (ou retorna) um cliente no Asaas. cpfCnpj só dígitos. */
export function asaasCriarCliente(input: { name: string; cpfCnpj: string; email?: string; phone?: string; externalReference?: string }) {
  return asaasFetch<AsaasCustomer>('/customers', 'POST', input)
}

/** Assinatura recorrente. nextDueDate no formato YYYY-MM-DD. */
export function asaasCriarAssinatura(input: {
  customer: string
  billingType: BillingType
  value: number
  nextDueDate: string
  cycle: Cycle
  description?: string
  externalReference?: string
  split?: SplitItem[]
}) {
  return asaasFetch<AsaasSubscription>('/subscriptions', 'POST', input)
}

/** Cancela uma assinatura recorrente. */
export function asaasCancelarAssinatura(subscriptionId: string) {
  return asaasFetch<{ deleted: boolean; id: string }>(`/subscriptions/${subscriptionId}`, 'DELETE')
}

/** Cobrança avulsa (ex: compra de pacote). dueDate YYYY-MM-DD. */
export function asaasCriarCobranca(input: {
  customer: string
  billingType: BillingType
  value: number
  dueDate: string
  description?: string
  externalReference?: string
  split?: SplitItem[]
}) {
  return asaasFetch<AsaasPayment>('/payments', 'POST', input)
}

/** Consulta uma cobrança pelo id. */
export function asaasObterCobranca(paymentId: string) {
  return asaasFetch<AsaasPayment>(`/payments/${paymentId}`, 'GET')
}
