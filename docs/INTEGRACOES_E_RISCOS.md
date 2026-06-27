# CheckFlow — Mapa de Integrações e Riscos

> Documento vivo. Mapeia **todas** as integrações externas e dependências do sistema, com riscos de **performance (gargalos)**, **segurança** e **escalabilidade**.
> Última atualização: 2026-06-26.
> Skills relacionados: `/arch`, `/ops`, `/security`, `/db`. Inventário de rotas: `docs/api/INVENTARIO_APIS.md`.

---

## 1. Visão geral da arquitetura

```
                          ┌─────────────────────────────────────────┐
   Navegador / PWA  ──────┤  apps/web (Next.js 16, Railway)          │
   (operador/gestor)      │   - SSR + Route Handlers /api/*          │
        │                 │   - PWA: Service Worker + IndexedDB      │
        │ getSession      └───────┬───────────────┬─────────────────┘
        │ (localStorage)          │               │
        │                         │ service-role  │ Bearer / x-internal-secret
        ▼                         ▼               ▼
   ┌──────────────┐        ┌─────────────┐  ┌──────────────────────────┐
   │  Supabase    │◄───────┤  Postgres   │  │  apps/api (Fastify,      │
   │  Auth/Stora/ │  RLS   │  + RLS +    │  │  Railway)                │
   │  Realtime    │        │  pg_cron    │  │   - WhatsApp proxy        │
   └──────────────┘        └─────────────┘  │   - Billing (Asaas)       │
                                            │   - Email (Resend)        │
                                            │   - Cron endpoints        │
                                            └───────┬──────────────────┘
                                                    │
   Externos: Evolution API (WhatsApp) · Asaas (pagamentos) · Resend (email)
             IA (Gemini/Claude/OpenAI/Groq/custom) · Nominatim (geocoding)
             cron-job.org (gatilhos) · APIs de cliente (catálogo/usuários)
             Embeds de vídeo (YouTube/Drive/Vimeo)
```

**Criticidade (o que derruba o quê):**

| Integração | Se cair... | Criticidade |
|---|---|---|
| Supabase | App inteiro para (auth, dados, storage) | 🔴 Crítica — SPOF |
| Railway | Web + API + Evolution fora do ar | 🔴 Crítica — SPOF infra |
| Evolution API (WhatsApp) | Sem notificações/OTP por WhatsApp | 🟠 Alta |
| Resend (email) | Sem e-mail (OTP, boas-vindas, parceiros) | 🟠 Alta |
| Asaas | Sem cobrança/assinatura (billing) | 🟡 Média (não bloqueia operação) |
| Provedores de IA | Consulta Inteligente + assistente off | 🟡 Média (tem failover) |
| Nominatim | Atividade de localização sem endereço textual | 🟢 Baixa (degrada) |
| cron-job.org | Tarefas agendadas (limpeza/parceiros/catálogos) não rodam | 🟡 Média |
| APIs de cliente | Sync de catálogo/import de usuários falha | 🟢 Baixa (opcional) |
| Embeds de vídeo | Vídeos de documentos não carregam | 🟢 Baixa |

---

## 2. Integrações — detalhamento e riscos

### 2.1 Supabase (Postgres + Auth + Storage + Realtime) — 🔴 SPOF
**Papel:** banco de dados, autenticação (JWT), storage de mídia (bucket `execucoes`, `empresas`), e a **barreira de segurança principal (RLS)**.
**Onde:** `apps/web/lib/supabase.ts` (browser, anon key), `@supabase/ssr`; `apps/api` (service-role via `SUPABASE_SECRET_KEY`).
**Dependências:** `@supabase/supabase-js`, `@supabase/ssr`, `ws` (transport WebSocket — Node 20 no Railway).

- **Performance / gargalos:**
  - RLS executa subqueries (`usuario_unidade`, helpers `security definer`) em **toda** query — políticas mal indexadas viram N+1 no Postgres. Carga de scale test: p95 237ms (100 empresas). Vigiar quando o volume de execuções/respostas crescer.
  - PostgREST: embeds (`select ...(...)`) podem explodir em joins; já houve `PGRST200` quebrando telas silenciosamente.
  - Plano Supabase tem limite de **conexões**; o app cria client por request — sob pico, esgotamento de pool.
- **Segurança:**
  - **Toda a autorização depende da RLS** (não da UI). Uma tabela nova sem as 4 policies = vazamento cross-tenant. Pen test `pentest/run.mjs` (48/48) cobre IDOR/escalada.
  - `service-role` (api + route handlers web) **bypassa RLS** — qualquer rota service-role precisa de `exigirAutorizacao`/`autorizarPermissao` (já aplicado; ver `/security`).
  - Anon key e URL ficam embarcadas no bundle (esperado); a proteção é a RLS.
- **Escalabilidade:**
  - Tier atual (free/pro?) limita storage, conexões e egress. Mídia (fotos/vídeos) cresce rápido → cota de storage. Há limpeza por tempo de guarda (cron), mas é a principal alavanca de custo.
  - Backup/restore validado (scale test 7/7). DR depende inteiramente do Supabase.
- **Mitigações / ação:** monitorar `/sistema/health` (latência DB, RLS, storage). Indexar FKs usadas em RLS. Avaliar connection pooling (Supavisor/PgBouncer) antes de escalar. **Ponto único de falha — sem fallback.**

### 2.2 Railway (hosting) — 🔴 SPOF de infraestrutura
**Papel:** hospeda os 3 serviços: Web (Next.js), API (Fastify), Evolution API (WhatsApp).
- **Performance:** serverless/container — cold starts; PDF (`@react-pdf/renderer`) e compressão de imagem consomem CPU/memória no container.
- **Segurança:** secrets vivem só no dashboard Railway (nunca no git). Banner `Server: railway-hikari` exposto (risco residual aceito).
- **Escalabilidade:** auto-deploy por push no `main`. ⚠️ **Após pausa de trial, o 1º deploy precisa ser manual** (Redeploy) — depois normaliza. Escala vertical/horizontal limitada ao plano. Sem multi-região.
- **Ação:** rollback documentado (`docs/ops/ROLLBACK_PROCEDURE.md`). Alertas (CPU>80%, erro>1%, latência) em `/sistema/alertas`.

### 2.3 Evolution API — WhatsApp (Baileys) — 🟠 Alta
**Papel:** envio de WhatsApp (OTP de senha, notificações de ticket/plano/tarefa, boas-vindas).
**Onde:** `apps/api/src/lib/whatsapp.ts`, `routes/whatsapp.ts`. Imagem `evoapicloud/evolution-api:v2.3.7` (self-hosted no Railway).
- **Performance / gargalos:** Baileys mantém **sessão única** por instância (`checkflow`); a sessão pode ficar "open mas zombie" (mensagens travam em `PENDING`) sem aviso — já ocorreu, resolvido com reconexão via QR. Sem fila de envio (fire-and-forget).
- **Segurança:** rotas internas (`/whatsapp/*`) agora exigem `Bearer`/`x-internal-secret` (antes chamáveis direto = WhatsApp arbitrário). `EVOLUTION_API_KEY` só via env. ⏳ **rotacionar a chave** (já esteve no git). Risco de **ban do número** pelo WhatsApp se houver disparo em massa.
- **Escalabilidade:** WhatsApp não-oficial (Baileys) **não escala** para alto volume nem é homologado — risco de bloqueio. 1 número = 1 instância. Para escalar: migrar para WhatsApp Cloud API oficial.
- **Ação:** healthcheck periódico da sessão; respeitar turno nas notificações (já implementado); avaliar fila + WhatsApp oficial antes de crescer.

### 2.4 Asaas — gateway de pagamento — 🟡 Média
**Papel:** assinaturas e cobranças (billing). `apps/api/src/lib/asaas.ts`, `routes/billing.ts`.
**Endpoints:** `api.asaas.com/v3` (prod) / `api-sandbox.asaas.com/v3`.
- **Performance:** chamadas síncronas no fluxo de assinar/comprar pacote; crédito de saldo só via **webhook** (assíncrono, idempotente por `event_id`).
- **Segurança:** `ASAAS_API_KEY` só no servidor. Webhook valida `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`. Idempotência via `asaas_webhook_eventos` (PK = id do evento). **Risco:** webhook é endpoint público — depende só do token; sem ele, crédito forjado.
- **Escalabilidade:** OK (Asaas é o gargalo deles). Split de parceiro (Fase 4) ainda pendente.
- **Ação:** validar e2e no sandbox (pendente). Garantir `ASAAS_WEBHOOK_TOKEN` forte e rotacionável. Billing **não bloqueia operação** se cair.

### 2.5 Provedores de IA (Consulta Inteligente + assistente + gerar template) — 🟡 Média
**Papel:** IA com **failover multi-provedor**. `/api/documentos/consultar`, `/api/ajuda`, `/api/templates/gerar`.
**Ordem de failover:** Gemini → Claude (Anthropic) → OpenAI → Groq → 2 customizados OpenAI-compatible (SiliconFlow/DashScope/OpenRouter via `base_url`). PDF só Gemini/Claude.
**Onde:** chaves em `ia_provedores` (DB, admin-only, mascaradas) + env de fallback. Dep: `@google/generative-ai`.
- **Performance:** latência alta (LLM); failover serial pode **somar latências** quando os primeiros falham. Sem streaming na maioria.
- **Segurança:** chaves nunca voltam para a UI (`chave_mascara`). `base_url` customizada = **SSRF potencial** (admin-only, mitiga). Consulta Inteligente consome **tokens do plano** (enforcement `billing_pode_consumir_ia`); assistente NÃO conta.
- **Escalabilidade:** dependente de cota dos provedores (Gemini free tier zerou — 429). Custo escala com uso. Sem RAG/embeddings (contexto direto) — degrada com base grande; migrar p/ pgvector quando crescer.
- **Ação:** manter ≥2 provedores com cota (Claude/OpenAI como reserva que lê PDF). Logar falhas em `ia_falhas`.

### 2.6 Resend — e-mail transacional — 🟠 Alta
**Papel:** e-mail (OTP de senha, boas-vindas de usuário/parceiro, resumo mensal). `apps/api/src/lib/email.ts`. Dep: `resend`.
- **Performance:** fire-and-forget; sem fila/retry robusto.
- **Segurança:** `RESEND_API_KEY` só no servidor. Domínio `checkflow.digital` verificado (SPF/DKIM).
- **Escalabilidade:** limite de envios por plano Resend. Deliverability depende de reputação do domínio.
- **Ação:** monitorar bounce; ter retry/fila se virar canal crítico de OTP.

### 2.7 Nominatim (OpenStreetMap) — reverse geocoding — 🟢 Baixa
**Papel:** converte lat/lng → endereço textual na atividade de **localização**. `operacao/[id]/page.tsx` → `nominatim.openstreetmap.org/reverse`.
- **Performance / gargalos:** chamado **do navegador** do operador. Nominatim público tem **política de uso justo (1 req/s)** e pode **bloquear** por volume → endereço não resolve.
- **Segurança:** expõe coordenadas do operador a um terceiro (OSM). Sem chave (anônimo).
- **Escalabilidade:** **não escala** no endpoint público — uso intenso = bloqueio/IP ban. 
- **Ação:** a coordenada (lat/lng) é guardada de qualquer forma; o endereço é só conveniência. Se virar volume, self-host Nominatim ou usar provedor com chave.

### 2.8 cron-job.org — gatilhos de cron externos — 🟡 Média
**Papel:** dispara 3 jobs HTTP (conta do usuário), todos com header `x-cron-secret: $CRON_SECRET`:
1. `POST /cron/parceiros/resumo-mensal` (1x/dia, age só no último dia do mês)
2. `POST /catalogos/sync-all` (sync de catálogos com `api_url`)
3. `POST /cron/limpeza-execucoes` (remove mídia expirada por tempo de guarda)
- **Performance:** jobs idempotentes; limpeza percorre execuções vencidas (lote).
- **Segurança:** protegidos por `CRON_SECRET` (antes `/catalogos/sync-all` estava **aberto**). Endpoints públicos — segurança = segredo compartilhado.
- **Escalabilidade:** dependência de um serviço gratuito de terceiro para tarefas críticas (limpeza de storage = custo). Se o cron parar, **storage cresce sem limpeza**.
- **Ação:** monitorar execução dos jobs; considerar mover para pg_cron / scheduler do Railway. Há também **pg_cron interno** (`processar-agendamentos`, */10min) — outra dependência de scheduler.

### 2.9 APIs externas de cliente (catálogo + import de usuários) — 🟢 Baixa / ⚠️ SSRF
**Papel:** sincronizar valores de catálogo e importar usuários a partir de uma **URL configurada pela empresa** (`api_url`). `/catalogos/{id}/sync`, `/catalogos/test-api`, `ImportarUsuariosModal` (aba API).
- **Segurança:** **superfície de SSRF** — o servidor faz `fetch` numa URL fornecida pelo cliente. `/catalogos/test-api` agora exige auth. ⚠️ Avaliar allowlist/bloqueio de IPs internos (169.254.x, 10.x, localhost) para evitar SSRF para a rede interna.
- **Performance / escalabilidade:** depende da API do cliente (timeout/lentidão). Sync em lote (upsert).
- **Ação:** validar/normalizar URL; timeout curto; bloquear ranges privados.

### 2.10 Embeds de vídeo (YouTube / Google Drive / Vimeo) — 🟢 Baixa
**Papel:** vídeos em documentos (POP/IT) e ajuda — `iframe` para YouTube/Drive/Vimeo. `lib/videoEmbed.ts`.
- **Segurança:** `iframe` de terceiro (sandbox do browser mitiga). Conteúdo depende de o vídeo ser público.
- **Escalabilidade/perf:** carregamento por conta das plataformas. Sem custo próprio.
- **Ação:** baixo risco. Garantir `referrerpolicy`/sandbox adequados nos iframes.

### 2.11 PWA / Service Worker / IndexedDB — offline (operação) — 🟡 Novo
**Papel:** instalação na tela inicial + execução offline da operação. `public/sw.js`, `lib/idb.ts`, `syncQueue.ts`, etc. (ver `/arch`).
- **Performance:** IndexedDB guarda **fotos como Blob** — cota do navegador (geralmente alguns GB, mas variável). Muitas execuções offline com mídia podem encher o storage do device.
- **Segurança:** dados de execução (incl. fotos) ficam **em claro no IndexedDB do aparelho** até sincronizar — risco se o device for comprometido/compartilhado. Sessão fica no `localStorage` (token de longa duração offline).
- **Escalabilidade:** fila de sync reenvia de forma idempotente (`execId` no cliente). Conflitos de execução agendada são bloqueados offline (exigem rede). Não há limite de itens na fila — em teoria, muitos pendentes = pressão na sincronização.
- **Ação:** **pendente teste real em campo**. Considerar limpeza/limite da fila e expiração de drafts antigos.

### 2.12 Geolocalização e Câmera (browser APIs) — 🟢 Baixa
**Papel:** GPS (checkin/atividade localização) e câmera/vídeo (`getUserMedia`/input capture). 
- **Segurança/permissões:** exigem HTTPS + consentimento. Negativa degrada graciosamente (checkin "sem localização"). Sem terceiro.
- **Performance:** compressão de imagem no cliente (1600px/JPEG 0.8) e vídeo (10s, 1.5Mbps) — CPU do device.

---

## 3. Dependências de bibliotecas com risco (npm)

| Pacote | Onde | Risco |
|---|---|---|
| `@react-pdf/renderer` | `/api/execucoes/[id]/pdf` (web) | **CPU/memória** na geração de PDF sob demanda — pico pode estourar o container |
| `@supabase/supabase-js` + `ws` | api + web | Em Node 20 (Railway) **exige** `{ realtime: { transport: ws } }` — sem isso crash 500 |
| `@google/generative-ai` | IA Gemini | Cota/429; SDK específico (os outros provedores são via `fetch`) |
| `qrcode` / `qrcode.react` | QR (pré-cadastro futuro) | Baixo |
| `react-easy-crop` | crop de imagem | CPU no cliente |
| `fastify` + `@fastify/cors` + `@fastify/helmet` | api | CORS **allowlist** (não refletir Origin — já corrigido); helmet ativo |
| `next` 16 / `react` 19 | web | Versões muito novas — breaking changes do Next 16 (params async, etc.) |

**Higiene:** rodar `npm audit` periodicamente; `apps/web` reportou 53 vulnerabilidades transitivas no ecossistema (em sua maioria do toolchain/dev) — revisar as de runtime.

---

## 4. Pontos únicos de falha (SPOF) e riscos transversais

| Risco | Impacto | Severidade |
|---|---|---|
| **Supabase** indisponível | App inteiro para | 🔴 |
| **Railway** indisponível | Todos os serviços fora | 🔴 |
| **RLS mal configurada em tabela nova** | Vazamento cross-tenant | 🔴 |
| **service-role sem `exigirAutorizacao`** | Bypass de RLS / IDOR | 🔴 (padrão já estabelecido) |
| **Webhook Asaas com token fraco** | Crédito de saldo forjado | 🟠 |
| **WhatsApp (Baileys) ban / sessão zombie** | Sem OTP/notificação WhatsApp | 🟠 |
| **cron-job.org parar** | Storage cresce sem limpeza; resumo de parceiros não roda | 🟡 |
| **Cota de IA / Resend / Nominatim** | Degradação de IA/email/geocoding | 🟡 |
| **SSRF** via `api_url` de catálogo/usuários | Acesso à rede interna | 🟡 |
| **IndexedDB no device** | Dados de execução em claro até sync | 🟡 |

**Cross-cutting:**
- **Segredos:** todos via env no Railway; GitHub Push Protection ativo. ⏳ rotacionar `EVOLUTION_API_KEY` (já esteve no git).
- **Observabilidade:** `/sistema/health` (DB/RLS/storage/uptime) + `/sistema/alertas`. Falta tracing distribuído e métricas por integração externa (latência/erro de Asaas/IA/WhatsApp).
- **Resiliência:** a maioria das integrações externas é **fire-and-forget sem retry/fila** (WhatsApp, email, notificações). Uma falha transitória = mensagem perdida silenciosamente.

---

## 5. Recomendações priorizadas

**Curto prazo (baixo esforço, alto valor):**
1. ⏳ **Rotacionar `EVOLUTION_API_KEY`** e `ASAAS_WEBHOOK_TOKEN`.
2. **Bloquear ranges privados** no `fetch` de `api_url` (catálogo/usuários) — anti-SSRF.
3. **Monitorar os 3 jobs do cron-job.org** (alerta se não rodarem) — limpeza de storage é custo direto.
4. **Healthcheck da sessão WhatsApp** (detectar "zombie" e reconectar).

**Médio prazo:**
5. **Fila + retry** para WhatsApp/email/notificações (hoje fire-and-forget).
6. **Connection pooling** no Supabase (Supavisor) antes de escalar usuários simultâneos.
7. **Métricas por integração externa** (latência/erro de Asaas, IA, WhatsApp, Nominatim) no dashboard.
8. **Reserva de IA** com cota (Claude/OpenAI em 2º, leem PDF).

**Longo prazo (escala):**
9. **WhatsApp Cloud API oficial** (Baileys não escala/homologa).
10. **pgvector/RAG** para a base de conhecimento da IA quando crescer.
11. **Self-host Nominatim** ou provedor com SLA se geolocalização virar volume.
12. **Multi-região / DR** além do backup do Supabase.
13. **Limites/expiração** na fila offline (IndexedDB) e criptografia dos blobs sensíveis no device.

---

## 6. Matriz rápida (performance × segurança × escalabilidade)

| Integração | Perf | Segurança | Escala | Tem fallback? |
|---|---|---|---|---|
| Supabase | 🟡 | 🟠 (RLS é tudo) | 🟡 | ❌ |
| Railway | 🟡 | 🟢 | 🟡 | ❌ |
| Evolution/WhatsApp | 🟠 | 🟡 | 🔴 | ❌ |
| Asaas | 🟢 | 🟡 | 🟢 | ❌ (não bloqueia op.) |
| IA (multi) | 🟠 | 🟡 | 🟡 | ✅ failover |
| Resend | 🟢 | 🟢 | 🟡 | ❌ |
| Nominatim | 🟠 | 🟢 | 🔴 | ✅ (degrada p/ lat/lng) |
| cron-job.org | 🟢 | 🟡 | 🟡 | ⚠️ pg_cron parcial |
| API cliente (catálogo) | 🟡 | 🟠 (SSRF) | 🟢 | ✅ (opcional) |
| PWA/IndexedDB | 🟡 | 🟡 | 🟡 | n/a |

Legenda: 🟢 ok · 🟡 atenção · 🟠 risco · 🔴 crítico.
