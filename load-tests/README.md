# Load Testing — CheckFlow Scale Test

## Overview

This directory contains **k6 scripts** for load testing CheckFlow with **1000+ virtual users**.

**Goal:** Validate system behavior under production-scale load:
- 100 companies × 10 users each = 1,000 concurrent users
- Verify response time (p95 < 2s)
- Verify error rate < 1%
- Verify RLS isolation (no cross-tenant data leaks)
- Verify billing webhook idempotency

---

## Prerequisites

### Install k6
```bash
# macOS
brew install k6

# Linux
wget https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz
tar xzf k6-v0.50.0-linux-amd64.tar.gz
sudo mv k6 /usr/local/bin/

# Windows
choco install k6

# Or download from: https://github.com/grafana/k6/releases
```

### Set Environment Variables
```bash
export BASE_URL="https://staging-api.checkflow.digital" # or http://localhost:3001 for local
export API_KEY="your-api-key" # if authentication required
export COMPANY_COUNT="100"
export USERS_PER_COMPANY="10"
export WEBHOOK_SECRET="your-webhook-secret"
```

---

## Quick Start

### Run Against Local/Staging
```bash
# 1. Start API server (if local)
npm run dev:api &

# 2. Run load test
k6 run load-tests/scale-test-1000-vu.js

# 3. Watch results in real-time
# Output shows metrics as test progresses
```

### Run Against Production (Use with Caution!)
⚠️ **Only run against production during low-traffic hours** (e.g., early morning)

```bash
BASE_URL="https://api.checkflow.digital" \
COMPANY_COUNT="100" \
k6 run load-tests/scale-test-1000-vu.js
```

---

## Test Scenarios

### Scenario Breakdown
- **70%** — Checklist Execution (create → finalize → wait)
- **20%** — Health Checks (`GET /health`)
- **10%** — Billing Webhooks (Asaas simulation)

### Load Stages (by default)
```
1. Warm-up:    0 → 100 VU over 1 minute
2. Ramp-up:    100 → 500 VU over 2 minutes
3. Peak:       500 → 1000 VU over 2 minutes
4. Hold:       1000 VU for 2 minutes (peak load)
5. Ramp-down:  1000 → 0 VU over 2 minutes
```

**Total duration:** ~10 minutes

### Customize Load Profile
Edit `scale-test-1000-vu.js` → `export const options`:

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 500 }, // Faster ramp-up
    { duration: '3m', target: 1000 }, // Hold at peak longer
    { duration: '1m', target: 0 }, // Quick ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // Raise threshold to 3s
    http_req_failed: ['rate<0.02'], // Allow 2% error rate
  },
}
```

---

## Interpreting Results

### Success Criteria (GO/NO-GO)

✅ **GO** if all thresholds pass:
- `p95 latency < 2000ms`
- `p99 latency < 5000ms`
- `error rate < 1%`
- `0 RLS cross-contamination`

❌ **NO-GO** if any threshold fails:
- `p95 > 2s` — Database is slow (optimize queries)
- `error rate > 1%` — API is unstable (check logs)
- `repeated 503 errors` — Server under-resourced (scale up)

### Example Output
```
     data_received..............: 5.3 MB   52 kB/s
     data_sent..................: 8.2 MB   82 kB/s
     http_req_blocked...........: avg=2.31ms   min=1.12ms max=45.34ms p(90)=3.24ms  p(95)=4.12ms
     http_req_connecting........: avg=0.00ms   min=0.00ms max=0.00ms  p(90)=0.00ms  p(95)=0.00ms
     http_req_duration..........: avg=743.21ms min=12.34ms max=8.34s   p(90)=1.23s   p(95)=1.87s   p(99)=4.56s
     http_req_failed............: 0.53%    ✓ (THRESHOLD FAILED)
     http_req_receiving.........: avg=23.42ms  min=0.00ms max=456.23ms p(90)=45.23ms p(95)=67.89ms
     http_req_sending...........: avg=3.21ms   min=0.00ms min=34.56ms  p(90)=4.34ms  p(95)=5.67ms
     http_req_tls_handshaking...: avg=0.00ms   min=0.00ms max=0.00ms   p(90)=0.00ms  p(95)=0.00ms
     http_req_waiting...........: avg=716.58ms min=12.34ms max=8.23s    p(90)=1.20s   p(95)=1.85s   p(99)=4.45s
     http_reqs..................: 10000    99.800020/s
     iteration_duration.........: avg=3.74s    min=0.12s   max=15.23s   p(90)=3.45s   p(95)=4.12s
     iterations.................: 10000    99.800020/s
     vus........................: 1000     min=1000 max=1000
     vus_max.....................: 1000
```

**Analysis:**
- ✓ `p(95)=1.87s` — Below 2s threshold
- ✓ `http_req_failed=0.53%` — Below 1% threshold
- ✗ `p(99)=4.56s` — Below 5s threshold (OK)

---

## Troubleshooting

### High Latency (p95 > 2s)
**Likely causes:**
1. Database connection pool exhausted
2. N+1 queries in checklist endpoint
3. RLS policy too complex (Supabase re-scanning all rows)

**Fix:**
```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM checklist_execucoes WHERE empresa_id = 'xxx';
-- Look for sequential scans (use indexes)
CREATE INDEX idx_execucoes_empresa ON checklist_execucoes(empresa_id);
```

### High Error Rate (> 1%)
**Likely causes:**
1. API server crashing under load (OOM, CPU maxed)
2. Database connection timeout
3. 5xx errors in logs

**Check logs:**
```bash
# Railway
railway logs --service api --tail 100

# Or if local
tail -100 logs/api.log | grep ERROR
```

### 503 Service Unavailable
**Likely causes:**
1. Server is overloaded
2. Database pool exhausted (20 connections)

**Fix (Railway):**
```bash
# Increase RAM/CPU
railway service update --ram=2G --cpu=1

# Or increase database pool
psql $DATABASE_URL -c "ALTER SYSTEM SET max_connections=100;"
SELECT pg_reload_conf();
```

---

## Advanced: Export Results to Grafana

K6 can export metrics to Prometheus/Grafana for visualization:

```bash
k6 run \
  -o experimental-prometheus-rw \
  --out "http://localhost:9090/api/v1/write" \
  load-tests/scale-test-1000-vu.js
```

Then create Grafana dashboard with queries:
```
rate(k6_http_req_duration_ms_sum[5m]) # Average latency
rate(k6_http_req_failed[5m]) # Error rate
k6_vus # Active virtual users
```

---

## Running Against Different Scales

### Light Load (100 VU - Sanity Check)
```bash
k6 run \
  --vus 100 \
  --duration 3m \
  load-tests/scale-test-1000-vu.js
```

### Medium Load (500 VU - Baseline)
```bash
k6 run \
  --vus 500 \
  --duration 5m \
  load-tests/scale-test-1000-vu.js
```

### Heavy Load (2000 VU - Stress Test)
```bash
k6 run \
  --vus 2000 \
  --duration 10m \
  load-tests/scale-test-1000-vu.js
```

---

## CI Integration (GitHub Actions)

Add to `.github/workflows/load-test.yml`:

```yaml
name: Load Test

on:
  schedule:
    - cron: '0 2 * * *' # Run daily at 2 AM UTC

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: grafana/k6-action@v0.3.0
        with:
          filename: load-tests/scale-test-1000-vu.js
          cloud: true
      - name: Check Results
        if: failure()
        run: |
          echo "Load test failed — check https://app.k6.io for details"
          exit 1
```

---

## Next Steps

1. **This week:** Run against staging (1000 VU, 10 min)
2. **Before production:** Run 2-3 times, verify p95 < 2s consistently
3. **Weekly:** Run smoke test (100 VU, 3 min)
4. **Monthly:** Run full test (1000 VU, 10 min) and compare trends

---

## References

- [k6 Documentation](https://k6.io/docs/)
- [k6 API Reference](https://k6.io/docs/javascript-api/)
- [HTTP Request Timeout](https://k6.io/docs/using-k6/options/#timeout)
- [Thresholds](https://k6.io/docs/using-k6/thresholds/)
