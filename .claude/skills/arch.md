---
name: arch
description: Apply and evolve the project's architecture rules (stack, conventions, file structure). Use this skill whenever generating any new code, component, hook, or module — even if the user doesn't say "follow the architecture". Also trigger when the user asks where to put a file, how to name something, or which library to use for state/forms/styling.
---

# Architecture & Stack Rules

## Current Stack
- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend/DB:** Supabase (Postgres + Auth + Storage + RLS)
- **Hosting:** Railway
- **Package manager:** npm

## Conventions
- File names: `PascalCase` for components, `camelCase` for utils/hooks, `kebab-case` for routes
- Imports: absolute paths via `@/` alias
- Styling: Tailwind utility classes only — no inline styles, no CSS modules unless justified
- State: React Query for server state, Zustand for local/UI state
- Forms: React Hook Form + Zod for validation

## Code Generation Rules
When generating any code:
1. Use TypeScript with explicit types — no `any`
2. Follow the file/folder structure already in `src/`
3. Co-locate component tests next to the component file
4. Export types from a shared `types/` folder when reused across modules

## Evolution Rule
If the user says "Update /arch with new rule [X]", rewrite this file adding X as a bullet under the relevant section. Keep it concise — bullets only, no prose.

**This skill is live.** When the user says "update skills with what we did today", check which stack decisions changed in this session and rewrite this file to reflect them.
