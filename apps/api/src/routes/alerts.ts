import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

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

// In-memory store for recent alerts (in production, use database)
const recentAlerts: Map<string, AlertNotification> = new Map()

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

    // Store alert notification
    const notification: AlertNotification = {
      id: alert.id,
      alert_type: alert.type,
      severity: alert.severity,
      message: `${alert.type.replace(/_/g, ' ')} alert: ${alert.value} (threshold: ${alert.threshold})`,
      value: alert.value,
      threshold: alert.threshold,
      service: alert.service,
      created_at: new Date().toISOString(),
      acked: false
    }

    recentAlerts.set(alert.id, notification)

    // TODO: In production, send notification via:
    // 1. Email (via Resend API)
    // 2. Slack webhook
    // 3. Store in database for audit trail

    return reply.status(200).send({ received: true, id: alert.id })
  })

  // Get recent alerts (for dashboard)
  app.get<{ Reply: AlertNotification[] }>('/alerts', async (request: FastifyRequest, reply: FastifyReply) => {
    const alerts = Array.from(recentAlerts.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100) // Last 100 alerts

    return reply.send(alerts)
  })

  // Acknowledge alert
  app.patch<{ Params: { id: string } }>('/alerts/:id/ack', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const alert = recentAlerts.get(id)

    if (!alert) {
      return reply.status(404).send({ error: 'Alert not found' })
    }

    alert.acked = true
    alert.acked_at = new Date().toISOString()

    return reply.send(alert)
  })

  // Clear old alerts (older than 24 hours)
  setInterval(() => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000

    for (const [id, alert] of recentAlerts) {
      if (now - new Date(alert.created_at).getTime() > oneDayMs) {
        recentAlerts.delete(id)
      }
    }
  }, 60 * 60 * 1000) // Check every hour
}
