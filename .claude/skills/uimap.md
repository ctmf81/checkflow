---
name: uimap
description: Dynamic UI and file index for the CheckFlow project. Use this skill before creating or editing any file to instantly locate existing pages, components, and hooks. Trigger whenever the user asks "where is X?", "which file handles Y?", or before touching any src/ file to avoid duplicating existing code.
---

# UI Map — File Index

## App Router Structure (`apps/web/app/`)

### Auth (`(auth)/`)
| Route | File | Purpose |
|-------|------|---------|
| `/login` | `(auth)/login/page.tsx` | Login form |
| `/recuperar-senha` | `(auth)/recuperar-senha/page.tsx` | Request password reset |
| `/nova-senha` | `(auth)/nova-senha/page.tsx` | Set new password |

### Gestão — Backoffice (`gestao/`)
Layout: `gestao/layout.tsx` — sidebar + SessionProvider

| Route | File | Purpose |
|-------|------|---------|
| `/gestao` | `gestao/page.tsx` | Dashboard |
| `/gestao/checklists` | `gestao/checklists/page.tsx` | Checklist listing (uses Suspense for useSearchParams) |
| `/gestao/checklists/novo` | `gestao/checklists/novo/page.tsx` | New checklist form |
| `/gestao/checklists/novo/montar` | `gestao/checklists/novo/montar/page.tsx` | Builder for new |
| `/gestao/checklists/[id]` | `gestao/checklists/[id]/page.tsx` | Edit checklist meta |
| `/gestao/checklists/[id]/montar` | `gestao/checklists/[id]/montar/page.tsx` | Builder for existing |
| `/gestao/grupos` | `gestao/grupos/page.tsx` | Grupos list |
| `/gestao/grupos/[id]/subgrupos` | `gestao/grupos/[id]/subgrupos/page.tsx` | Subgrupos |
| `/gestao/acessos/usuarios` | `gestao/acessos/usuarios/page.tsx` | User management |
| `/gestao/acessos/perfis` | `gestao/acessos/perfis/page.tsx` | Access profiles |
| `/gestao/acessos/empresa` | `gestao/acessos/empresa/page.tsx` | Company/units config |
| `/gestao/configuracoes/documentos` | `gestao/configuracoes/documentos/page.tsx` | Document library |
| `/gestao/configuracoes/nao-execucao` | `gestao/configuracoes/nao-execucao/page.tsx` | Non-execution reasons |
| `/gestao/configuracoes/causa-raiz` | `gestao/configuracoes/causa-raiz/page.tsx` | Root causes |
| `/gestao/configuracoes/turnos` | `gestao/configuracoes/turnos/page.tsx` | Turnos (shift windows) — TurnoModal.tsx |
| `/gestao/configuracoes/catalogos` | `gestao/configuracoes/catalogos/page.tsx` | Catalog management |
| `/gestao/agendamentos` | `gestao/agendamentos/page.tsx` | Recurring scheduler for workflows/checklists (NovoAgendamentoModal) |
| `/gestao/workflows/[id]` | `gestao/workflows/[id]/page.tsx` | Workflow editor — PickerModal now has Grupo+Subgrupo selectors |
| `/gestao/configuracoes/formatacao` | `gestao/configuracoes/formatacao/page.tsx` | Label config |

### Operação — Mobile execution (`operacao/`)
Layout: `operacao/layout.tsx` — NO sidebar, OperacaoHeader with unit selector

| Route | File | Purpose |
|-------|------|---------|
| `/operacao` | `operacao/page.tsx` | Checklist listing grouped by grupo/subgrupo |
| `/operacao/[id]` | `operacao/[id]/page.tsx` | Full checklist execution screen |

### Sistema — Super-admin (`sistema/`)
Layout: `sistema/layout.tsx`

| Route | File | Purpose |
|-------|------|---------|
| `/sistema` | `sistema/page.tsx` | System overview |
| `/sistema/empresas/[id]` | `sistema/empresas/[id]/page.tsx` | Company details |
| `/sistema/whatsapp` | `sistema/whatsapp/page.tsx` | WhatsApp QR / Evolution API config |

## Key Components (`apps/web/components/`)

### `checklists/`
| File | Purpose |
|------|---------|
| `ChecklistMontador.tsx` | Drag-and-drop checklist builder (sections + activities). Includes tempo_guarda selector |
| `AtividadeModal.tsx` | Modal to add/edit an activity. Defines available types in `TIPOS[]` |

### `ui/`
| File | Purpose |
|------|---------|
| `Button.tsx` | Shared button component |

## Context & Lib
| File | Purpose |
|------|---------|
| `contexts/SessionContext.tsx` | Empresa, unidade, ambiente state + persistence to `sessao_usuario` |
| `lib/supabase.ts` | Supabase client singleton |

## API (`apps/api/src/`)
| File | Purpose |
|------|---------|
| `routes/whatsapp.ts` | POST /whatsapp/conectar, POST /whatsapp/status, POST /whatsapp/enviar |
| `lib/whatsapp.ts` | Evolution API helper (enviarWhatsApp, statusInstancia) |

## Supabase Migrations (`supabase/migrations/`)
See `/db` skill for full table index by migration file.

## Evolution Rule
When new pages or components are created, add them to the relevant table above.
