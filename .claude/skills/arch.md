---
name: arch
description: Apply and evolve the project's architecture rules (stack, conventions, file structure). Use this skill whenever generating any new code, component, hook, or module — even if the user doesn't say "follow the architecture". Also trigger when the user asks where to put a file, how to name something, or which library to use for state/forms/styling.
---

# Architecture & Stack Rules

## Current Stack
- **Frontend:** Next.js 16 App Router + React + TypeScript + Tailwind CSS
- **Mobile:** **PWA** (o próprio `apps/web` é instalável) — abandonou-se o app nativo React Native/Expo/EAS (ver `apps/mobile`, **ARQUIVADO**). Distribuição = "Adicionar à tela inicial", sem app store, sem APK.
- **Backend/DB:** Supabase (Postgres + Auth + Storage + RLS)
- **Hosting:** Railway (both `apps/web` and `apps/api`)
- **API:** Fastify (`apps/api/src/`) — handles WhatsApp/Evolution API proxy
- **Package manager:** npm (monorepo — root + apps/web + apps/api)
- **External:** Evolution API v2.2.3 (WhatsApp), Nominatim (reverse geocoding)

## PWA & Offline — EXCLUSIVO da área de operação
Pivô 2026-06-26: app web virou PWA instalável; execução de checklist funciona offline. **Offline é só `/operacao`** — gestão/sistema são sempre online.
- **Manifest:** `app/manifest.ts` (convenção App Router, `start_url: /operacao`, standalone, theme laranja). Ícones em `public/icon-*.png`.
- **Service worker:** `public/sw.js`, registrado por `components/pwa/PwaRegister.tsx` (no root layout; **desabilitado em dev**). Navegação offline (network-first + fallback) **só para `/operacao`**; nunca cacheia Supabase/`/api/`. Headers do sw.js em `next.config.ts` (no-cache).
- **Instalação:** `lib/pwaInstall.ts` (evento `beforeinstallprompt`, detecção standalone/iOS). Componente compartilhado `components/pwa/InstallAppButton.tsx` (botão "Instalar") nos headers da operação E gestão — **só aparece no navegador** (oculto quando standalone, via `isStandalone()`). O `DownloadAppModal` é o modal de instalação PWA. (Removida a opção "compartilhar".)
- **Camada offline (IndexedDB, `lib/idb.ts` — DB `checkflow` v4):** stores `execucao_drafts` (`offlineDraft.ts` — autosave de respostas), `checklist_defs` (`checklistCache.ts` — definição p/ render offline; `checklistFetch.ts` pré-baixa), `pending_submissions` (`syncQueue.ts` — fila de envio), `catalogo_cache` (`catalogoCache.ts` — valores de catálogo p/ a atividade tipo catálogo funcionar offline; **sem imagem**). Lista de checklists offline por unidade em localStorage (`offlineList.ts`).
- **Abrir a rota offline:** `operacao/page.tsx` pré-carrega cada `/operacao/[id]` num **iframe oculto** enquanto online (`preCarregarRotasOffline`) → o service worker cacheia HTML + chunks (prefetch sozinho não basta no App Router). Offline, abrir um checklist força **navegação completa** (`window.location`), servida do cache.
- **Sessão offline:** `SessionContext` usa `getSession()` (localStorage, sem rede) e reidrata empresa/unidade do cache `checkflow:session-ctx` quando `getUser()` falha offline. Login é **online-única** (senha exige servidor); operador loga no depósito e a sessão dura (Supabase time-box/inactivity = 0/never).
- **Submissão offline:** suporta execução simples **E plano de ação** (`syncQueue` replaya planos_acao + evidências + movimentação + causa_raiz, idempotente "criar-se-não-existe"). **Exigem conexão** (bloqueia offline): workflow e execução agendada (`?exec=`). Billing pulado offline; `execId` gerado no cliente (idempotência). Sync em `components/pwa/PendingSync.tsx` (operação layout).
- **Flag por checklist:** `checklists.permite_offline` (opt-in) controla o que aparece na lista offline. Toggle no `ChecklistMontador`. Migration `20260626000000` ✅ aplicada (2026-06-26).

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
