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

Consulte `docs/auditoria-inconsistencias.md` para detalhes. Resumo de prioridade:

| # | Issue | Severidade |
|---|-------|-----------|
| 1 | `video` falta no CHECK CONSTRAINT do banco — migration `20260606000003_add_tipo_video.sql` criada mas NÃO aplicada | 🔴 Crítico |
| 2 | Respostas das atividades não são persistidas (tabela `checklist_execucao_respostas` não existe) | 🔴 Crítico |
| 3 | Foto e Vídeo não sobem para o Supabase Storage | 🔴 Crítico |
| 4 | Finalizar não valida campos obrigatórios | 🟠 Alto |
| 5 | `user` no SessionContext acessado via `as any` → pode ser undefined | 🟠 Alto |
| 6 | WhatsApp QR Code ainda não funciona (Evolution API + Redis) | 🟠 Alto |
| 7 | Checklist publicado pode ter atividades editadas (sem proteção no montador) | 🟡 Médio |
| 8 | Redirect para login ausente quando sessão expira na Operação | 🟡 Médio |

## Testes criados (Vitest — não instalado ainda)
```
apps/web/__tests__/operacao.validacao.test.ts  — calcularValidacao()
apps/web/__tests__/operacao.mascara.test.ts    — aplicarMascara()
apps/web/__tests__/operacao.video.test.ts      — isVideoAntigo()
apps/web/__tests__/execucao.expiracao.test.ts  — calcularDataExpiracao()
```
Para instalar: `npm install -D vitest @vitejs/plugin-react @testing-library/jest-dom jsdom`
Para rodar: `npx vitest run`

**This skill is live.** When the user says "update skills with what we did today", update the Known Open Issues table and the tests section.
