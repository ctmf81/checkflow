---
name: git
description: Git workflow rules for CheckFlow — branching strategy and commit conventions. Use whenever creating a branch, staging files, writing a commit message, or opening a PR. Trigger on any git operation so commits stay surgical and the history stays readable.
---

# Git Workflow

## Branch Strategy
- `main` — production-ready only; never commit directly here
- `feat/<scope>/<short-name>` — new features (e.g. `feat/ui/checklist-builder`)
- `fix/<scope>/<short-name>` — bug fixes (e.g. `fix/db/rls-policy`)
- `chore/<scope>/<short-name>` — non-functional changes (e.g. `chore/deps/update-supabase`)

Always create a sub-branch for new work.

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
