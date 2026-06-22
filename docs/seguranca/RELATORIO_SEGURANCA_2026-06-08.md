# Relatório de Segurança — CheckFlow
**Data:** 2026-06-08
**Escopo:** Web (`web-production-36880.up.railway.app`), API (`api-production-5bce.up.railway.app`), Supabase (Postgres/Auth/Storage/RLS)
**Metodologia:** Testes black-box via HTTP (`pentest/http_probe.mjs`) + suíte de RLS/controle de acesso (`pentest/run.mjs`, autenticada)

---

## Resumo Executivo

| Severidade | Qtd | Status |
|---|---|---|
| 🔴 Alta | 1 | ✅ Corrigida |
| 🟡 Média | 0 | — |
| 🟢 Baixa | 4 | ✅ 3 corrigidas / 1 aceita (infra) |
| ℹ️ Informativo | — | suíte RLS 29/29 ✅ |

Nenhuma vulnerabilidade crítica ou de alta severidade permanece em aberto. Todos os achados foram corrigidos no mesmo dia e validados em produção pós-deploy.

---

## 🔴 Achado 1 — CORS permitia origem arbitrária (Alta)

**Onde:** `apps/api/src/server.ts` — `@fastify/cors` configurado com `origin: true`
**Risco:** A API refletia o header `Origin` de qualquer requisição (`Access-Control-Allow-Origin: <origem do atacante>`), permitindo que **qualquer site externo** fizesse requisições cross-origin contra a API do CheckFlow com as credenciais do usuário logado — abrindo caminho para CSRF/exfiltração de dados via navegador da vítima.

**Evidência (antes):**
```
Origin: https://evil-attacker.example
→ Access-Control-Allow-Origin: https://evil-attacker.example
```

**Correção:** Substituído por allowlist explícita (`web-production-36880.up.railway.app`, `localhost:3000`, + `CORS_EXTRA_ORIGINS` via env). Commit `733a0fd`.

**Status:** ✅ Corrigido e validado — agora `Access-Control-Allow-Origin` não reflete mais origens fora da allowlist.

---

## 🟢 Achados 2–4 — Headers de segurança ausentes na Web (Baixa)

**Onde:** App Web (Next.js) não enviava:
- `Strict-Transport-Security` (HSTS) — risco de downgrade para HTTP em redes hostis
- `X-Frame-Options` / `frame-ancestors` (CSP) — risco de clickjacking
- `X-Content-Type-Options: nosniff` — risco de MIME-sniffing

(A API já tinha esses headers via `@fastify/helmet`.)

**Correção:** Adicionado `headers()` em `apps/web/next.config.ts` com HSTS, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin`. Commit `3ce612d`.

**Status:** ✅ Corrigido e **validado em produção** após deploy:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
```

---

## 🟢 Achado 5 — Banner de versão da infraestrutura exposto (Baixa, aceito)

**Onde:** Header `Server: railway-hikari` em todas as respostas (Web e API)
**Risco:** Vazamento mínimo de informação sobre a infraestrutura de hospedagem (Railway). Não revela versões da aplicação, framework ou linguagem.
**Decisão:** Aceito como risco residual — é controlado pela plataforma Railway, não pela aplicação, e não fornece informação acionável para um atacante.

---

## ✅ Testes que passaram sem ressalvas

- **Exposição de erro/path interno**: rotas inexistentes, `/.env`, `/.git/config` não vazam stack traces nem caminhos do servidor
- **TRACE**: método desabilitado na API
- **Cookies de sessão**: Supabase Auth usa JWT (não cookie de servidor) — menor superfície de roubo via atributos de cookie
- **TLS**: handshake validado pelo runtime para Web e API (certificados gerenciados pelo Railway)
- **XSS refletido**: payload `<svg onload=alert(1)>` em querystring não é refletido cru no HTML (Next.js escapa por padrão)
- **SQL Injection (heurística)**: payload `' OR '1'='1` não produz erro de SQL exposto
- **Acesso anônimo à API**: rotas `/usuarios`, `/empresas`, `/admin` retornam 404 (não expostas); `/health` não vaza dados sensíveis
- **RLS / controle de acesso multi-tenant** (`pentest/run.mjs`, 29/29 ✅): isolamento entre empresas/unidades, leitura/escrita de checklists, execuções, perfis e storage (`execucoes` bucket) — sem vazamento cross-tenant

---

## Recomendações futuras (não bloqueadoras)

1. Adicionar `Content-Security-Policy` mais restritiva na Web (atualmente coberta apenas indiretamente por `X-Frame-Options`)
2. Rodar `openssl s_client` periodicamente para validar expiração/hostname do certificado TLS (gerenciado pelo Railway, mas vale monitorar)
3. Considerar rodar a suíte `pentest/run.mjs` em pipeline de CI antes de cada deploy para produção

---

## Suítes utilizadas

| Suíte | Cobertura | Resultado |
|---|---|---|
| `pentest/http_probe.mjs` (novo, criado nesta sessão) | Headers, CORS, cookies, exposição de erro, XSS/SQLi heurístico, TLS, acesso anônimo | 1 falha → corrigida; demais ✅ |
| `pentest/run.mjs` | RLS/controle de acesso multi-tenant (autenticado) | 29/29 ✅ (última execução: 2026-06-07) |

**Como reproduzir:**
```bash
node pentest/http_probe.mjs
SUPABASE_URL="..." SUPABASE_ANON_KEY="..." SUPABASE_SERVICE_KEY="..." node pentest/run.mjs
```
