---
name: uimap
description: Dynamic UI and file index for the CheckFlow project. Use this skill before creating or editing any file to instantly locate existing pages, components, and hooks. Trigger whenever the user asks "where is X?", "which file handles Y?", or before touching any src/ file to avoid duplicating existing code.
---

# UI Map — Dynamic File Index

When invoked, silently run the following command and use the output to locate files:

```powershell
# Windows (PowerShell)
Get-ChildItem -Path src/pages, src/components, src/hooks, src/lib -Recurse -Depth 3 -File |
  Select-Object -ExpandProperty FullName
```

If those paths don't exist, fall back to:
```powershell
Get-ChildItem -Path src -Recurse -Depth 4 -Include *.tsx,*.ts -File |
  Select-Object -ExpandProperty FullName
```

## How to use the output
- Answer "where is the component for X?" before touching any file
- Use `@filename` references in your response so the user can click through
- Never guess a file path — always run the index command first
- If the file doesn't exist yet, confirm before creating it

## Known Structure (keep updated)
- `src/pages/` — route-level page files
- `src/components/` — reusable UI components
- `src/hooks/` — custom React hooks
- `src/lib/` — utilities, Supabase client, helpers
- `supabase/migrations/` — all DB migration files

**This skill is live.** When the user says "update skills with what we did today", update the Known Structure section if new folders were created.
