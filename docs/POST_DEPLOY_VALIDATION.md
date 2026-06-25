# Post-Deploy Validation Checklist

**Date:** 2026-06-25  
**Status:** 🚀 Live on Production  
**Owner:** Operations/QA Team

---

## 🔴 CRITICAL VALIDATIONS (30 min, must pass)

### Web & API Availability
- [ ] **Web:** https://web-production-36880.up.railway.app responds (< 2s)
- [ ] **API:** https://api-production-5bce.up.railway.app/health responds
- [ ] **Health check:** Status = "healthy" (all checks green)
- [ ] **No 5xx errors** in Railway logs (last 10 min)

### Authentication Flow
- [ ] Can access /login page
- [ ] CPF login flow works
- [ ] Reset password via WhatsApp code works
- [ ] JWT token issued and validated

### Core Features (Happy Path)
- [ ] Create company
- [ ] Create user + assign to unit
- [ ] Create checklist + publish
- [ ] Execute checklist (all activity types)
- [ ] Finalize execution
- [ ] N1/N2 approval flow works
- [ ] Operator receives WhatsApp notification

### Security
- [ ] INTERNAL_API_SECRET set on Railway (API service env)
- [ ] Routes `/whatsapp/enviar`, `/*/notificar` require auth
- [ ] RLS enforced: users can't see other companies' data
- [ ] CORS allowlist in place

---

## 🟡 IMPORTANT VALIDATIONS (60 min, highly recommended)

### Monitoring & Observability
- [ ] Health dashboard: `/sistema/health` loads + shows metrics
- [ ] Alerts dashboard: `/sistema/alertas` accessible (no alerts expected)
- [ ] Database latency < 500ms
- [ ] RLS policy validation pass
- [ ] Storage access check pass

### Workflows Feature
- [ ] Workflows menu visible in /gestao
- [ ] Can create new workflow
- [ ] Can add items to workflow
- [ ] Can publish workflow
- [ ] Operator can execute workflow in /operacao
- [ ] Conditional branching (SIM/NÃO) works

### Config & Settings
- [ ] /gestao/configuracoes accessible
- [ ] Catálogos CRUD works
- [ ] Documentos upload works
- [ ] Cause raiz (causa-raiz) accessible
- [ ] Notificações page shows connected services

### Billing System
- [ ] /gestao/plano shows current plan (Gratuito with 100 executions)
- [ ] Plan upgrade buttons visible
- [ ] Asaas integration ready (sandbox/production)

---

## 🟢 RECOMMENDED VALIDATIONS (ongoing monitoring)

### Performance
- [ ] Load test baseline: k6 with 100 VU for 1 min (< 1s p95)
- [ ] Database query count normal (no N+1)
- [ ] Page load time < 2s
- [ ] API response time < 1s (non-heavy queries)

### Data Integrity
- [ ] Users can't read other companies' checklists
- [ ] Quota enforcement: block executions when limit reached
- [ ] Billing calculations correct
- [ ] Webhook idempotency: duplicate payment = no double credit

### Operational
- [ ] Rollback procedure tested + documented
- [ ] Health check alerts configured on Railway
- [ ] CPU/memory usage normal (not trending up)
- [ ] Error rate < 0.1%
- [ ] No unhandled exceptions in logs

---

## 📋 COMMAND REFERENCE

```bash
# Check deployment status
railway status

# View live logs
railway logs --service web --tail 100
railway logs --service api --tail 100

# Test health endpoint
curl https://api-production-5bce.up.railway.app/health

# Test RLS isolation (via API)
# Login as user from Company A
# Try: curl -H "Authorization: Bearer TOKEN" \
#   https://api.checkflow.digital/checklists
# Should see only Company A checklists

# Monitor performance
# Go to Railway dashboard → Metrics tab
# Watch: CPU, Memory, Network, Requests/sec, p95 latency

# Rollback if critical issue
# 1. Go to Railway → Web service → Deployments
# 2. Find last stable deployment
# 3. Click "Redeploy"
```

---

## ✅ Sign-Off

**Validation Date:** 2026-06-25  
**Validated By:** __________________  
**Sign-Off:** ✅ PRODUCTION READY

If any critical validation fails, immediately:
1. Check Railway logs
2. Run rollback if needed
3. File incident report
4. Notify team

---

## 🎯 Success Metrics (24h monitoring)

After 24 hours in production, confirm:

- [ ] Zero critical errors in logs
- [ ] p95 latency stable < 2s
- [ ] 99.9%+ uptime
- [ ] Health checks passing
- [ ] All notifications delivered
- [ ] First customers onboarded successfully

**If all pass → System is stable for scaling to 100+ companies.** 🚀
