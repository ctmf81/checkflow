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

**Cobertura atual (29/29 ✅ — última execução 2026-06-06):**
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

## Vulnerabilidades Corrigidas
| Data | Issue | Migration |
|------|-------|-----------|
| 2026-06-06 | IDOR: SELECT sem escopo de empresa em `usuarios` | 20260606000005 |
| 2026-06-06 | CPF lookup expunha tabela `usuarios` ao anon | 20260606000005 (RPC `buscar_email_por_cpf`) |
| 2026-06-06 | Chaves service role hardcoded em 3 rotas API | `api/usuarios/criar\|inativar\|importar` |
| 2026-06-06 | RLS storage sem escopo de unidade | 20260606000005 |
| 2026-06-06 | IDOR: UPDATE/DELETE sem escopo em `checklists` e `checklist_execucoes` | 20260606000007 |

## DevOps — Serviços Railway
| Serviço | URL | Notas |
|---------|-----|-------|
| Web (Next.js) | `checkflow-production-b19d.up.railway.app` | Branch `main` → auto-deploy |
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
