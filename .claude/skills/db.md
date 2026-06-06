---
name: db
description: Supabase and Postgres rules for CheckFlow. Use this skill whenever writing a migration, query, RLS policy, Edge Function, or any database schema change. Also trigger when the user asks about table structure, relationships, or how to store something in the database.
---

# Supabase & Postgres Rules

## Non-Negotiable Rules
- All primary keys: `UUID` with `gen_random_uuid()` default
- All column names: `snake_case`
- RLS: **enabled by default on every table** — no exceptions without explicit user approval
- Never write raw SQL in frontend code — always use the Supabase client or an Edge Function
- All schema changes go in `supabase/migrations/` as timestamped `.sql` files

## Migration File Naming
`supabase/migrations/YYYYMMDDHHMMSS_description.sql`

Generate the timestamp with: `(Get-Date -Format "yyyyMMddHHmmss")` (PowerShell)

## Current Tables (concise index)
- `profiles` — user profile data linked to `auth.users`
- `checklists` — checklist headers with versioning metadata
- `checklist_sections` — sections within a checklist
- `checklist_activities` — activities within sections, with dependencies
- `whatsapp_sessions` — Evolution API QR/session state per user

## Evolution Rule
When the user says "Update /db with new table [X]", add X to the table index above with a one-line description. If a migration was written, note the filename next to it.

**This skill is live.** When the user says "update skills with what we did today", add any new tables or RLS policy changes to this file.
