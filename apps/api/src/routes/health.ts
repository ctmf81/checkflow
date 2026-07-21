import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: {
    database: { status: boolean; latency_ms: number; error?: string }
    rls: { status: boolean; latency_ms: number; error?: string }
    storage: { status: boolean; quota_used_gb: number; quota_limit_gb: number; error?: string }
  }
  // Ambiente do gateway de pagamento (diagnóstico — sem segredos). Se aparecer
  // 'sandbox' em produção, o serviço API não pegou ASAAS_ENV=production (redeploy).
  asaas_env: 'production' | 'sandbox'
  asaas_env_raw?: string
  asaas_key_prod_set?: boolean
  uptime_seconds: number
}

const startTime = Date.now()

export async function healthRoutes(app: FastifyInstance) {
  app.get<{ Reply: HealthStatus }>('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: false, latency_ms: 0 },
        rls: { status: false, latency_ms: 0 },
        storage: { status: false, quota_used_gb: 0, quota_limit_gb: 100 }
      },
      asaas_env: (process.env.ASAAS_ENV ?? '').trim().toLowerCase() === 'production' ? 'production' : 'sandbox',
      // DEBUG temporário: o valor CRU que o processo lê (ASAAS_ENV não é segredo).
      // Se vier '(unset)', a variável não está chegando no serviço API.
      asaas_env_raw: JSON.stringify(process.env.ASAAS_ENV ?? '(unset)'),
      asaas_key_prod_set: !!process.env.ASAAS_API_KEY_PROD,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
    }

    try {
      // Database connectivity check
      const dbStart = Date.now()
      const { error: dbError } = await supabase.from('empresas').select('id').limit(1)
      const dbLatency = Date.now() - dbStart
      health.checks.database = { status: !dbError, latency_ms: dbLatency, error: dbError?.message }
      if (dbLatency > 2000) health.status = 'degraded'
      if (dbError) health.status = 'degraded'
    } catch (err) {
      health.checks.database.error = String(err)
      health.status = 'degraded'
    }

    try {
      // RLS validation — try to query with row-level security
      const rlsStart = Date.now()
      // Select from a table that has RLS enabled (usuario_subgrupo tem chave
      // composta usuario_id+subgrupo_id — não existe coluna "id").
      const { data, error: rlsError } = await supabase
        .from('usuario_subgrupo')
        .select('usuario_id')
        .limit(1)
      const rlsLatency = Date.now() - rlsStart
      health.checks.rls = {
        status: !rlsError && Array.isArray(data),
        latency_ms: rlsLatency,
        error: rlsError?.message
      }
      if (rlsError) health.status = 'degraded'
    } catch (err) {
      health.checks.rls.error = String(err)
      health.status = 'degraded'
    }

    try {
      // Storage quota check via Supabase API
      const storageStart = Date.now()
      const { data, error: storageError } = await supabase.storage.listBuckets()
      const storageLatency = Date.now() - storageStart

      if (!storageError && data) {
        const execucoesBucket = data.find(b => b.name === 'execucoes')
        if (execucoesBucket) {
          // Estimate quota from bucket size (Railway env or hardcoded 100 GB default)
          const quotaLimit = parseInt(process.env.STORAGE_QUOTA_GB || '100', 10)
          // NOTE: Supabase doesn't expose current usage via JS SDK, would need REST API
          // For now, set 0 and mark as OK if buckets are accessible
          health.checks.storage = {
            status: true,
            quota_used_gb: 0,
            quota_limit_gb: quotaLimit,
            error: undefined
          }
        }
      }
      if (storageError) {
        health.checks.storage.status = false
        health.checks.storage.error = storageError.message
        health.status = 'degraded'
      }
    } catch (err) {
      health.checks.storage.error = String(err)
      health.status = 'degraded'
    }

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 500
    return reply.status(statusCode).send(health)
  })
}

