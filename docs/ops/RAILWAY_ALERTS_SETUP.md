# Railway Alerts Setup — Checklist

## Overview
Configure Railway to monitor CPU, latency (p95), and error rate. Notifications go to `cvconsultoriaeservicos@gmail.com` via email + internal webhook.

---

## Part 1: Railway Dashboard Configuration

### Step 1: Open Railway Project Metrics
1. Go to [railway.app](https://railway.app)
2. Select **CheckFlow** project
3. Click **Web** service → **Metrics** tab
4. You'll see real-time CPU, Memory, Network graphs

### Step 2: Create CPU Alert (80% threshold)
1. In Metrics tab, look for **Alerts** section (or go to Project Settings → Alerts)
2. Click **+ New Alert**
3. Set alert rule:
   - **Name:** "High CPU Usage"
   - **Condition:** CPU > 80%
   - **Duration:** 2 minutes (avoid flapping on spikes)
   - **Notification:** Webhook (see Part 2 below)
4. **Enable alert**

### Step 3: Create Latency Alert (p95 > 2s)
⚠️ **Note:** Railway shows average latency, not percentiles. Use internal health endpoint instead (see Part 2).
1. Alternative: Configure via Railway's **Observability** → **Custom Metrics** if available
2. Or rely on `/health` endpoint polling (Task #2 ✅)

### Step 4: Create Error Rate Alert (> 1%)
1. Click **+ New Alert**
2. Set alert rule:
   - **Name:** "High Error Rate"
   - **Condition:** Error Rate > 1%
   - **Duration:** 5 minutes
   - **Notification:** Webhook
3. **Enable alert**

### Step 5: Email Notification Configuration
1. Go to **Project Settings** → **Integrations**
2. Look for **Email** or **Notification** settings
3. Add email: `cvconsultoriaeservicos@gmail.com`
4. Test with "Send Test Alert"

---

## Part 2: Webhook Handler (Receiving Alerts)

Railway can POST alerts to a webhook endpoint. We'll add an endpoint to handle them:

### Endpoint: `POST /api/alerts/railway`

```typescript
// apps/api/src/routes/alerts.ts
import { FastifyInstance, FastifyRequest } from 'fastify'

interface RailwayAlert {
  id: string
  type: 'cpu' | 'memory' | 'error_rate' | 'latency'
  severity: 'warning' | 'critical'
  value: number
  threshold: number
  service: string
  timestamp: string
}

export async function alertsRoutes(app: FastifyInstance) {
  app.post<{ Body: RailwayAlert }>('/alerts/railway', async (request: FastifyRequest) => {
    const alert = request.body

    // Log alert
    console.log('[RAILWAY_ALERT]', {
      type: alert.type,
      severity: alert.severity,
      value: alert.value,
      threshold: alert.threshold,
      timestamp: alert.timestamp
    })

    // Example: Send internal notification or log to observability platform
    // In production: Send to Slack, Grafana, or your monitoring stack

    return { received: true, id: alert.id }
  })
}
```

Then register in `apps/api/src/server.ts`:
```typescript
import { alertsRoutes } from './routes/alerts'

app.register(alertsRoutes)
```

### Webhook URL in Railway:
```
https://api.checkflow.digital/api/alerts/railway
```
(Replace with your actual production domain)

---

## Part 3: Monitoring Thresholds (Recommended)

| Metric | Threshold | Duration | Action |
|--------|-----------|----------|--------|
| CPU | > 80% | 2 min | Scale up / Optimize code |
| Memory | > 85% | 2 min | Check for leaks / Scale up |
| Error Rate | > 1% | 5 min | Check logs / Rollback |
| Latency (p95) | > 2s | 5 min | Check RLS queries / Scale DB |
| Requests/sec | > 100 | 1 min | Informational only |

---

## Part 4: Verification Checklist

- [ ] CPU alert created and enabled
- [ ] Error rate alert created and enabled
- [ ] Webhook endpoint live on `/api/alerts/railway`
- [ ] Test alert sent successfully
- [ ] Email received at `cvconsultoriaeservicos@gmail.com`
- [ ] Health check running at `/health` ✅
- [ ] Health dashboard live at `/sistema/health` ✅

---

## Part 5: Integration with Observability

### Option A: Manual Monitoring (Simple)
- Visit `/sistema/health` every morning to check overnight metrics
- View Railway Metrics tab for CPU/memory spikes

### Option B: Grafana Dashboard (Advanced)
- Export Railway metrics to Prometheus
- Create Grafana dashboard with alerts
- Configure Grafana to send emails on threshold breach

### Option C: Third-party (DataDog, New Relic, etc.)
- Forward Railway logs to DataDog
- Create composite alerts (CPU + error rate correlation)

**Current: Option A + Webhook + Internal Health Endpoint**

---

## Troubleshooting

### Alert fires but email not received
- Check Railway project settings for email address
- Check spam folder
- Verify email notifications are enabled in project settings

### Webhook not being called
- Check Railway alert logs (Observability tab)
- Ensure webhook URL is HTTPS (not HTTP)
- Add auth token to webhook if needed (configure in Railway)

### False positives (alert fires too often)
- Increase `Duration` field to 5 minutes
- Adjust threshold (e.g., CPU 85% instead of 80%)
- Exclude specific times (e.g., scheduled backups)

---

## Next Steps
1. ✅ Health endpoint created
2. ✅ Health dashboard created
3. **→ Configure Railway alerts** (this doc)
4. → Test rollback procedure (Task #3)
5. → Run k6 load test (Task #4)
