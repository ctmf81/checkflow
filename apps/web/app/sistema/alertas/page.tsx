'use client'

import { useEffect, useState } from 'react'

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

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch('/api/alerts')
        if (!res.ok) throw new Error(`Failed to fetch alerts: ${res.status}`)
        const data = await res.json()
        setAlerts(data)
        setError(null)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchAlerts()
    const interval = setInterval(fetchAlerts, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const handleAck = async (id: string) => {
    try {
      const res = await fetch(`/api/alerts/${id}/ack`, {
        method: 'PATCH'
      })
      if (!res.ok) throw new Error('Failed to acknowledge alert')

      // Update local state
      setAlerts(alerts.map(a => a.id === id ? { ...a, acked: true, acked_at: new Date().toISOString() } : a))
    } catch (err) {
      console.error('Error acknowledging alert:', err)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200 text-red-900'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900'
      default:
        return 'bg-blue-50 border-blue-200 text-blue-900'
    }
  }

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      warning: 'bg-yellow-100 text-yellow-800',
      info: 'bg-blue-100 text-blue-800'
    }
    return colors[severity as keyof typeof colors] || colors.info
  }

  const getTypeIcon = (type: string) => {
    const icons = {
      cpu: '🔥',
      memory: '💾',
      error_rate: '⚠️',
      latency: '⏱️'
    }
    return icons[type as keyof typeof icons] || '🔔'
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-4">System Alerts</h1>
        <div className="text-gray-600">Loading alerts...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">System Alerts</h1>
        <div className="text-sm text-gray-600">
          {alerts.length} alerts • {alerts.filter(a => !a.acked).length} unacknowledged
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8 text-red-900">
          <div className="font-semibold">Error loading alerts</div>
          <div className="text-sm">{error}</div>
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center text-green-900">
          <div className="text-2xl mb-2">✓</div>
          <div className="font-semibold">All systems nominal</div>
          <div className="text-sm">No active alerts</div>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map(alert => (
            <div key={alert.id} className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getTypeIcon(alert.alert_type)}</span>
                  <div>
                    <div className="font-semibold">{alert.alert_type.replace(/_/g, ' ').toUpperCase()}</div>
                    <div className="text-sm opacity-75">{alert.service}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityBadge(alert.severity)}`}>
                    {alert.severity.toUpperCase()}
                  </span>
                  {!alert.acked && (
                    <button
                      onClick={() => handleAck(alert.id)}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-xs font-semibold hover:bg-blue-600 transition"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.acked && (
                    <span className="text-xs text-opacity-75">✓ Acknowledged</span>
                  )}
                </div>
              </div>

              <div className="text-sm mb-2">{alert.message}</div>

              <div className="grid grid-cols-3 gap-4 text-sm opacity-75">
                <div>
                  <div className="text-xs opacity-75">Current Value</div>
                  <div className="font-mono font-semibold">{alert.value}</div>
                </div>
                <div>
                  <div className="text-xs opacity-75">Threshold</div>
                  <div className="font-mono font-semibold">{alert.threshold}</div>
                </div>
                <div>
                  <div className="text-xs opacity-75">Triggered</div>
                  <div className="text-xs">{new Date(alert.created_at).toLocaleString()}</div>
                </div>
              </div>

              {alert.acked_at && (
                <div className="text-xs opacity-50 mt-2 pt-2 border-t">
                  Acknowledged at {new Date(alert.acked_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-900">
        <div className="text-sm">
          <div className="font-semibold mb-2">About Alerts</div>
          <ul className="text-xs space-y-1 list-disc list-inside">
            <li>Alerts are triggered by Railway monitoring metrics</li>
            <li>CPU threshold: {'>'}80% for 2 minutes</li>
            <li>Error rate threshold: {'>'}1% for 5 minutes</li>
            <li>Acknowledge alerts to mark as reviewed</li>
            <li>Older than 24 hours are automatically cleared</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
