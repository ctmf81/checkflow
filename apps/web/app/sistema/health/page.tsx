'use client'

import { useEffect, useState } from 'react'

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  checks: {
    database: { status: boolean; latency_ms: number; error?: string }
    rls: { status: boolean; latency_ms: number; error?: string }
    storage: { status: boolean; quota_used_gb: number; quota_limit_gb: number; error?: string }
  }
  uptime_seconds: number
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [history, setHistory] = useState<Array<{ time: string; db_ms: number; rls_ms: number }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('/api/health')
        const data = await res.json()
        setHealth(data)
        setError(null)

        // Keep last 60 measurements
        setHistory(prev => [
          ...prev.slice(-59),
          {
            time: new Date(data.timestamp).toLocaleTimeString(),
            db_ms: data.checks.database.latency_ms,
            rls_ms: data.checks.rls.latency_ms
          }
        ])
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 10000) // Poll every 10s
    return () => clearInterval(interval)
  }, [])

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${days}d ${hours}h ${mins}m`
  }

  const StatusIcon = ({ status }: { status: boolean }) =>
    status ? <span className="text-green-600 font-bold">✓</span> : <span className="text-red-600 font-bold">✗</span>

  const StatusBadge = ({ status }: { status: 'healthy' | 'degraded' | 'unhealthy' }) => {
    const colors = {
      healthy: 'bg-green-100 text-green-800',
      degraded: 'bg-yellow-100 text-yellow-800',
      unhealthy: 'bg-red-100 text-red-800'
    }
    return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colors[status]}`}>{status.toUpperCase()}</span>
  }

  if (loading) return <div className="p-8">Loading health data...</div>

  if (!health) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">System Health</h1>
        <div className="bg-red-100 p-4 rounded text-red-800">{error || 'Unable to fetch health data'}</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">System Health Monitor</h1>
        <StatusBadge status={health.status} />
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-gray-600 text-sm">Uptime</div>
          <div className="text-2xl font-bold">{formatUptime(health.uptime_seconds)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-gray-600 text-sm">Last Check</div>
          <div className="text-sm font-mono">{new Date(health.timestamp).toLocaleTimeString()}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-gray-600 text-sm">Database</div>
          <div className="text-2xl font-bold">{health.checks.database.latency_ms}ms</div>
          <div className="text-xs text-gray-500">
            {health.checks.database.status ? 'Connected' : 'Error: ' + health.checks.database.error}
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-gray-600 text-sm">RLS</div>
          <div className="text-2xl font-bold">{health.checks.rls.latency_ms}ms</div>
          <div className="text-xs text-gray-500">{health.checks.rls.status ? 'Active' : 'Error: ' + health.checks.rls.error}</div>
        </div>
      </div>

      {/* Detailed Status */}
      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-4">Component Status</h2>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-gray-50 rounded">
            <div>
              <div className="font-semibold">Database Connectivity</div>
              <div className="text-sm text-gray-600">Latency: {health.checks.database.latency_ms}ms</div>
            </div>
            <StatusIcon status={health.checks.database.status} />
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded">
            <div>
              <div className="font-semibold">RLS Policy Validation</div>
              <div className="text-sm text-gray-600">Latency: {health.checks.rls.latency_ms}ms</div>
            </div>
            <StatusIcon status={health.checks.rls.status} />
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-50 rounded">
            <div>
              <div className="font-semibold">Storage Access</div>
              <div className="text-sm text-gray-600">
                {health.checks.storage.quota_used_gb.toFixed(2)} / {health.checks.storage.quota_limit_gb} GB
              </div>
            </div>
            <StatusIcon status={health.checks.storage.status} />
          </div>
        </div>
      </div>

      {/* Latency Trend Table */}
      {history.length > 1 && (
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Latency Trend (Last {history.length} checks)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Database (ms)</th>
                  <th className="px-4 py-2">RLS (ms)</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(-10).reverse().map((entry, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                    <td className="px-4 py-2 text-xs">{entry.time}</td>
                    <td className="px-4 py-2">
                      <span className={entry.db_ms > 1000 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                        {entry.db_ms}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={entry.rls_ms > 1000 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                        {entry.rls_ms}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
