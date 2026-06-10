# CheckFlow — Claude Code Guide

## Project Skills

This project has 11 active skills in `.claude/skills/`. They are **live** — update them at the end of each session by saying "update skills with what we did today".

| Command | Purpose |
|---------|---------|
| `/arch` | Architecture rules — stack, conventions, file structure |
| `/biz` | Business rules — product logic, flows, access rules |
| `/uimap` | Dynamic file index — locate components before touching code |
| `/db` | Supabase/Postgres rules — migrations, RLS, table index |
| `/ops` | Railway deploy — commands, log triage, env var safety |
| `/git` | Git workflow — branching strategy, Conventional Commits |
| `/status` | Session snapshot — last 5 commits + current modified files |
| `/security` | Cyber security — RLS patterns, pen test suite, vulnerabilities corrigidas |
| `/qa` | Quality Assurance — stack de testes, suites por tela/feature, como rodar |
| `/launch` | **Pre-launch checklist** — bloqueadores técnicos, planos/precificação, WhatsApp, IA, onboarding |
| `/queries` | Biblioteca de SQL pronto para gestão/suporte, organizado por tela/funcionalidade |

## Meta-Rule: Skill Auto-Evolution

At the end of any session, say:

> "Update skills with what we did today"

Claude will identify which files, tables, or rules changed in the session and rewrite the relevant skill files automatically, keeping them concise.

## Project Stack

- React + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth + Storage + RLS)
- Railway (hosting)
- Evolution API (WhatsApp integration)

## Key Constraints

- Never commit secrets or `.env` values
- Always use `supabase/migrations/` for schema changes
- RLS is mandatory on every user-data table
- Commits must be surgical: separate `db`, `ui`, and `api` changes
