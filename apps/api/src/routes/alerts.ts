import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'

interface RailwayAlert {
  id: string
  type: 'cpu' | 'memory' | 'error_rate' | 'latency'
  severity: 'warning' | 'critical'
  value: number
  threshold: number
  service: string
  timestamp: string
}

interface AlertNotification {
  id: string
  alert_type: string
  severity: string
  message: string
  value: number
  threshold: number
  service: string
  created_at: string
  acked: boolean
  acked_at?: string
}

const JANELA_MS = 24 * 60 * 60 * 1000 // alertas com mais de 24h somem do painel

// Registra um alerta no painel (/sistema/alertas). Usado por healthchecks
// internos (ex: monitor do WhatsApp) e pelo webhook do Railway.
// Persiste no banco (tabela `sistema_alertas`) para ser visível por TODAS as
// réplicas da API — antes vivia num Map em memória (só a instância única via).
export async function adicionarAlerta(n: {
  id: string; alert_type: string; severity: 'warning' | 'critical'; message: string; service: string
}): Promise<void> {
  await supabase.from('sistema_alertas').upsert({
    id: n.id, alert_type: n.alert_type, severity: n.severity, message: n.message,
    value: 0, threshold: 0, service: n.service, acked: false,
  })
}

export async function alertsRoutes(app: FastifyInstance) {
  // Receive webhook from Railway
  app.post<{ Body: RailwayAlert }>('/alerts/railway', async (request: FastifyRequest, reply: FastifyReply) => {
    const alert = request.body as RailwayAlert

    console.log('[RAILWAY_ALERT]', {
      type: alert.type,
      severity: alert.severity,
      value: alert.value,
      threshold: alert.threshold,
      service: alert.service,
      timestamp: alert.timestamp
    })

    await supabase.from('sistema_alertas').upsert({
      id: alert.id,
      alert_type: alert.type,
      severity: alert.severity,
      message: `${alert.type.replace(/_/g, ' ')} alert: ${alert.value} (threshold: ${alert.threshold})`,
      value: alert.value,
      threshold: alert.threshold,
      service: alert.service,
      acked: false,
    })

    // TODO: In production, send notification via:
    // 1. Email (via Resend API)
    // 2. Slack webhook

    return reply.status(200).send({ received: true, id: alert.id })
  })

  // Get recent alerts (for dashboard) — últimos 100 das últimas 24h.
  app.get<{ Reply: AlertNotification[] }>('/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    const desde = new Date(Date.now() - JANELA_MS).toISOString()
    const { data, error } = await supabase
      .from('sistema_alertas')
      .select('*')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return reply.status(500).send([] as any)
    return reply.send((data ?? []) as AlertNotification[])
  })

  // Acknowledge alert
  app.patch<{ Params: { id: string } }>('/alerts/:id/ack', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await supabase
      .from('sistema_alertas')
      .update({ acked: true, acked_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) return reply.status(500).send({ error: error.message })
    if (!data) return reply.status(404).send({ error: 'Alert not found' })

    return reply.send(data)
  })

  // Limpeza de alertas antigos (>24h). Best-effort a cada leitura do painel não
  // é ideal; mantemos um GC leve na inicialização de cada réplica. A tabela é
  // pequena e a JANELA na leitura já esconde os antigos; isto só evita crescer.
  supabase.from('sistema_alertas')
    .delete()
    .lt('created_at', new Date(Date.now() - JANELA_MS).toISOString())
    .then(() => {}, () => {})
}
