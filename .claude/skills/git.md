---
name: git
description: Git workflow rules for CheckFlow — branching strategy and commit conventions. Use whenever creating a branch, staging files, writing a commit message, or opening a PR. Trigger on any git operation so commits stay surgical and the history stays readable.
---

# Git Workflow

## Branch Strategy (atualizado 2026-07-29)
- `main` — **produção**. É **PROTEGIDO**: não aceita push direto (nem admin), só
  mergeia via **Pull Request** com o CI verde (check "Testes + typecheck").
  **✅ AUTO-DEPLOY LIGADO no Railway (2026-07-29)** — todo merge em `main` publica
  automaticamente em `web` e `api` de produção. **Sem clique manual.**
- `develop` — **branch de integração/dev**. É onde o trabalho do dia a dia acontece;
  alimenta o ambiente de teste (Supabase dev + `web-dev`/`api-dev` no Railway).
  **Auto-deploy também ligado** → merge em `develop` publica em dev automaticamente.
- `feat|fix|chore/<scope>/<short-name>` — sub-branches, mergeadas em **`develop`**.

Sempre criar sub-branch; mergear em `develop`, nunca direto em `main`.

## ⚠️ REGRA CRÍTICA — Nunca trabalhar local, sempre via git (2026-07-29)
**Feedback do usuário**: "eu nao quero nada local...é tudo no git. Tudo que eu
desenvolver vai do git para o dev."

- **NUNCA** fazer merge direto em `main` sem PR (a proteção da branch bloqueia, mas
  a intenção também é errada).
- **SEMPRE** criar sub-branch a partir de `develop` (não de `main`).
- **SEMPRE** abrir PR → `develop` primeiro, esperar CI, mergear.
- Só depois de o usuário dizer explicitamente **"coloque em produção"** / **"pode
  fazer o deploy"** → abrir PR `develop → main`.
- O usuário **não precisa clicar em nada no Railway** — auto-deploy resolve.

## Ambientes e promoção → ver `/ops`, `docs/ops/AMBIENTES.md` e `docs/ops/PROCESSO_NOVA_FUNCIONALIDADE.md`
Fluxo: `feature/*` → **PR → `develop`** (auto-publica em dev; usuário testa) →
usuário pede produção → **PR `develop → main`** (CI obrigatório) → **auto-publica
em prod**. O processo completo está em `docs/ops/PROCESSO_NOVA_FUNCIONALIDADE.md`.

**Desenvolver** (fluxo normal):
1. `git checkout develop && git pull origin develop`
2. `git checkout -b feat/<scope>/<nome>`
3. Commits cirúrgicos + testes + typecheck local.
4. `git push -u origin <branch>` → `gh pr create --base develop --head <branch>`
5. Esperar CI verde → `gh pr merge <n> --merge` → auto-publica em **dev**.

**Promover para produção** (só quando o usuário pedir explicitamente):
1. Banco PRIMEIRO se houver migration nova: `npm run db:push:prod --sim`.
2. `gh pr create --base main --head develop --fill` → esperar CI **verde**.
3. `gh pr merge --merge`. Se der conflito, resolver localmente:
   `git checkout main && git pull && git merge origin/develop` → resolver →
   `git commit` → `git push origin main`.
4. **Auto-deploy publica sozinho** — nada de clique manual.
5. `git checkout develop && git merge origin/main && git push` (re-sync).

## Deploy quando auto-deploy acabou de ser ligado
Se o auto-deploy foi ligado **depois** de commits já mergeados em `main`, o Railway
pode não publicá-los (só passa a reagir a commits novos). Nesse caso, um commit
mínimo em cada app cutuca o deploy — mas **cada serviço só rebuilda quando muda a
sua pasta** (`web` ⇒ `apps/web/**`, `api` ⇒ `apps/api/**`), então precisa tocar as
duas se quiser subir os dois. Deployments antigos com "SKIPPED — No changes to
watched files" confirmam esse filtro por path.

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
