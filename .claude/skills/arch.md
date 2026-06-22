---
name: arch
description: Apply and evolve the project's architecture rules (stack, conventions, file structure). Use this skill whenever generating any new code, component, hook, or module — even if the user doesn't say "follow the architecture". Also trigger when the user asks where to put a file, how to name something, or which library to use for state/forms/styling.
---

# Architecture & Stack Rules

## Current Stack
- **Frontend:** Next.js 16 App Router + React + TypeScript + Tailwind CSS
- **Backend/DB:** Supabase (Postgres + Auth + Storage + RLS)
- **Hosting:** Railway (both `apps/web` and `apps/api`)
- **API:** Fastify (`apps/api/src/`) — handles WhatsApp/Evolution API proxy
- **Package manager:** npm (monorepo — root + apps/web + apps/api)
- **External:** Evolution API v2.2.3 (WhatsApp), Nominatim (reverse geocoding)

## Monorepo Layout
```
checkFlow/
├── apps/
│   ├── web/          ← Next.js 16 App Router
│   │   ├── app/      ← routes (App Router convention)
│   │   │   ├── (auth)/       ← login, recuperar-senha, nova-senha
│   │   │   ├── gestao/       ← admin backoffice (sidebar layout)
│   │   │   │   └── workflows/
│   │   │   │       ├── page.tsx             ← listagem
│   │   │   │       ├── novo/page.tsx        ← re-export do editor com id='novo'
│   │   │   │       └── [id]/
│   │   │   │           ├── page.tsx         ← editor visual (criar + editar)
│   │   │   │           └── execucoes/page.tsx ← acompanhamento de execuções
│   │   │   ├── operacao/     ← mobile-first execution area (no sidebar)
│   │   │   └── sistema/      ← super-admin area
│   │   ├── components/
│   │   │   ├── checklists/   ← ChecklistMontador, AtividadeModal
│   │   │   └── ui/           ← Button, etc.
│   │   ├── contexts/
│   │   │   └── SessionContext.tsx ← empresa, unidade, ambiente state
│   │   └── lib/
│   │       └── supabase.ts
│   └── api/          ← Fastify REST API
│       └── src/
│           ├── routes/whatsapp.ts
│           └── lib/whatsapp.ts
└── supabase/
    └── migrations/   ← ALL schema changes here (timestamped .sql)
```

## Next.js 16 Breaking Changes (CRITICAL)
- `params` in page components is **async** — always `use(params)` in Client Components
- `useSearchParams()` **must** be wrapped in `<Suspense>` during static build
- No `export const runtime = 'edge'` without explicit user request

## Conventions
- File names: `PascalCase` for components, `camelCase` for utils/hooks, `kebab-case` for routes
- Imports: absolute paths via `@/` alias
- Styling: Tailwind utility classes only — no inline styles, no CSS modules
- State: local `useState` for UI; `useSession()` for empresa/unidade context
- Forms: no library currently — plain controlled inputs

## Activity Types (checklist_atividades.tipo)
DB constraint enforces these values. When adding a new type, **must** update:
1. Migration: add to the `check` constraint in `checklist_atividades`
2. `AtividadeModal.tsx` — `TIPOS` array + `TIPO_CONFIG_MODAL`
3. `ChecklistMontador.tsx` — `TIPO_LABELS` + `TIPO_CONFIG`
4. `operacao/[id]/page.tsx` — `TIPO_CONFIG` + new field component + dispatcher

Current types: `sim_nao`, `numero`, `texto`, `multipla_escolha`, `catalogo`, `foto`, `video`, `assinatura`, `data_hora`, `localizacao`

✅ `video` está no frontend e no DB constraint (migration `20260606000003` aplicada).

## Code Generation Rules
1. TypeScript with explicit types — minimize `any`
2. Follow the file/folder structure above
3. Never commit secrets or `.env` values
4. RLS is mandatory on every user-data table

## Autorização (modelo app-wide)
- **A barreira de autorização é a RLS no Postgres**, não a UI. O Sidebar da Gestão é **estático** (mostra todos os itens) e as telas **não** escondem/desabilitam ações (Criar/Editar/Excluir) conforme as permissões do usuário. Quem não pode agir toma erro da RLS ao tentar.
- Não existe hook client-side de permissão (`usePermissao`); a tabela `permissoes`/`perfil_permissoes` define os acessos mas o gating é no banco.
- Consequência p/ revisão: "botão aparece pra todo mundo" **não é bug de tela** — é o padrão. Só vale corrigir com decisão app-wide (gating uniforme), nunca ad-hoc numa tela.
- Exceção: lógica sensível tem trigger dedicado (ex: `validar_troca_perfil` em `usuario_empresa` — só admin atribui perfil não público; ⚠️ só em UPDATE, não em INSERT).

## Evolution Rule
When the user says "update skills with what we did today", check which stack decisions changed and rewrite this file to reflect them. Keep bullets concise — no prose paragraphs.
