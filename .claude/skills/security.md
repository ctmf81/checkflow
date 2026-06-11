---
name: security
description: Cyber security rules and DevOps hardening for CheckFlow. Use whenever touching RLS policies, API keys, auth flows, storage rules, or running security tests. Also trigger on any mention of "pen test", "vulnerability", "IDOR", "RLS", "secret", "token", or "permission".
---

# Security & DevOps Hardening

## Non-Negotiable Rules
- **Nunca** hardcode chaves (`SUPABASE_SERVICE_KEY`, `EVOLUTION_API_KEY`, etc.) em código — sempre via `process.env`
- **Nunca** commitar `.env.local` ou qualquer arquivo com secrets — verificar `.gitignore` antes
- GitHub Push Protection está ativo — qualquer secret no commit será bloqueado
- RLS obrigatório em **todas** as tabelas de dados de usuário, sem exceção

## RLS — Padrão Obrigatório por Operação
Toda tabela com `unidade_id` precisa das 4 policies:

```sql
-- SELECT
create policy "X_leitura" on T for select using (
  is_admin_sistema() or unidade_id in (
    select unidade_id from usuario_unidade where usuario_id = auth.uid()
  )
);
-- INSERT
create policy "X_insert" on T for insert with check (
  is_admin_sistema() or unidade_id in (
    select unidade_id from usuario_unidade where usuario_id = auth.uid()
  )
);
-- UPDATE
create policy "X_update" on T for update using (
  is_admin_sistema() or unidade_id in (
    select unidade_id from usuario_unidade where usuario_id = auth.uid()
  )
);
-- DELETE (restrito a admin em tabelas de auditoria)
create policy "X_delete" on T for delete using ( is_admin_sistema() );
```

⚠️ **PostgREST não lança erro em UPDATE/DELETE bloqueado por RLS** — retorna `data: []` silenciosamente. Testes de segurança devem verificar se o dado realmente mudou no banco, não se houve exceção.

## Migrations — Sempre Idempotentes
```sql
drop policy if exists "nome" on tabela;   -- antes de cada create policy
create table if not exists ...;           -- em vez de create table
create index if not exists idx_nome on T; -- com nome explícito
drop trigger if exists nome on T;         -- antes de create trigger
```

## Pen Test Suite
Localização: `pentest/run.mjs`  
Execução:
```bash
SUPABASE_URL="..." SUPABASE_ANON_KEY="..." SUPABASE_SERVICE_KEY="..." node pentest/run.mjs
```
Cria usuários temporários, roda 29 testes e limpa tudo ao final.

**Cobertura atual (29/29 ✅ — última execução 2026-06-07, após fix do bucket público):**
| Categoria | Testes |
|-----------|--------|
| Acesso não autenticado (anon) | 5 |
| IDOR cross-tenant (SELECT/UPDATE/DELETE) | 6 |
| Escalada de privilégio | 4 |
| Storage (upload/delete por outros tenants) | 3 |
| RPC / funções security definer | 3 |
| Rotas /api sem autenticação | 3 |
| JWT manipulation (token inválido / assinatura corrompida) | 2 |
| Information disclosure / enumeração | 3 |

Rode o pen test após qualquer alteração de RLS ou nova tabela.

## HTTP Security Probe (black-box)
Localização: `pentest/http_probe.mjs` (criado 2026-06-08, sem credenciais de banco)
Execução:
```bash
node pentest/http_probe.mjs
```
Cobre: headers de segurança (HSTS/X-Frame-Options/nosniff), CORS, cookies de sessão, exposição de erro/path interno, TLS básico, XSS refletido (heurística), SQLi (heurística), acesso anônimo a rotas da API. Categorias adaptadas do relatório de pentest "SENAI CONECTA" (app externo) ao stack do CheckFlow.

Último resultado (2026-06-08, pós-correções): 25/26 pass — único warn residual é o banner `Server: railway-hikari` (infra Railway, aceito como risco residual). Relatório completo em `RELATORIO_SEGURANCA_2026-06-08.md`.

## Vulnerabilidades Corrigidas
| Data | Issue | Migration |
|------|-------|-----------|
| 2026-06-06 | IDOR: SELECT sem escopo de empresa em `usuarios` | 20260606000005 |
| 2026-06-06 | CPF lookup expunha tabela `usuarios` ao anon | 20260606000005 (RPC `buscar_email_por_cpf`) |
| 2026-06-06 | Chaves service role hardcoded em 3 rotas API | `api/usuarios/criar\|inativar\|importar` |
| 2026-06-06 | RLS storage sem escopo de unidade | 20260606000005 |
| 2026-06-06 | IDOR: UPDATE/DELETE sem escopo em `checklists` e `checklist_execucoes` | 20260606000007 |
| 2026-06-07 | Bucket `execucoes` com policy de leitura `to public` — anon listava (`list()`) evidências de execução de TODAS as empresas (28/29 no pentest) | 20260607110000 — substitui por policy `to authenticated` escopada por unidade (bucket continua `public=true` p/ não quebrar `getPublicUrl()`, mas listagem/enumeração agora exige vínculo com a unidade) |
| 2026-06-08 | CORS da API refletia qualquer `Origin` (`origin: true`) — qualquer site externo podia fazer requests cross-origin com credenciais do usuário (CSRF/exfiltração) | `apps/api/src/server.ts` — substituído por allowlist de origens conhecidas (commit `733a0fd`) |
| 2026-06-08 | Web sem headers de segurança (HSTS, X-Frame-Options/clickjacking, X-Content-Type-Options: nosniff) | `apps/web/next.config.ts` — adicionado `headers()` (commit `3ce612d`), validado em produção pós-deploy |

## RPCs Sensíveis (Security Definer)
| Função | Proteção | Migration |
|--------|----------|-----------|
| `buscar_email_por_cpf` | retorna só email, sem expor tabela `usuarios` ao anon | 20260606000005 |
| `excluir_empresa_cascata(p_empresa_id)` | exige `is_admin_sistema()` E `status = 'inativo'`; apaga em cascata (8 FKs ajustadas para `on delete cascade` em 20260610040000) | 20260610040000 |

⚠️ Padrão para novas RPCs `security definer`: sempre `revoke all ... from public` + `grant execute ... to authenticated`, e validar role/condições de negócio **dentro** da função (nunca confiar só na UI).

## Login por Código (OTP) — Anti-abuso (2026-06-10)
- `password_reset_tokens` (sem RLS, só service role) guarda apenas `codigo_hash` (sha256), nunca o código em texto puro
- Códigos de 6 dígitos, expiram em 15 min, máx. 5 tentativas (incrementa `tentativas` a cada erro)
- `/api/auth/solicitar-codigo` (self-service) sempre retorna mensagem genérica — não revela se o CPF existe; limite 3 envios/hora por usuário
- `/api/usuarios/resetar-senha` (gestor) exige Bearer token + `is_admin_sistema()` ou `usuario_tem_permissao('usuarios','editar')` (RPC chamada com client autenticado via header `Authorization`, para `auth.uid()` resolver corretamente); limite 5 envios/hora por usuário
- Token de sessão pós-verificação (`sessao_senha`) é de uso único e expira em 10 min — separa "validar código" de "definir senha"

## DevOps — Serviços Railway
| Serviço | URL | Notas |
|---------|-----|-------|
| Web (Next.js) | `web-production-36880.up.railway.app` | Branch `main` → auto-deploy |
| API (Fastify) | `api-production-5bce.up.railway.app` | WhatsApp proxy |

## Env Vars Necessárias (nomes, nunca valores)
| Var | Onde |
|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Railway + `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Railway + `.env.local` |
| `SUPABASE_SECRET_KEY` | Railway only |
| `NEXT_PUBLIC_API_URL` | Railway + `.env.local` |

## Evolution Rule
Ao corrigir uma vulnerabilidade: adicionar linha na tabela "Vulnerabilidades Corrigidas".  
Ao adicionar nova tabela com dados de usuário: adicionar políticas RLS completas (4 operations) e rodar pen test.
