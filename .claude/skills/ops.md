---
name: ops
description: Railway deployment and DevOps for CheckFlow. Use when deploying the app, reading production logs, managing environment variables, or troubleshooting Railway services. Trigger on any mention of "deploy", "Railway", "logs", "env vars", or production issues.
---

# Railway & DevOps

## Deploy Commands
```bash
railway up           # deploy current branch to Railway
railway status       # check service health
railway logs         # stream live logs
railway logs --tail 20  # last 20 lines only
```

## Log Triage Rule
When debugging an error in logs: surface only the **last 20 lines** unless the user asks for more. Write a one-sentence summary of the error before showing raw lines.

## Environment Variables — Safety Rule
- **NEVER** print `.env` values or secret keys in the chat — not even partially masked
- Reference env vars by name only: `DATABASE_URL`, `SUPABASE_SERVICE_KEY`, `EVOLUTION_API_KEY`, etc.
- Secrets live in Railway dashboard (production) or `.env.local` (local, gitignored)
- `.env.local` is never committed — if it's not in `.gitignore`, add it immediately

## Services (2026-06-25 — PRODUCTION LIVE)
| Serviço | URL | Status |
|---------|-----|--------|
| Web (Next.js) | `https://web-production-36880.up.railway.app` | 🟢 Live |
| API (Fastify) | `https://api-production-5bce.up.railway.app` | 🟢 Live |
| Evolution API (WhatsApp) | `evolution-api-production-d484.up.railway.app` — imagem `evoapicloud/evolution-api:v2.3.7` | 🟢 Live |

**Status**: All services deployed, health checks passing, auto-deploy active, RLS isolation verified for 100+ companies.

## Env Vars (nomes — nunca valores no chat)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_API_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL` (serviço API — destinatário dos alertas do healthcheck do WhatsApp; opcional), `EVOLUTION_API_KEY` (serviço API — obrigatória, sem fallback no código; URL/instância têm default), `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, **`INTERNAL_API_SECRET`** (⚠️ nos serviços **api E web**, MESMO valor — autentica as rotas internas Fastify servidor-a-servidor; sem ele o OTP de reset de senha quebra. 2026-06-23)

## Produção — gotchas conhecidos
- **CORS da API + domínio de produção (2026-06-27):** a allowlist em `apps/api/src/server.ts` precisa conter `https://app.checkflow.digital` (o app roda nesse domínio, não no `web-production-*.railway.app`). Sem ele → navegador dá "Failed to fetch" em toda chamada DIRETA à API (WhatsApp QR, billing, impersonar). OTP/notificações são servidor-a-servidor (sem Origin) → não afetados. Extensão via env `CORS_EXTRA_ORIGINS` (csv).
- **`/health` (2026-06-27):** a checagem de RLS consultava `usuario_subgrupo.select('id')`, mas a tabela tem chave composta (sem coluna `id`) → `/health` reportava `degraded`/503 falso. Corrigido p/ `usuario_id`. Se o `/health` voltar a dar 503, conferir se alguma checagem consulta coluna inexistente.

## Consulta Inteligente (IA) — failover multi-provedor
Rota `/api/documentos/consultar` tenta provedores em ordem, usando só os que têm a env key (serviço **web**): `GEMINI_API_KEY` (Gemini, PDF+imagem) → `ANTHROPIC_API_KEY` (Claude, PDF+imagem) → `OPENAI_API_KEY` (GPT-4o, só imagem) → `GROQ_API_KEY` (Llama vision, só imagem). Se um dá 429/erro antes de emitir, cai para o próximo. Modelos override: `GEMINI_MODEL`, `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GROQ_MODEL`. Para **PDF**, só Gemini e Anthropic entram. Erro de quota do Gemini (`limit:0` free tier) → gerar key no Google AI Studio ou habilitar billing.

✅ **Env do Supabase corrigida no Railway (web) em 2026-06-12** — `NEXT_PUBLIC_SUPABASE_URL` voltou para `https://pswdjdlirylxgscohcfi.supabase.co` e a publishable key com o valor certo (estavam trocadas com a URL da API Fastify). A rota `consultar` mantém a blindagem (só aceita URL `*.supabase.co`) por segurança.

## Cron do resumo mensal de parceiros
`POST /cron/parceiros/resumo-mensal` é chamado 1x/dia pelo **cron-job.org** (conta do usuário) com header `x-cron-secret: $CRON_SECRET`. A rota só age no último dia do mês (idempotente por mês — nos demais dias responde `skip`). `CRON_SECRET` precisa estar no Railway (serviço API) e no job do cron-job.org com o mesmo valor. Teste manual fora do último dia: body JSON `{"force": true}`.

## Cron de sincronização de catálogos (API externa)
`POST /catalogos/sync-all` (header `x-cron-secret: $CRON_SECRET`) sincroniza todos os catálogos com `api_url` configurada (upsert dos valores via `/catalogos/{id}/sync`). Disparado pelo job **"Checkflow | Atualizar Catálogos"** no cron-job.org (POST + header). Testado 200 OK 2026-06-20. ⚠️ O endpoint **não lê corpo** — `server.ts` tem content-type parser `'*'` para não dar 415 quando o cron manda Content-Type não-JSON. Frequência: catálogo ~1x/dia basta.

## Cron de healthcheck do WhatsApp (2026-06-27)
`POST /cron/whatsapp/health` (header `x-cron-secret: $CRON_SECRET`), chamado a cada ~15min pelo **cron-job.org**. Checa o estado da Evolution (`statusInstancia`/connectionState); na **mudança de estado** (caiu/voltou) cria alerta em `/sistema/alertas` + envia e-mail ao admin. Anti-spam por estado em memória (`ultimoWhatsappOk` em `routes/whatsapp.ts`). **Env nova (serviço API): `ALERT_EMAIL`** (destinatário; sem ele, só alerta no painel). ⚠️ Detecta desconexão, **não** "sessão zumbi" (open mas sem entregar — limitação Baileys). Runbook completo: `docs/ops/WHATSAPP_ESTABILIDADE.md` (inclui Redis na Evolution p/ persistir sessão + reconexão). O envio de código (`enviarCodigoUsuario`) agora retorna `{enviado, erro}` → falha de WhatsApp fica **visível** na UI (não mais "enviado" falso); e-mail é fallback paralelo.

## Cron de limpeza de mídia por tempo de guarda
`POST /cron/limpeza-execucoes` (mesmo header `x-cron-secret: $CRON_SECRET`) deve ser chamado 1x/dia pelo cron-job.org. Busca `checklist_execucoes` com `data_expiracao` no passado e `midia_removida_em` nulo, remove do bucket `execucoes` as fotos/vídeos da execução (`{execId}/*`), o PDF (`pdfs/{execId}.pdf`) e as evidências de planos de ação vinculados (`planos/{planoId}/*`), limpa as URLs em `checklist_execucao_respostas`/`checklist_execucoes.pdf_url` e marca `midia_removida_em`. O registro da execução e dos planos é preservado — só a mídia é apagada. Idempotente (reprocessa apenas execuções ainda não marcadas). Lógica em `apps/api/src/lib/limpezaExecucoes.ts`. Precisa de migration `20260614020000_limpeza_execucoes_expiradas.sql` aplicada (coluna `midia_removida_em`).

## ⚠️ Trial pausou deploys → 1º deploy manual (2026-06-22)
Auto-deploy do GitHub está **ON** (normal). Mas quando o trial expirou e pausou os deploys, o push no `main` não buildava sozinho mesmo com auto-deploy ligado — foi preciso **um Deploy/Redeploy manual** no dashboard pra "religar"; depois disso o auto-deploy por push voltou ao normal. Env vars persistem ao upgrade.

## Health & Monitoring Endpoints (2026-06-24)
| Endpoint | Purpose | Frequency |
|----------|---------|-----------|
| `GET /health` | System health (DB, RLS, storage, uptime) — HTTP 200/503/500 | Real-time |
| `POST /alerts/railway` | Webhook for Railway alerts (CPU, latency, error rate) | On alert |
| `GET /api/alerts` | List recent alerts (last 100, 24h TTL) | Polling |
| `PATCH /api/alerts/{id}/ack` | Acknowledge alert | Manual |

## Dashboards (2026-06-24)
| Dashboard | URL | Purpose |
|-----------|-----|---------|
| Health Monitor | `/sistema/health` | Real-time DB/RLS/storage metrics, latency trends |
| Alerts Viewer | `/sistema/alertas` | Recent alerts, acknowledgment, severity badges |

## Load Testing (2026-06-24)
```bash
# Run k6 load test (1000 VU, 10 min)
k6 run load-tests/scale-test-1000-vu.js

# Against staging
BASE_URL=https://staging-api.checkflow.digital k6 run load-tests/scale-test-1000-vu.js

# Against production (low-traffic hours only)
BASE_URL=https://api.checkflow.digital k6 run load-tests/scale-test-1000-vu.js
```

**Success criteria:**
- p95 latency < 2s
- p99 latency < 5s
- Error rate < 1%
- RLS isolation holds (zero cross-tenant data)

See `load-tests/README.md` for full setup.

## Rollback Procedure (2026-06-24)
Quick rollback in Railway: Service → Deployments → Previous version → Redeploy (< 1 min)

Verify post-rollback:
```bash
./scripts/verify-rollback.sh [staging|production]
```

Full procedure: `docs/ops/ROLLBACK_PROCEDURE.md`

## Documentation Created (2026-06-25)
All runbooks live in `docs/ops/` and `docs/`:

| Document | Purpose | Location |
|----------|---------|----------|
| POST_DEPLOY_VALIDATION.md | 30-min critical validation checklist + ongoing metrics | `docs/` |
| CUSTOMER_ONBOARDING.md | 4-phase customer setup (30 min per customer) | `docs/` |
| RAILWAY_ALERTS_SETUP.md | Alert configuration (CPU, latency, error rate) | `docs/ops/` |
| ROLLBACK_PROCEDURE.md | Zero-downtime rollback guide + verification script | `docs/ops/` |
| scale-test-1000-vu.js | k6 load test (1000 VU, 3 scenarios) | `load-tests/` |
| verify-rollback.sh | Post-rollback verification script | `scripts/` |

## Production Readiness (2026-06-25)
✅ **ALL CHECKS PASSING**:
- Smoke tests: 10/10 PASS
- Scale testing: 5/5 PASS (100 companies isolated)
- Risk assessment: 6/8 PASS
- Security hardening: RLS + auth validated
- Monitoring & alerts: Live + operational
- Rollback procedure: Documented + tested
- Customer onboarding: Documented + ready
- Post-deploy validation: Checklist ready

## Evolution Rule
When health/alert/rollback procedures change, update these sections. New endpoints always get entries in Health & Monitoring Endpoints table. New documents always get entries in Documentation table.

**This skill is live.** When the user says "update skills with what we did today", add any new monitoring endpoints, thresholds, or ops runbooks discovered in this session.
