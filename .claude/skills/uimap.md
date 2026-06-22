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
| `/gestao/tarefas` | `gestao/tarefas/page.tsx` | Listas de tarefas (listagem + criar + modal indicadores) |
| `/gestao/tarefas/[id]` | `gestao/tarefas/[id]/page.tsx` | Montador da lista de tarefas (encerramento data/qtd, janela edição, grupos/subgrupos, itens c/ flags) |
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
| `/gestao/padrao/variaveis` | `gestao/padrao/variaveis/page.tsx` (+ `VariavelModal.tsx`) | Variáveis (atributos+valores) que compõem padrões — `variaveis`/`variavel_valores`, por unidade |
| `/gestao/padrao/padroes` | `gestao/padrao/padroes/page.tsx` | Listagem de padrões (validação combinatória), contagem de instâncias |
| `/gestao/padrao/criar` | `gestao/padrao/criar/page.tsx` | Criar/editar padrão: variáveis do padrão + instâncias (combinação→faixa min/max). `?id=` edita |

### Operação — Mobile execution (`operacao/`)
Layout: `operacao/layout.tsx` — NO sidebar, OperacaoHeader with unit selector

| Route | File | Purpose |
|-------|------|---------|
| `/operacao` | `operacao/page.tsx` | Checklist listing grouped by grupo/subgrupo. Seções no topo: 🔴 "Não finalizados" (em_andamento do operador → Continuar / Não executar c/ motivo), 🟡 Agendados pendentes, 🟣 Workflows. FAB "Abrir Ticket" (sobe acima do onboarding no desktop) |
| `/operacao/[id]` | `operacao/[id]/page.tsx` | Tela de execução. Carrega só após `unidadeAtiva` (evita race). `?exec=` retoma execução existente e **restaura respostas**. Modo `permite_continuar_depois`: botão "Continuar depois" (salva parcial) ou, se false, sem atalhos de sair |

### Sistema — Super-admin (`sistema/`)
Layout: `sistema/layout.tsx`

| Route | File | Purpose |
|-------|------|---------|
| `/sistema` | `sistema/page.tsx` | System overview |
| `/sistema/empresas/[id]` | `sistema/empresas/[id]/page.tsx` | Company details — abas Administrador/Pagamento/Parceiro/Configurações. Aba "Pagamento" (plano, valor_mensalidade, status_pagamento, vencimento) e aba "Parceiro" (vínculo com `parceiros`, `parceiro_percentual`, via `ParceiroModal`) persistem em `empresas` |
| `/sistema/parceiros` | `sistema/parceiros/page.tsx` | Listagem de parceiros (programa de indicação) — empresas vinculadas, plano, valor, percentual, comissão estimada/mês |
| `/sistema/whatsapp` | `sistema/whatsapp/page.tsx` | WhatsApp QR / Evolution API config. Botão "Trocar número / Desconectar" (com confirmação) → `POST /whatsapp/desconectar` → tela volta a oferecer QR |
| `/sistema/integracoes-ia` | `sistema/integracoes-ia/page.tsx` | Provedores de IA da Consulta Inteligente (failover): 4 fixos (Gemini/Claude/OpenAI/Groq) + 2 customizados OpenAI-compatible (base_url). Chave/modelo/ativo/ordem por provedor; chave mascarada (`••••1234`), nunca lida de volta. Tabela `ia_provedores` |
| `/sistema/termos` | `sistema/termos/page.tsx` | Edita o Termo de Uso único (gera nova versão ao salvar) |
| `/sistema/onboarding` | `sistema/onboarding/page.tsx` | Ativa/desativa e edita (JSON) o conteúdo do onboarding contextual de cada tela |

## Onboarding Contextual (`apps/web/components/onboarding/`)

| File | Purpose |
|------|---------|
| `Onboarding.tsx` | Wrapper — `<Onboarding pageId titulo cards />`. Renderiza painel + ícone "?" (canto inferior direito, oculto em mobile) |
| `OnboardingPanel.tsx` | Painel deslizante com cards (icon, titulo, texto, dicas?, fluxo?) |
| `OnboardingIcon.tsx` | Botão "?" fixo, reabre o painel |
| `registry.ts` | **`ONBOARDING_REGISTRY`** — lista central `{ pageId, titulo, cards }` de TODAS as telas. `getOnboardingConfig(pageId)` |
| `configs.ts` | Conteúdo "rico" original das 6 primeiras telas (importado pelo registry) |
| `hooks/useOnboarding.ts` | Estado local (localStorage `checkflow_onboarding_visto`) + busca `ativo`/`cards_override` na tabela `onboarding_paginas` |

Tabela `onboarding_paginas` (migration `20260610030000_onboarding_paginas.sql`): `page_id` (pk), `titulo`, `ativo`, `cards_override` (jsonb, null = usa o padrão do registry). Editável via `/sistema/onboarding` (somente `is_admin_sistema()`).

### ⚠️ Regra de evolução — toda tela/funcionalidade nova
1. Adicionar entrada em `registry.ts` (`pageId`, `titulo`, `cards`).
2. Renderizar `<Onboarding pageId={cfg.pageId} titulo={cfg.titulo} cards={cfg.cards} />` como primeiro elemento do JSX da página (via `getOnboardingConfig('pageId')!`).
3. Adicionar `insert ... on conflict do nothing` em uma migration para a nova `page_id` em `onboarding_paginas`.
4. Se a tela expõe um recurso/ação novo, adicionar em `apps/web/app/gestao/acessos/perfis/permissoes.ts`.

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
| `feedback.tsx` | **Sistema de feedback unificado** — `<FeedbackProvider>` (montado no root `app/layout.tsx`) + hooks `useToast()` (`.success/.error/.info`, toast canto inf. direito) e `useConfirm()` (`await confirm({ titulo, mensagem?, confirmarLabel?, perigo? })`, diálogo estilizado). **Substitui os `alert()`/`confirm()` nativos — usar SEMPRE estes em telas novas, nunca os do browser** |

### `layout/`
| File | Purpose |
|------|---------|
| `Sidebar.tsx` | Menu lateral da Gestão. Responsivo: drawer off-canvas no mobile (<lg), fixo no desktop. Só o item de rota mais específico fica ativo |
| `SidebarContext.tsx` | Estado do drawer mobile (`useSidebar()` / `useSidebarOptional()` p/ componentes compartilhados como o Header) |
| `Header.tsx` | Topo. Botão hambúrguer (lg:hidden) abre o drawer na Gestão; seletor de unidade/usuário/módulo |

### `modals/`
| File | Purpose |
|------|---------|
| `ParceiroModal.tsx` | Busca parceiro existente por e-mail ou cadastra novo (`ParceiroSelecionado` com flag `novo`) — usado na aba "Parceiro" de `/sistema/empresas/[id]` |

## Context & Lib
| File | Purpose |
|------|---------|
| `contexts/SessionContext.tsx` | Empresa, unidade, ambiente state + persistence to `sessao_usuario` |
| `lib/supabase.ts` | Supabase client singleton |

## API (`apps/api/src/`)
⚠️ Toda criação de client supabase-js na API precisa de `{ realtime: { transport: ws } }` (Node 20 no Railway não tem WebSocket nativo — sem isso crasha 500).

| File | Purpose |
|------|---------|
| `routes/whatsapp.ts` | POST /whatsapp/conectar, POST /whatsapp/status, POST /whatsapp/desconectar (logout da instância p/ troca de número), POST /whatsapp/enviar, POST /whatsapp/recuperar-senha (WA + email, usa DB template) |
| `routes/tickets.ts` | POST /tickets/notificar — busca template do banco, fallback hardcoded, envia WA+email para subgrupo ou abridor+assignee |
| `routes/planos-acao.ts` | POST /planos-acao/notificar — N1 somente para aberto, N2 somente para enviado_n2 |
| `routes/parceiros.ts` | POST /parceiros/boas-vindas (1x por parceiro), POST /cron/parceiros/resumo-mensal (protegido por `x-cron-secret`, último dia do mês) |
| `lib/whatsapp.ts` | Evolution API helper (enviarWhatsApp, enviarWhatsAppMidia, statusInstancia) |
| `lib/notificacao-templates.ts` | `buscarTemplate(sb, empresaId, tipo, canal)`, `renderizar(texto, vars)`, `empresaDeUnidade()`, `empresaDeSubgrupo()` |

## Supabase Migrations (`supabase/migrations/`)
See `/db` skill for full table index by migration file.

## Padrões de UX (obrigatórios em telas novas)
- **Escopo por unidade**: TODA listagem deve **respeitar o seletor global de unidade do header** filtrando a query por **`unidadeAtiva.id`** (cada tela = 1 unidade). NÃO adicionar seletor de unidade próprio na tela — o do header já vale p/ todo o app.
- **Feedback**: nunca usar `alert()`/`confirm()` nativos — usar `useToast()` e `useConfirm()` de `components/ui/feedback.tsx`. Toda ação destrutiva → `confirm({ perigo: true })`; todo salvar/erro → toast.
- **Verificar erro do Supabase** antes de dar feedback de sucesso (RLS falha em silêncio — retorna `data:[]`/`error`, não exceção).
- **Responsivo**: telas da Gestão devem funcionar no mobile (a sidebar já colapsa em drawer; usar paddings `p-4 sm:p-6 lg:p-8`).

## Adições 2026-06 (billing, templates, ajuda, IA)

### Novas rotas
| Rota | Arquivo | Propósito |
|------|---------|-----------|
| `/gestao/plano` | `gestao/plano/page.tsx` | Self-service do **admin da empresa**: plano & uso (via RPC `billing_status`), assinar/trocar plano, comprar pacote, cobranças. Banner de troca agendada |
| `/gestao/checklists/modelos` | `gestao/checklists/modelos/page.tsx` | **Galeria de modelos** por segmento (preview + "Usar" → `clonar_template`) |
| `/gestao/ajuda` | `gestao/ajuda/page.tsx` | Central de ajuda (visualizador por categoria, busca, vídeo embutido) |
| `/operacao/plano/[id]` | `operacao/plano/[id]/page.tsx` | Visão **somente-leitura** do plano de ação (mantém o operador na Operação) |
| `/sistema/planos` · `/sistema/pacotes` | `sistema/planos|pacotes/page.tsx` | CRUD do catálogo de planos e pacotes (admin) |
| `/sistema/templates` (+ `novo/montar`, `[id]/montar`) | `sistema/templates/**` | Curadoria de modelos (reusa `ChecklistMontador` em `modoTemplate`) + **"Gerar com IA"** |
| `/sistema/ajuda` | `sistema/ajuda/page.tsx` | CRUD dos artigos da central de ajuda |
| `/sistema/empresas/[id]` aba **Plano** | `sistema/empresas/[id]/AssinaturaEmpresa.tsx` | Admin atribui/troca plano da empresa (snapshot) + barras de uso |

⚠️ **Sistema agora tem menu lateral** (`sistema/layout.tsx` reescrito: `SistemaSidebar` + `SidebarProvider`, drawer mobile). O `ChecklistMontador` ganhou props `modoTemplate` + `baseRoute`.

### Novos componentes
| Arquivo | Propósito |
|---------|-----------|
| `components/onboarding/PrimeirosPassos.tsx` | Card "Primeiros passos" na Home (passos detectados do banco, dispensar via localStorage) |
| `components/ajuda/AssistenteAjuda.tsx` | Chat flutuante do assistente de IA (gestão) |
| `components/onboarding/Onboarding.tsx` | **Mudou**: só 1ª visita, sem ícone "?" persistente (usa o assistente de IA) |

### Novas rotas de API (apps/web)
| Rota | Propósito |
|------|-----------|
| `/api/ajuda` | Assistente de IA (failover `ia_provedores`, manual + artigos da central; não conta tokens do plano; loga falha em `ia_falhas`) |
| `/api/templates/gerar` | Gera template de checklist com IA (admin) → rascunho |
| `/api/execucoes/[id]/pdf` | Geração de PDF da execução **sob demanda** (chamada por botão) |

### apps/api
| Arquivo | Propósito |
|---------|-----------|
| `routes/billing.ts` | `/billing/assinar`, `/comprar-pacote`, `/webhook/asaas` (Asaas) |
| `lib/asaas.ts` | Cliente Asaas (env por ambiente: `ASAAS_API_KEY_SANDBOX/PROD`, `ASAAS_ENV`) |

### Diagnóstico de IA
`pentest/test-ia.mjs` (testa provedores) · `pentest/billing-templates-rls.mjs` (RLS das telas novas).

## Evolution Rule
When new pages or components are created, add them to the relevant table above.
