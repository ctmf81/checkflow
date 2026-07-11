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
| `/pre-cadastro/[empresaId]` | `(auth)/pre-cadastro/[empresaId]/page.tsx` | **Pré-cadastro público (QR)** — form anônimo insere `pre_cadastros` pendente; mostra nome/logo via RPC `empresa_publica` |

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
| `/gestao/acessos/usuarios` | `gestao/acessos/usuarios/page.tsx` | User management + **QR pré-cadastro** (`QrPreCadastroModal`) e **moderação** de pendentes com contador (`ModeracaoPreCadastroModal` → aprovar escolhe perfil+unidades e reusa `/api/usuarios/criar`) |
| `/gestao/acessos/perfis` | `gestao/acessos/perfis/page.tsx` | Access profiles |
| `/gestao/acessos/empresa` | `gestao/acessos/empresa/page.tsx` | Company/units config |
| `/gestao/acessos/turnos` | `gestao/acessos/turnos/page.tsx` | Turnos (shift windows) — TurnoModal.tsx |
| `/gestao/configuracoes/documentos` | `gestao/configuracoes/documentos/page.tsx` | Document library |
| `/gestao/configuracoes/nao-execucao` | `gestao/configuracoes/nao-execucao/page.tsx` | Non-execution reasons |
| `/gestao/configuracoes/causa-raiz` | `gestao/configuracoes/causa-raiz/page.tsx` | Root causes |
| `/gestao/configuracoes/catalogos` | `gestao/configuracoes/catalogos/page.tsx` | Catalog management |
| `/gestao/configuracoes/dashboards` | `gestao/configuracoes/dashboards/page.tsx` (+ `[id]/page.tsx`) | Dashboards de TV — lista + editor. Editor: config geral + link público + painéis (toggle **tipo** "Uma atividade / Checklist inteiro", cadeia grupo→subgrupo→checklist→[atividade], `alerta_silencio_horas` por painel) |
| `/painel/[token]` | `painel/[token]/page.tsx` | **Página PÚBLICA de TV (sem login)** — carrossel de painéis, polling. `Painel` ramifica por `grafico`; `ChecklistPainel` (placar/conformidade/top NC/tratamento/tempo médio) + gráficos de atividade + selo de frescor |
| `/gestao/agendamentos` | `gestao/agendamentos/page.tsx` | Recurring scheduler for workflows/checklists (NovoAgendamentoModal) |
| `/gestao/tickets` | `gestao/tickets/page.tsx` | Ticket listing — SLA semaphore, filter tabs (abertos/fechados/todos), summary cards |
| `/gestao/tickets/[id]` | `gestao/tickets/[id]/page.tsx` | Ticket timeline + contextual actions by status+role. Fixed footer com `EvidenciaPicker`. Banner "Aguardando sua resposta" no topo da listagem (abridor, 2026-07-05). Transferência com modal |
| `/gestao/execucoes/[id]` | `gestao/execucoes/[id]/page.tsx` | **Tela interativa da execução** (2026-07-06) — usa `ExecucaoViewer` ambiente=gestao. Foto amplia (lightbox), vídeo toca, planos clicáveis, Baixar PDF. Aberta pela seta da Home + "Ver execução completa" do plano |
| `/operacao/execucao/[id]` | `operacao/execucao/[id]/page.tsx` | Mesma tela interativa (`ExecucaoViewer` ambiente=operacao) — aberta pelo botão do Histórico da operação |
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
| `/operacao` | `operacao/page.tsx` | Checklist listing grouped by grupo/subgrupo. Seções no topo: 🔴 "Não finalizados", 🟡 Agendados, 🟣 Workflows. **OFFLINE**: monta a lista do cache (`offlineList.ts`) só com checklists `permite_offline`; online cacheia esses + pré-baixa definições. `agruparChecklists()` reusado online/offline |
| `/operacao/[id]` | `operacao/[id]/page.tsx` | Tela de execução. `?exec=` retoma execução. Modo `permite_continuar_depois`. **OFFLINE**: render do cache (`checklistCache`), autosave de respostas (`offlineDraft`), banner "sem conexão", `finalizar()` enfileira (`syncQueue`) quando offline (só execução simples; plano/workflow/agendada exigem rede) |
| aba Tickets (operação) | `operacao/AbaTickets.tsx` | Aba na `/operacao` (2026-07-05). Seções: Aguardando você (abridor · aguardando_informacao) · Para assumir (subgrupo) · Em tratamento comigo (assignee) · Encerrados recentes. Some se não há ticket |
| `/operacao/tickets/[id]` | `operacao/tickets/[id]/page.tsx` | Detalhe do ticket p/ operador (2026-07-05). Assumir 1-toque; menu de ações compacto; ⇄ transferir com "Atribuir a"; evidência miniatura+lightbox. Reusa `lib/tickets` |
| layout operação | `operacao/layout.tsx` | `OperacaoHeader` (botão **Instalar** PWA + Gestão só p/ perfil ≠ Operação) + `PendingSync`. `GestaoGuard` redireciona operador de `/gestao/tickets/[id]`→`/operacao/tickets/[id]` |

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
| `NovoTicketModal.tsx` | Reusable modal — mobile-first, prioridade chips, grupo+subgrupo required, categoria/subcategoria, título, descrição, evidências (`EvidenciaPicker`). Vincula evidência ao evento de abertura (`evento_id`). Calls `notificarTicket()` |
| `EvidenciaPicker.tsx` | Seletor de evidência: botões **Câmera** (`capture`) + **Galeria** (múltiplos). Valida tamanho via `lib/midia` (foto 10MB/vídeo 50MB). Usado em abertura/operação/gestão de ticket |

### `execucoes/`
| File | Purpose |
|------|---------|
| `ExecucaoViewer.tsx` | Tela interativa da execução (compartilhada gestão+operação, prop `ambiente`). Renderiza respostas por seção/tipo; foto→lightbox, vídeo→player, localização→mapa, planos→link. Busca `GET /api/execucoes/[id]/dados` (service role + checagem de acesso). Botão "Baixar PDF" chama `POST /api/execucoes/[id]/pdf` |

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

## PWA & Offline (`components/pwa/`, `lib/`, `public/`) — só operação
| File | Purpose |
|------|---------|
| `app/manifest.ts` | Web app manifest (PWA instalável, `start_url: /operacao`) |
| `public/sw.js` | Service worker — offline **só `/operacao`**; nunca cacheia Supabase/`/api/` |
| `components/pwa/PwaRegister.tsx` | Registra o SW (root layout, off em dev) + capta `beforeinstallprompt` |
| `components/pwa/PendingSync.tsx` | Processa a fila offline + indicador "N aguardando envio" (operação layout) |
| `lib/pwaInstall.ts` | Gerencia prompt nativo de instalação + detecção standalone/iOS |
| `lib/useOnlineStatus.ts` | Hook de status de conexão (online/offline) |
| `lib/idb.ts` | Acesso central ao IndexedDB (DB `checkflow` v3: `execucao_drafts`, `checklist_defs`, `pending_submissions`) |
| `lib/offlineDraft.ts` | Rascunho local de respostas (autosave, sem File) |
| `lib/checklistCache.ts` · `lib/checklistFetch.ts` | Snapshot da definição p/ render offline + busca/pré-cache |
| `lib/syncQueue.ts` | Fila de submissões offline (reenvio idempotente: header upsert + respostas delete/insert + **planos de ação**) |
| `lib/offlineList.ts` | Cache (localStorage) da lista de checklists offline por unidade |
| `lib/catalogoCache.ts` | Cache dos valores de catálogo (IndexedDB, sem imagem) p/ a atividade catálogo offline |
| `components/pwa/InstallAppButton.tsx` | Botão "Instalar" compartilhado (operação+gestão); só no navegador (oculto se standalone) |
| `components/layout/DownloadAppModal.tsx` | Modal de **instalação do PWA** (Android nativo / instruções iOS) |

## Context & Lib
| File | Purpose |
|------|---------|
| `contexts/SessionContext.tsx` | Empresa, unidade, ambiente state + persistence. **Offline-tolerante**: `getSession()` (sem rede) + reidrata do cache `checkflow:session-ctx` quando `getUser()` falha |
| `lib/supabase.ts` | Supabase client singleton |
| `lib/apiClient.ts` | `apiFetch(path, init)` — chamadas do navegador à API Fastify com Bearer do usuário (rotas internas autenticadas) |
| `lib/padrao.ts` · `lib/perfis.ts` · `lib/turnos.ts` · `lib/tarefas.ts` · `lib/tickets.ts` · `lib/visibilidade.ts` · `lib/midia.ts` | Lógica pura (validação/permissões/visibilidade/limites de mídia) — fonte única importada pelas telas + testes unit. `lib/tickets` = ações por status/papel (sem "corrigido parcial"/"improcedente" desde 2026-07-05) |
| `lib/painelDados.ts` | Lógica pura dos painéis de TV (sem I/O), importada por `/api/painel/[token]` + testes. Atividade: `montarLinha`/`montarPadrao`/`serieConformidade`/`composicaoDiaria`/`resumoExecucao`. Checklist: `placarChecklist`/`conformidadePorDiaExec`/`tempoMedioExecucao`/`topNaoConformes`/`resumoPlanos` |
| `components/layout/AvisoTurno.tsx` | Banner "fora do turno" (modo aviso) nos layouts gestão/operação |
| `components/planos-acao/CausaRaizModeracao.tsx` | Bloco de causa raiz + recorrência na moderação do plano (`/gestao/planos-acao/[id]`) |

## API (`apps/api/src/`)
⚠️ Toda criação de client supabase-js na API precisa de `{ realtime: { transport: ws } }` (Node 20 no Railway não tem WebSocket nativo — sem isso crasha 500).
`lib/apiAuth.ts` (`exigirAutorizacao`): guard das rotas internas — Bearer JWT (navegador) ou `x-internal-secret` (servidor).

| File | Purpose |
|------|---------|
| `routes/whatsapp.ts` | POST /whatsapp/conectar, POST /whatsapp/status, POST /whatsapp/desconectar (troca de número), POST /whatsapp/enviar, POST /whatsapp/enviar-codigo (OTP WA+email), **POST /cron/whatsapp/health** (x-cron-secret — alerta+email na mudança de estado, `ALERT_EMAIL`) |
| `routes/tickets.ts` | POST /tickets/notificar — template do banco (fallback hardcoded), WA+email. `aberto`→subgrupo; resto→abridor+assignee. **Link por perfil**: operador→`/operacao/tickets/[id]`, demais→`/gestao/tickets/[id]` |
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
