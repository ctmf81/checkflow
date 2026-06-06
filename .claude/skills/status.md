---
name: status
description: Quick project status snapshot for CheckFlow. Run at the start of any session, after finishing a task, or whenever you need to re-orient. Trigger when the user says "what did we do?", "where are we?", "give me a status", or starts a new session and needs context fast.
---

# Project Status Snapshot

When invoked, silently execute:
```bash
git status -s
git log -n 5 --oneline
```

Then produce a summary of **at most 3 lines**:
```
Recently finished: [inferred from git log]
In progress now:   [inferred from git status]
Next logical step: [one-sentence inference, only if obvious]
```

## Rules
- Keep it telegraphic — no explanations, no extra headers
- If `git status -s` is clean, say "nothing in progress"
- Goal: full orientation in under 5 seconds

---

## Known Open Issues (atualizado 2026-06-06)

| # | Issue | Severidade |
|---|-------|-----------|
| 1 | WhatsApp QR Code ainda não funciona (Evolution API + Redis) | 🟠 Alto |
| 3 | `user` no SessionContext acessado via `as any` → pode ser undefined | 🟠 Alto |
| 4 | Checklist publicado pode ter atividades editadas (sem proteção no montador) | 🟡 Médio |
| 5 | Redirect para login ausente quando sessão expira na Operação | 🟡 Médio |

## Migrations aplicadas em produção (Supabase)
- `20260606000005_security_hardening.sql` ✅ aplicada
- `20260606000006_workflows.sql` ✅ aplicada

## Features entregues nesta sessão
- Inativar/Duplicar checklist (com picker de destino)
- Gravar vídeo via getUserMedia (sem galeria)
- Toggle exibir/ocultar referência em atividades sim_nao e numero
- Suporte decimal + fix máscara `0` como wildcard
- QA/security audit: 7 issues corrigidos (IDOR, hardcoded keys, RLS, RPC buscar_email_por_cpf)
- **Workflow completo**: schema + motor Postgres (trigger+função) + UI editor + execuções
- Resultado de execução (aprovado/reprovado) gravado em `checklist_execucoes.resultado`
- Operação: seção "Workflows em andamento", link `?wf_item=`, banner de contexto
- Fix N+1 em operacao/page.tsx (contagem de atividades em batch)

**This skill is live.** When the user says "update skills with what we did today", update the Known Open Issues table and sections acima.
