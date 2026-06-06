---
name: ops
description: Railway deployment and DevOps for CheckFlow. Use when deploying the app, reading production logs, managing environment variables, or troubleshooting Railway services. Trigger on any mention of "deploy", "Railway", "logs", "env vars", or production issues.
---

# Railway & DevOps

## Deploy Commands
```bash
railway up           # deploy current branch to Railway
railway status       # check service health
railway logs         # stream live logs
railway logs --tail 20  # last 20 lines only
```

## Log Triage Rule
When debugging an error in logs: surface only the **last 20 lines** unless the user asks for more. Write a one-sentence summary of the error before showing raw lines.

## Environment Variables — Safety Rule
- **NEVER** print `.env` values or secret keys in the chat — not even partially masked
- Reference env vars by name only: `DATABASE_URL`, `SUPABASE_SERVICE_KEY`, `EVOLUTION_API_KEY`, etc.
- Secrets live in Railway dashboard (production) or `.env.local` (local, gitignored)
- `.env.local` is never committed — if it's not in `.gitignore`, add it immediately

## Services
- *(List Railway services here as they are created)*

## Evolution Rule
When a new service, env var name, or deploy command is established, add it here. Keep the file under 40 lines.

**This skill is live.** When the user says "update skills with what we did today", add any new Railway services or env var names (never values) discovered in this session.
