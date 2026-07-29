---
name: git
description: Git workflow rules for CheckFlow — branching strategy and commit conventions. Use whenever creating a branch, staging files, writing a commit message, or opening a PR. Trigger on any git operation so commits stay surgical and the history stays readable.
---

# Git Workflow

## Branch Strategy (atualizado 2026-07-24)
- `main` — **produção**. É **PROTEGIDO**: não aceita push direto (nem admin), só
  mergeia via **Pull Request** com o CI verde (check "Testes + typecheck"). Cada
  serviço de produção no Railway está com **auto-deploy DESLIGADO** → publicar exige
  clique manual em Deploy.
- `develop` — **branch de integração/dev**. É onde o trabalho do dia a dia acontece;
  alimenta o ambiente de teste (Supabase dev + `web-dev`/`api-dev` no Railway).
- `feat|fix|chore/<scope>/<short-name>` — sub-branches, mergeadas em **`develop`**.

Sempre criar sub-branch; mergear em `develop`, nunca direto em `main`.

## Ambientes e promoção → ver `/ops`, `docs/ops/AMBIENTES.md` e `docs/ops/PROCESSO_NOVA_FUNCIONALIDADE.md`
Fluxo: `feature/*` → `develop` (testa no ambiente dev) → **promoção via PR** para
`main` (CI obrigatório) → **deploy manual** no Railway. **Deploy às quartas-feiras**,
janela de baixo tráfego (fora disso, só hotfix crítico). O processo completo (da
necessidade ao pós-deploy, com as regras de não-interferência em produção) está em
`docs/ops/PROCESSO_NOVA_FUNCIONALIDADE.md`.

**Promover** (quando o usuário diz "sobe pra produção"):
1. Banco PRIMEIRO se houver migration nova: `npm run db:push:prod --sim`.
2. `gh pr create --base main --head develop --fill` → esperar CI **verde** → `gh pr merge --merge`.
3. `git checkout develop && git merge origin/main && git push` (re-sync).
4. Usuário clica **Deploy** no `web` e `api` de produção no Railway.

## Conventional Commits
Format: `type(scope): short description`

| Type | Use for |
|------|---------|
| `feat` | new feature |
| `fix` | bug fix |
| `chore` | tooling, deps, config |
| `refactor` | code restructure, no behavior change |
| `docs` | documentation only |

**Surgical commit scopes — always separate these:**
- `feat(db):` — migration or schema change only
- `feat(ui):` — frontend-only change
- `feat(api):` — Edge Function or server-side change

## Rules
- One logical change per commit — never mix DB + UI in a single commit
- Commit body (optional): explain *why*, not *what*
- Never force-push to `main`

**This skill is live.** When the user says "update skills with what we did today", check if a new branching pattern was established and record it here.
