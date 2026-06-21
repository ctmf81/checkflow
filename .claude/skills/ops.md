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

## Services
| Serviço | URL |
|---------|-----|
| Web (Next.js) | `web-production-36880.up.railway.app` |
| API (Fastify) | `api-production-5bce.up.railway.app` |
| Evolution API (WhatsApp) | `evolution-api-production-d484.up.railway.app` — imagem `evoapicloud/evolution-api:v2.3.7` (org `atendai` desatualizada no Docker Hub; não fazer downgrade p/ 2.2.x — bug de QR) |

## Env Vars (nomes — nunca valores no chat)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_API_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `EVOLUTION_API_KEY` (serviço API — obrigatória, sem fallback no código; URL/instância têm default), `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`

## Consulta Inteligente (IA) — failover multi-provedor
Rota `/api/documentos/consultar` tenta provedores em ordem, usando só os que têm a env key (serviço **web**): `GEMINI_API_KEY` (Gemini, PDF+imagem) → `ANTHROPIC_API_KEY` (Claude, PDF+imagem) → `OPENAI_API_KEY` (GPT-4o, só imagem) → `GROQ_API_KEY` (Llama vision, só imagem). Se um dá 429/erro antes de emitir, cai para o próximo. Modelos override: `GEMINI_MODEL`, `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GROQ_MODEL`. Para **PDF**, só Gemini e Anthropic entram. Erro de quota do Gemini (`limit:0` free tier) → gerar key no Google AI Studio ou habilitar billing.

✅ **Env do Supabase corrigida no Railway (web) em 2026-06-12** — `NEXT_PUBLIC_SUPABASE_URL` voltou para `https://pswdjdlirylxgscohcfi.supabase.co` e a publishable key com o valor certo (estavam trocadas com a URL da API Fastify). A rota `consultar` mantém a blindagem (só aceita URL `*.supabase.co`) por segurança.

## Cron do resumo mensal de parceiros
`POST /cron/parceiros/resumo-mensal` é chamado 1x/dia pelo **cron-job.org** (conta do usuário) com header `x-cron-secret: $CRON_SECRET`. A rota só age no último dia do mês (idempotente por mês — nos demais dias responde `skip`). `CRON_SECRET` precisa estar no Railway (serviço API) e no job do cron-job.org com o mesmo valor. Teste manual fora do último dia: body JSON `{"force": true}`.

## Cron de sincronização de catálogos (API externa)
`POST /catalogos/sync-all` (header `x-cron-secret: $CRON_SECRET`) sincroniza todos os catálogos com `api_url` configurada (upsert dos valores via `/catalogos/{id}/sync`). Disparado pelo job **"Checkflow | Atualizar Catálogos"** no cron-job.org (POST + header). Testado 200 OK 2026-06-20. ⚠️ O endpoint **não lê corpo** — `server.ts` tem content-type parser `'*'` para não dar 415 quando o cron manda Content-Type não-JSON. Frequência: catálogo ~1x/dia basta.

## Cron de limpeza de mídia por tempo de guarda
`POST /cron/limpeza-execucoes` (mesmo header `x-cron-secret: $CRON_SECRET`) deve ser chamado 1x/dia pelo cron-job.org. Busca `checklist_execucoes` com `data_expiracao` no passado e `midia_removida_em` nulo, remove do bucket `execucoes` as fotos/vídeos da execução (`{execId}/*`), o PDF (`pdfs/{execId}.pdf`) e as evidências de planos de ação vinculados (`planos/{planoId}/*`), limpa as URLs em `checklist_execucao_respostas`/`checklist_execucoes.pdf_url` e marca `midia_removida_em`. O registro da execução e dos planos é preservado — só a mídia é apagada. Idempotente (reprocessa apenas execuções ainda não marcadas). Lógica em `apps/api/src/lib/limpezaExecucoes.ts`. Precisa de migration `20260614020000_limpeza_execucoes_expiradas.sql` aplicada (coluna `midia_removida_em`).

## Evolution Rule
When a new service, env var name, or deploy command is established, add it here. Keep the file under 40 lines.

**This skill is live.** When the user says "update skills with what we did today", add any new Railway services or env var names (never values) discovered in this session.
