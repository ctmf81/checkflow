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

## Capacidade & carga (load test 2026-07-20)
`node pentest/load-test-simple.mjs` (100 VU · 30s) contra prod: **3.682 req, 0 erros**, média 720ms, **p95 2.182ms** (SLO de 2s estourou por pouco), máx 4s. Nada caiu — o gargalo é **latência sob concorrência**, não estabilidade. ⚠️ O script usa **token dummy** → as req batem na auth e voltam (401) **sem tocar o banco**; req autenticadas reais seriam mais lentas. **Causa = SPOF de instância única** (web+API sem escala horizontal no Railway). **Recomendação:** ligar **réplicas (2+)** no Railway p/ web e API antes de crescer. Teste **pesado** (`pentest/load-test-1000-vu.k6.js`, rampa até 1000 VU, ~11min) **NÃO rodado** — pode degradar/derrubar pros clientes; rodar só em **janela de madrugada** e depois das réplicas. Relatório: `docs/seguranca/RELATORIO_SEG_PERF_2026-07-19.md` §5.

## Escala horizontal / réplicas no Railway (2026-07-20)
**Objetivo:** resolver o gargalo de latência (p95 do load test) + o SPOF de instância única, ligando **2+ réplicas** dos serviços **web** e **API** no Railway.

**Pré-requisito de código (✅ FEITO 2026-07-20 — branch `feat/ops/escala-horizontal-stateless`):** a API não pode guardar estado em memória de processo (cada réplica teria o seu). Auditado e corrigido:
- `routes/alerts.ts` — o Map `recentAlerts` do painel `/sistema/alertas` virou a tabela **`sistema_alertas`** (todas as réplicas veem o mesmo). `adicionarAlerta` agora é async.
- `routes/whatsapp.ts` — o `let ultimoWhatsappOk` do healthcheck virou **`sistema_estado`** (chave `whatsapp_ok`). Sem isso o anti-spam se perdia e o **e-mail de "WhatsApp caiu" repetia** a cada checagem que caísse numa réplica diferente. Decisão extraída para `lib/whatsappHealth.ts` (pura, 6 testes).
- **Migration `20260720120000_sistema_alertas_estado.sql`** cria as 2 tabelas (RLS admin-only). ⚠️ APLICAR no SQL Editor antes de ligar as réplicas.
- Restante já era stateless: **crons idempotentes por tabela** (documentado abaixo), web/Next stateless. Evolution (WhatsApp) é serviço à parte (instância única própria — não replicar).

**Como ligar (no dashboard do Railway, ação do usuário):** serviço → **Settings → Deploy → Replicas** = 2 (web e API). Railway faz load-balance entre réplicas na mesma região; healthcheck `/health` já existe. Sem sticky session (o app é stateless). Confirmar que o plano (Hobby) permite o nº de réplicas desejado.

**✅ Réplicas ATIVADAS 2026-07-20 (2 em web e API) — ganho medido:** re-rodei `load-test-simple.mjs` (100 VU × 30s) contra prod com 2 réplicas. Antes (1 inst.): p95 **2.182ms** (SLO estourado), média 720ms, 3.682 req. Depois (2 réplicas): p95 **1.131–1.267ms** (SLO PASSOU), média 576–656ms, 4.004–4.474 req, **0 erros** nas 2 passadas. Réplicas resolveram o gargalo de latência + o SPOF. (Ressalva: token dummy → `/api/checklists` volta 401 sem tocar o banco; comparação maçã-com-maçã.)

**Ainda pendente:** rodar o **teste pesado** `pentest/load-test-1000-vu.k6.js` (rampa até 1000 VU, ~11min) em **janela de madrugada** para reavaliar p95/p99 com carga real e capacidade nova. Relatório base: `docs/seguranca/RELATORIO_SEG_PERF_2026-07-19.md` §5.

## Web Push / PWA (2026-07-17)
Notificações push no aparelho, somadas ao WhatsApp/e-mail nos mesmos eventos (tickets/planos/tarefas). Envs **novas**: serviço **API** = `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto), lidas em runtime. Serviço **Web** = `NEXT_PUBLIC_VAPID_PUBLIC_KEY` **não é necessária** (o build Docker não injeta NEXT_PUBLIC → a chave pública está hardcoded como fallback em `apps/web/lib/push.ts`; ver `/db` e a feature). Rotas: `POST /push/subscribe|unsubscribe` (reassocia device ao usuário logado) e `POST /push/testar` (botão de teste). Sem as VAPID na API, o envio é no-op silencioso (WA/e-mail seguem). Chaves geradas ficam em `VAPID_KEYS.local.txt` (gitignored). ⚠️ Ao adicionar env `NEXT_PUBLIC_*` nova no web, **setar no Railway não basta** — precisa de fallback no código.

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

## Cron de agendamentos — `POST /cron/agendamentos/processar`
⚠️ **AGENDAR no cron-job.org** (novo, 2026-07-16). Job **a cada ~10 min**, POST, header `x-cron-secret: $CRON_SECRET`, URL `<API>/cron/agendamentos/processar`. Chama `agendamentos_processar()` (mesma função do pg_cron) e retorna `{ok, processados}`. **Motivo**: o `pg_cron` (`processar-agendamentos`, `*/10`) existe mas no Supabase free é instável — o projeto pausa por inatividade e o pg_cron não roda, então checklists agendados não apareciam sozinhos na Operação. Este endpoint HTTP não depende disso. `agendamentos_processar` é idempotente (`for update skip locked` + empurra `proxima_execucao`), então rodar via pg_cron E via HTTP não duplica. Pode manter os dois ou desativar o pg_cron. **Gate de plano (2026-07-20, migration `20260720140000`):** a função pula agendamentos de empresa sem o recurso `agendamentos` no plano (downgrade) — o cron usa service role e ignora a RLS, então a checagem é explícita na função; pausa sem avançar `proxima_execucao` (retoma ao religar, não empilha).

## Cron de avisos de fim de trial — `POST /cron/billing/avisos-trial`
⚠️ **PRECISA SER AGENDADO no cron-job.org** (novo, 2026-07-15). Job **1x/dia** (ex.: 9h tz São_Paulo), header `x-cron-secret: $CRON_SECRET`, URL `<API>/cron/billing/avisos-trial`. Avisa o **admin da empresa** (perfil `…002`) por **WhatsApp + e-mail** quando o teste está a **0–5 dias** do fim, com link `/gestao/plano`. Idempotente por empresa (colunas `empresa_assinaturas.aviso_trial_5d_em`/`aviso_trial_1d_em`): heads-up a ≤5d e urgente a ≤1d, 1x cada. Teste manual: body `{"force": true}` (reenvia) e opcional `{"empresa_id": "<uuid>"}` para mirar uma empresa. Reusa `enviarWhatsApp`/`enviarEmail`; mensagens hardcoded (aviso de plataforma). Banner correspondente na Home = RPC `empresa_dias_trial`. Ver `/biz`, `/db`.

## Cron de avisos de limite de uso — `POST /cron/billing/avisos-uso`
✅ **AGENDADO e validado 2026-07-20** (1×/dia 09:00 no cron-job.org; test run 200 OK + teste controlado confirmou disparo do 80% e gravação em `empresa_avisos_uso`). Job **1x/dia**, header `x-cron-secret: $CRON_SECRET`, URL `<API>/cron/billing/avisos-uso`. Avisa o **admin da empresa** (perfil `…002`) por **WhatsApp + e-mail** quando um limite do plano chega a **80%** (heads-up) ou **100%** (atingido) — recursos: **execuções/mês, tokens de IA/mês, armazenamento**. Lê `empresa_assinaturas` direto (service role; `billing_status` NÃO serve no cron pois exige admin logado) + soma de `uso_armazenamento`/pacotes, chama `avancar_periodo_assinatura` antes de medir. Idempotente por **período de cobrança** via tabela `empresa_avisos_uso` (chave `empresa+recurso+faixa+periodo_ref`): cada aviso sai 1× por período; reseta na virada. `limite null` = ilimitado (não alerta). Lógica pura testada em `apps/api/src/lib/avisosUso.ts`. Teste manual: body `{"empresa_id":"<uuid>"}`. Mensagens hardcoded (aviso de plataforma, sempre ligado). Ver `/biz`, `/db`.

## Cron de lembretes de gestão ao admin — `POST /cron/gestao/lembretes`
✅ **AGENDADO e validado 2026-07-20** (1×/dia 09:15 no cron-job.org; test run 200 OK + gravou lembrete real de pré-cadastro em `empresa_gestao_lembretes`). Job **1x/dia**, header `x-cron-secret: $CRON_SECRET`, URL `<API>/cron/gestao/lembretes`. Hoje lembra o **admin da empresa** (perfil `…002`, WA+e-mail) de **pré-cadastros pendentes** há ≥1 dia. **Throttle de 3 dias por empresa** (tabela `empresa_gestao_lembretes`) → não spamma diariamente. Teste manual: body `{"empresa_id":"<uuid>"}`. Lógica pura em `apps/api/src/lib/avisosGestao.ts`. (A **Fase 2 — fatura vencida** NÃO é cron: dispara no webhook Asaas `PAYMENT_OVERDUE`, que já está configurado.) Ver `/biz`, `/db`.

## Cron de sincronização de catálogos (API externa)
`POST /catalogos/sync-all` (header `x-cron-secret: $CRON_SECRET`) sincroniza todos os catálogos com `api_url` configurada (upsert dos valores via `/catalogos/{id}/sync`). Disparado pelo job **"Checkflow | Atualizar Catálogos"** no cron-job.org (POST + header). Testado 200 OK 2026-06-20. ⚠️ O endpoint **não lê corpo** — `server.ts` tem content-type parser `'*'` para não dar 415 quando o cron manda Content-Type não-JSON. Frequência: catálogo ~1x/dia basta.

## Cron de healthcheck do WhatsApp (2026-06-27)
`POST /cron/whatsapp/health` (header `x-cron-secret: $CRON_SECRET`), chamado a cada ~15min pelo **cron-job.org**. Checa o estado da Evolution (`statusInstancia`/connectionState); na **mudança de estado** (caiu/voltou) cria alerta em `/sistema/alertas` + envia e-mail ao admin. Anti-spam por estado em memória (`ultimoWhatsappOk` em `routes/whatsapp.ts`). **Env nova (serviço API): `ALERT_EMAIL`** (destinatário; sem ele, só alerta no painel). ⚠️ Detecta desconexão, **não** "sessão zumbi" (open mas sem entregar — limitação Baileys). Runbook completo: `docs/ops/WHATSAPP_ESTABILIDADE.md` (inclui Redis na Evolution p/ persistir sessão + reconexão). O envio de código (`enviarCodigoUsuario`) agora retorna `{enviado, erro}` → falha de WhatsApp fica **visível** na UI (não mais "enviado" falso); e-mail é fallback paralelo.

## Cron de limpeza de mídia (retenção) — `POST /cron/limpeza-execucoes`
Job **"CheckFlow | Limpeza (Tempo de Guarda)"** no cron-job.org (1x/dia 1h, tz São_Paulo, header `x-cron-secret: $CRON_SECRET`, URL `api-production-5bce.up.railway.app/cron/limpeza-execucoes`). Chama 3 funções (`apps/api/src/lib/limpezaExecucoes.ts`), retorna `{ok, execucoes, tickets, tarefas}`:
- **`executarLimpezaExecucoes`** — `checklist_execucoes` com `data_expiracao` vencida + `midia_removida_em` nulo (tempo de guarda) → apaga mídia da execução (`{execId}/*`), PDF (`pdfs/{execId}.pdf`), evidências dos planos vinculados (`planos/{planoId}/*` + linhas), limpa URLs, marca `midia_removida_em`. Migration `20260614020000` (coluna `midia_removida_em`).
- **`executarLimpezaTickets`** (2026-07-07) — `tickets.criado_em < now-3m` com evidências → apaga `tickets/<id>/*` + linhas `ticket_evidencias`.
- **`executarLimpezaTarefas`** (2026-07-07) — `tarefa_execucoes.aberta_em < now-3m` com mídia → apaga `tarefas/<execId>/*` + zera `evidencia_url`/`evidencia_tipo`.
- **`executarLimpezaOrfaos`** (2026-07-18) — varre o bucket e apaga arquivos cujo **pai não existe mais** no banco (`{execId}/`, `pdfs/{execId}.pdf`, `tarefas/{id}/`, `tickets/{id}/`, `planos/{id}/`). Só pai comprovadamente ausente, só nomes UUID, e só pastas com arquivo mais novo >7 dias (janela de segurança). Best-effort, paginado; NÃO abate billing (pai ausente). Retorno do cron agora inclui `orfaos: {execucoes,pdfs,tarefas,tickets,planos,erros}`.
Todas abatem os bytes em `uso_armazenamento` (entrada negativa, `origem` execucao/ticket/tarefa). Só a MÍDIA é apagada — registros permanecem. Idempotente. Validado end-to-end 2026-07-07 (ticket+tarefa backdated → limparam). Assets de empresa (logo/docs/catálogos, bucket `empresas`) NÃO expiram.
- **Teto de tamanho no bucket `execucoes` (2026-07-18)**: migration `20260718140000` seta `file_size_limit = 50 MB` (defesa no servidor além do limite do cliente 10/50 MB). Aplicar como service role/postgres.

⚠️ **GOTCHA Node 20 / Railway** (bug corrigido 2026-07-07, commit `68ede1e`): o cron falhava com 500 diário porque `limpeza.ts` fazia `createClient` **sem** `{ realtime: { transport: ws } }` — Node 20 (Railway) não tem WebSocket nativo e o supabase-js lança no createClient. **Toda rota da API que usa `createClient` do supabase-js precisa de `import ws` + `{ realtime: { transport: ws as any } }`.** O endpoint agora devolve `etapa`+erro no corpo (atrás do secret) em vez de 500 opaco.
⚠️ **CRON_SECRET exposto em chat 2026-07-07 → rotacionar** (Railway + cron-job.org header).

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
