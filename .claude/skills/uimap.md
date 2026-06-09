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
| `/gestao/acessos/turnos` | `gestao/acessos/turnos/page.tsx` | Turnos (shift windows) — TurnoModal.tsx |
| `/gestao/configuracoes/documentos` | `gestao/configuracoes/documentos/page.tsx` | Document library |
| `/gestao/configuracoes/nao-execucao` | `gestao/configuracoes/nao-execucao/page.tsx` | Non-execution reasons |
| `/gestao/configuracoes/causa-raiz` | `gestao/configuracoes/causa-raiz/page.tsx` | Root causes |
| `/gestao/configuracoes/catalogos` | `gestao/configuracoes/catalogos/page.tsx` | Catalog management |
| `/gestao/agendamentos` | `gestao/agendamentos/page.tsx` | Recurring scheduler for workflows/checklists (NovoAgendamentoModal) |
| `/gestao/tickets` | `gestao/tickets/page.tsx` | Ticket listing — SLA semaphore, filter tabs (abertos/fechados/todos), summary cards |
| `/gestao/tickets/[id]` | `gestao/tickets/[id]/page.tsx` | Ticket timeline + contextual actions by status+role. Fixed footer with mandatory textarea + evidence upload |
| `/gestao/tickets/categorias` | `gestao/tickets/categorias/page.tsx` | Category tree CRUD (roots + children, create/edit/delete) |
| `/gestao/tickets/sla` | `gestao/tickets/sla/page.tsx` | SLA config per priority (unidade default + overrides per category) |
| `/gestao/configuracoes/notificacoes` | `gestao/configuracoes/notificacoes/page.tsx` | Notification template management — accordion by type, toggle active/inactive per canal, body/subject editor, available variable chips |
| `/gestao/workflows/[id]` | `gestao/workflows/[id]/page.tsx` | Workflow editor — PickerModal now has Grupo+Subgrupo selectors |
| `/gestao/configuracoes/formatacao` | `gestao/configuracoes/formatacao/page.tsx` | Label config |

### Operação — Mobile execution (`operacao/`)
Layout: `operacao/layout.tsx` — NO sidebar, OperacaoHeader with unit selector

| Route | File | Purpose |
|-------|------|---------|
| `/operacao` | `operacao/page.tsx` | Checklist listing grouped by grupo/subgrupo. FAB "Abrir Ticket" (avulso, sem vínculo) |
| `/operacao/[id]` | `operacao/[id]/page.tsx` | Full checklist execution screen |

### Sistema — Super-admin (`sistema/`)
Layout: `sistema/layout.tsx`

| Route | File | Purpose |
|-------|------|---------|
| `/sistema` | `sistema/page.tsx` | System overview |
| `/sistema/empresas/[id]` | `sistema/empresas/[id]/page.tsx` | Company details |
| `/sistema/whatsapp` | `sistema/whatsapp/page.tsx` | WhatsApp QR / Evolution API config |
| `/sistema/termos` | `sistema/termos/page.tsx` | Edita o Termo de Uso único (gera nova versão ao salvar) |

## Key Components (`apps/web/components/`)

### `tickets/`
| File | Purpose |
|------|---------|
| `NovoTicketModal.tsx` | Reusable modal — mobile-first, prioridade chips, grupo+subgrupo required, categoria/subcategoria, título, descrição, evidências. Calls `notificarTicket()` |

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
| `routes/whatsapp.ts` | POST /whatsapp/conectar, POST /whatsapp/status, POST /whatsapp/enviar, POST /whatsapp/recuperar-senha (WA + email, usa DB template) |
| `routes/tickets.ts` | POST /tickets/notificar — busca template do banco, fallback hardcoded, envia WA+email para subgrupo ou abridor+assignee |
| `routes/planos-acao.ts` | POST /planos-acao/notificar — N1 somente para aberto, N2 somente para enviado_n2 |
| `lib/whatsapp.ts` | Evolution API helper (enviarWhatsApp, enviarWhatsAppMidia, statusInstancia) |
| `lib/notificacao-templates.ts` | `buscarTemplate(sb, empresaId, tipo, canal)`, `renderizar(texto, vars)`, `empresaDeUnidade()`, `empresaDeSubgrupo()` |

## Supabase Migrations (`supabase/migrations/`)
See `/db` skill for full table index by migration file.

## Evolution Rule
When new pages or components are created, add them to the relevant table above.
