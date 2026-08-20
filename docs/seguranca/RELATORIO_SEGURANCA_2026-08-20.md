# Relatório de Segurança — 2026-08-20

Auditoria completa (externa + autenticada) contra ambientes DEV e PROD, seguida de hardening deployado no mesmo dia.

**TL;DR** — 72 checks executados · 62 PASS · 0 críticos · 3 findings acionáveis corrigidos e em prod (PRs #161/#162) · 38 testes unit novos.

---

## 1. Escopo da rodada

| Suite | Ambiente | Vetores | Resultado |
|---|---|---|---|
| Probe custom externo — `scratchpad/security-probe-dev.mjs` | DEV | 25 | 20 PASS · 4 INFO · 1 WARN · 0 CRIT |
| Suite oficial `pentest/http_probe.mjs` (adaptado p/ DEV) | DEV | 26 | 24 PASS · 2 WARN · 0 CRIT |
| Auth DB / RLS multi-tenant — `scratchpad/verify-rls-prod.mjs` | PROD (tx rollback) | 21 | 18 PASS · 3 INFO · 0 CRIT |
| Carga/DoS — `scratchpad/dos-probe-dev.mjs` | DEV | 7 cenários | Container dev reiniciou sob burst /health |
| Testes unit adicionados nesta rodada | Local + CI | 38 | 38/38 PASS |

**Base de testes:** 98 API + 634 web = **732 unit passando** (foi 694 antes desta sessão).

---

## 2. Externo / black-box

### Auth bypass (4 vetores)
- POST autenticada sem `Authorization` → `403`
- JWT com header/payload válido mas assinatura errada → `403`
- JWT `alg=none` (ataque clássico) → `403`
- `Bearer ` vazio → `403`

### SQL / prompt injection
- 4 payloads clássicos (`' OR '1'='1`, `'; DROP TABLE`, `pg_sleep`, URL-encoded) em `/parceiros/interesse` → `400` de validação, sem vazamento
- Prompt injection em `/checklists/gerar` sem auth → `404` (rota exige auth, comportamento correto)

### XSS / Header injection
- Payload `<script>` no body não é ecoado no error
- CRLF em header rejeitado pelo runtime

### CORS
- `Origin: https://evil.com` — `Access-Control-Allow-Origin` ausente (não reflete)
- Preflight `OPTIONS` de rota sensível com origin `evil` — ACAO nula

### Path traversal / parser
- `GET /../../../etc/passwd` → 404
- Body 10 MB → 413 (limite ativo)
- JSON aninhado 5000 níveis → 400

### Webhook spoofing
- `/billing/webhook/asaas` sem HMAC → `401`
- `/telegram/webhook` sem `X-Telegram-Bot-Api-Secret-Token` → `401`

### Info leak
- Body malformado não devolve stack trace
- `/health` não expõe secrets

### Headers (via `http_probe.mjs`)
| Header | WEB | API |
|---|---|---|
| HSTS | ✅ 1 ano | ✅ 1 ano |
| X-Frame-Options | ✅ SAMEORIGIN | ✅ SAMEORIGIN |
| X-Content-Type-Options | ✅ nosniff | ✅ nosniff |
| Server banner | ⚠️ `railway-hikari` (infra, aceito) | ⚠️ idem |
| Content-Security-Policy | ❌→✅ (corrigido nesta rodada) | ✅ (via helmet) |

---

## 3. Autenticado — RLS multi-tenant (21 vetores contra PROD)

Metodologia: conexão direta ao Postgres com transação forçada em rollback (`sql.begin` + throw). Cada teste seta `role authenticated` + `request.jwt.claims` de um usuário comum real da Empresa Demo (mesmo mecanismo que o PostgREST usa em runtime) e tenta ataque contra Empresa Enviro.

### IDOR cross-empresa (5/5 blocked)
`SELECT` em `empresas`, `checklists`, `tickets`, `checklist_execucoes`, `usuarios` da empresa alheia → 0 rows.

### Tabelas admin-only (4/4 blocked)
`empresa_financeiro` (valores/parceiros), `parceiros` (KYC), `empresa_assinaturas` (Asaas customer ID), `empresa_cobrancas` — todas retornam 0 rows para usuário comum.

### Writes cross-empresa (2/2 blocked)
- `INSERT checklists` na unidade de B → `42501 insufficient_privilege`
- `UPDATE checklists` de B → 0 rows afetadas

### Privilege escalation (4/4 blocked)
- Self-promote `perfil_id = admin_sistema` em `usuario_empresa` → 0 rows
- Auto-vincular à empresa B como admin (`INSERT usuario_empresa`) → `P0001` (trigger)
- Conceder permissão ao próprio perfil (`INSERT perfil_permissoes`) → `42501`
- Criar perfil `is_system=true` → `42501`

### SECURITY DEFINER functions (funcionam corretamente)
- `is_admin_sistema()` do usuário comum → `false`
- `usuario_tem_permissao('checklists','criar')` → `false` (perfil sem permissão)

### Mutação de perfis is_system (2/2 blocked)
- Mudar `is_system` p/ true → 0 rows
- Apagar perfil `is_system` → 0 rows

---

## 4. Carga / DoS (DEV)

| Cenário | Antes | Depois do fix |
|---|---|---|
| 200x `/health` paralelas | 29 ok / 171 503 (esgotou pool Supabase) | 100/100 ok (cache 10s + coalesce) |
| 200x `/parceiros/interesse` (400 validação) | 200/200 ok | 200/200 ok |
| 200x `/billing/link` (403 rápido) | 200/200 ok | 200/200 ok |
| Web SSR 100 paralelas | 100/100 ok | 100/100 ok |
| Sustained 5×100 no `/health` | 35–47% ok, container reiniciou | 100% ok |

**Observação:** carga expôs que o `/health` (3 checks Supabase por request) não sobrevivia a burst do healthcheck do Railway em plano Hobby. Cache eliminou.

---

## 5. Findings acionáveis — todos CORRIGIDOS em prod

| # | Finding | Fix | PR |
|---|---|---|---|
| 1 | Web sem `Content-Security-Policy` | CSP configurado em `apps/web/next.config.ts` — scopes p/ Supabase (REST+Realtime), Railway, Asaas, Google Fonts; `frame-ancestors 'self'`; `object-src 'none'` | #161 / #162 |
| 2 | `/parceiros/interesse` público sem rate limit (aguentava 200 req/s de spam) | Lib pura `criarRateLimiter` extraída (6 tests) + 10 req/60s por IP na rota | #161 / #162 |
| 3 | `/health` esgotava pool Supabase sob burst | Cache 10s + coalesce de inflight | #161 / #162 |

**Validado pós-deploy:** CSP header presente · rate limit dispara `429` na 11ª req · burst 100 no /health = 100% 200.

---

## 6. Testes unit adicionados nesta rodada

Cobertura de lógica pura que não tinha teste:

- `apps/api/src/lib/rateLimit.test.ts` — 6 testes (janela deslizante, chaves independentes, fail-open, housekeeping, boundaries)
- `apps/web/lib/entitlements/assinaturaFase.test.ts` — 11 testes (`podeCriarConteudo` fase ativa vs carência vs bloqueada, fail-closed; `estadoAssinaturaGate` p/ admin vs comum, pronto vs carregando)
- `apps/web/lib/entitlements/gating.test.ts` — 21 testes (`planoLiberaRecurso`, `planoLiberaFlag`, `itemVisivelNoMenu` — 7 cenários; `recursoVisivelNoPerfil`; `resolverAcoesRelatorios` admin_sistema/admin_empresa/comum/sem-perms)

Total no repositório após esta sessão: **732 testes passando (98 API + 634 web)**.

---

## 7. Warnings / findings NÃO críticos (aceitos como risco residual ou baixa prioridade)

- `Server: railway-hikari` no banner de resposta — infra Railway, aceito.
- Sem rate limit em outros endpoints públicos além de `/parceiros/interesse` — próximo alvo seria `/auth/*` do Supabase (que já tem limit próprio do GoTrue).
- Uptime seconds do `/health` reseta a cada deploy — comportamento esperado.

---

## 8. Comparação com rodadas anteriores

| Rodada | Escopo | Achados críticos | Findings acionáveis |
|---|---|---|---|
| 2026-06-08 ([RELATORIO_SEGURANCA_2026-06-08.md](RELATORIO_SEGURANCA_2026-06-08.md)) | Black-box HTTP, RLS bucket, CORS refletido | 2 (bucket público + CORS `origin: true`) | Corrigidos no mesmo dia |
| 2026-07-19 ([RELATORIO_SEG_PERF_2026-07-19.md](RELATORIO_SEG_PERF_2026-07-19.md)) | Perf + seg em conjunto | 0 críticos, alertas de gestão | Corrigidos |
| **2026-08-20** (este) | Ext + auth + RLS + DoS | **0** | **3 corrigidos e em prod** |

---

## 9. Próximos passos sugeridos (baixa prioridade)

- Re-rodar `pentest/run.mjs` (29 testes com usuários temporários — precisa `SUPABASE_SERVICE_KEY`) — última execução 2026-06-12 (48/48). Muita coisa mudou desde (gates de permissão em 18 telas, RLS via SECURITY DEFINER, billing pro-rata).
- Adicionar rate limit em `/auth/*` do lado da API (defesa em profundidade — Supabase já limita, mas nossa camada pode contribuir).
- Rodar `pentest/scale-rls-100-companies.mjs` — validar RLS ainda escala.

---

*Gerado em 2026-08-20. Scripts fonte: `scratchpad/security-probe-dev.mjs`, `scratchpad/http_probe_dev.mjs`, `scratchpad/verify-rls-prod.mjs`, `scratchpad/dos-probe-dev.mjs`. Ver skill `/security` para o histórico completo.*
