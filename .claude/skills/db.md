---
name: db
description: Supabase and Postgres rules for CheckFlow. Use this skill whenever writing a migration, query, RLS policy, Edge Function, or any database schema change. Also trigger when the user asks about table structure, relationships, or how to store something in the database.
---

# Supabase & Postgres Rules

## Non-Negotiable Rules
- All primary keys: `UUID` with `gen_random_uuid()` or `uuid_generate_v4()`
- All column names: `snake_case`
- RLS: **enabled by default on every table** — no exceptions without explicit user approval
- Never write raw SQL in frontend code — always use the Supabase client
- All schema changes go in `supabase/migrations/` as timestamped `.sql` files

## Migration File Naming
`supabase/migrations/YYYYMMDDHHMMSS_description.sql`
Generate timestamp: `(Get-Date -Format "yyyyMMddHHmmss")` (PowerShell)

## Common Gotchas
- Table is `usuario_unidade` (singular), not `usuario_unidades`
- `checklist_atividades.obrigatoria` is feminine — not `obrigatorio`
- `gen_random_uuid()` vs `uuid_generate_v4()` — both work, prefer `gen_random_uuid()` for new tables
- Generated columns cannot use subqueries — compute derived values in application code
- RLS `using` clause for unit-scoped tables: `unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())`
- `plano_acao_movimentacoes`/`plano_acao_movimentacao_evidencias` usam `created_at` (não `criado_em`) — ao embutir via PostgREST use alias `criado_em:created_at` se o front espera esse nome (bug corrigido em 2026-06-14, `operacao/page.tsx`)
- `grupos`/`subgrupos` só tinham policy "meu grupo" (`usuario_grupo`/`usuario_subgrupo`) — mesmo padrão sistêmico do `usuario_unidade`. Adicionadas `grupos_unidade_membro`/`subgrupos_unidade_membro` (20260614060000) para listar TODOS os grupos/subgrupos da unidade (necessário p/ transferência de ticket)
- ⚠️ **`usuarios.cpf` está armazenado de forma MISTA** — parte com máscara (`XXX.XXX.XXX-XX`), parte só dígitos (legado). O login compara o valor **formatado**; rotas de OTP tiravam a máscara → não batia → "CPF não encontrado". Ao buscar por CPF, tolere ambos: `cpfVariantes(cpf)` (em `apps/web/lib/passwordReset.ts`) devolve `[soDigitos, mascarado]` e as rotas usam `.in('cpf', cpfVariantes(cpf))` em vez de `.eq`. (descoberto 2026-06-29)

## Table Index

### Tenant & Auth
| Table | Description |
|-------|-------------|
| `empresas` | Top-level tenants. Exclusão definitiva via RPC `excluir_empresa_cascata(p_empresa_id)` (somente `is_admin_sistema()`, somente status `inativo`) — 20260610040000 ajustou FKs para `on delete cascade`. ⚠️ As colunas financeiras (parceiro_id, parceiro_percentual, plano, valor_mensalidade, status_pagamento, pagamento_vencimento) foram **movidas para `empresa_financeiro`** em 20260613002351 (eram expostas a membros pela policy `empresas_membro`) |
| `empresa_financeiro` | 1:1 com `empresas` (`empresa_id` PK/FK on delete cascade). Dados contratuais/financeiros: `parceiro_id` (FK→parceiros), `parceiro_percentual` (0-100), `plano`, `valor_mensalidade`, `status_pagamento` (em_dia/pendente/inadimplente/cancelado), `pagamento_vencimento`. **RLS admin-only** — membros não têm acesso. Editado na aba Pagamento/Parceiro de `/sistema/empresas/[id]` (upsert por empresa_id); lido pela rota de parceiros e `/sistema/parceiros` |
| `unidades` | Units within a company (`empresa_id`, `grupo_label`, `subgrupo_label`) |
| `usuarios` | App users linked to `auth.users`. `cpf` (login, único) e `telefone` (WhatsApp, único quando preenchido — index `usuarios_telefone_key`, 20260610050000) são obrigatórios para novos cadastros (UI/API validam 11/10-11 dígitos); `email` é opcional — sem e-mail real, gera-se `<cpf>@checkflow.local`. View `usuarios_sem_contato` lista cadastros legados sem cpf/telefone |
| `usuario_empresa` | M:N user ↔ empresa |
| `usuario_unidade` | M:N user ↔ unidade |
| `sessao_usuario` | Last active empresa/unidade/ambiente per user |
| `password_reset_tokens` | OTP de 6 dígitos para login por código (20260610060000). `tipo`: `primeiro_acesso`\|`reset_admin`\|`self_service`\|`sessao_senha`. `codigo_hash` (sha256), `expira_em` (15min OTP / 10min sessão), `tentativas` (máx 5), `usado`. Sem RLS policies — só service role (`apps/web/lib/passwordReset.ts`). ⚠️ **A migration ficou pulada em prod até 2026-06-29** (descoberto no teste manual: todo OTP falhava silencioso) — aplicada manualmente. `criarCodigoOtp` agora lança no erro do insert (não engole mais) |

### Taxonomy
| Table | Description |
|-------|-------------|
| `grupos` | Checklist grouping (`unidade_id`) |
| `subgrupos` | Sub-grouping within grupo |

### Checklists
| Table | Description | Migration |
|-------|-------------|-----------|
| `checklists` | Headers: `nome`, `status`, `versao_atual`, `tempo_guarda_meses` (**default 1 mês** desde `20260630120000` — era 12; vale p/ todo caminho de criação que não envia o campo: duplicar, clonar_template, IA, setup), `subgrupo_id`, `permite_continuar_depois`, `permite_offline` | 20260603000017, 20260606000002, 20260613004044, 20260626000000, 20260630120000 (✅ aplicada) |
| `checklist_versoes` | Immutable snapshots (`snapshot jsonb`) | 20260603000017 |
| `checklist_secoes` | Sections within a checklist | 20260603000017 |
| `checklist_atividades` | Activities — see tipo constraint below | 20260603000017 |
| `checklist_atividade_opcoes` | Options for `multipla_escolha` (`label`, `valor`, `e_valido`) | 20260603000017 |
| `checklist_execucoes` | Execution records (`data_expiracao`, `status`) | 20260606000002 |
| `checklist_nao_execucao_motivos` | Junction: checklist ↔ motivo | 20260606000001 |

### `checklist_atividades.tipo` CHECK Constraint
Currently in DB: `'sim_nao','numero','texto','multipla_escolha','catalogo','foto','assinatura','data_hora','localizacao'`

✅ **`video` adicionado ao constraint** via migration `20260606000003_add_tipo_video.sql`.

### `checklist_atividades.config` JSONB Shapes
```
sim_nao:          { "esperado": "sim" | "nao" }
numero:           { "min": number, "max": number, "unidade": string }
texto:            { "mascara": string, "qrcode": boolean }
multipla_escolha: { "multipla": boolean }
catalogo:         { "catalogo_id": "uuid" }
localizacao:      { "lat": number, "lng": number, "raio_metros": number }
data_hora:        { "automatico": boolean }
video:            {}   (no config needed)
foto:             {}   (no config needed)
```

### Agendamentos (migration 20260606000015)
| Table | Description |
|-------|-------------|
| `agendamentos` | Recurring scheduler for workflows/checklists: `tipo_alvo` (workflow/checklist), `intervalo_unidade` (horas/dias/meses), `intervalo_valor`, `referencia_inicio`, `proxima_execucao` (auto-calc via trigger), `ativo`, `ultima_execucao_em` |

**Funções:**
- `agendamento_calcular_proxima(referencia, unidade, valor, a_partir_de)` → loops adding interval until past target
- `agendamento_set_proxima()` trigger → recalculates `proxima_execucao` on insert/update of recurrence fields
- `agendamentos_processar()` → processes due schedules (`for update skip locked`), calls `workflow_iniciar()` or inserts `checklist_execucoes` (status `'em_andamento'`), recalculates next run
- **Requires pg_cron**: `select cron.schedule('processar-agendamentos', '*/10 * * * *', $$select agendamentos_processar()$$);`

### Validação de troca de perfil (migration 20260607100800)
Trigger `trg_validar_troca_perfil` (before update em `usuario_empresa`) chama `validar_troca_perfil()`: bloqueia a troca para um perfil **não público** a menos que quem está fazendo a alteração seja Admin da empresa (`00000000-0000-0000-0000-000000000002`) ou Admin de sistema (`...001`) — reforça em DB a regra que já existe na UI do `UsuarioModal`/`alterarPerfil`, protegendo contra chamadas diretas à API.

### Permissões — catálogo completo (migration 20260607100332)
Adiciona `permissoes` faltantes que existiam só na UI do `PerfilModal` (sem registro em DB, logo marcar não tinha efeito):
`grupos.adicionar_usuario/gerenciar_usuario`, `subgrupos.gerenciar_funcoes`, `workflows.*`, `turnos.*`, `catalogos.*`, `documentos.*`, `causa_raiz.*`, `nao_execucao.*`, `planos_acao.ver/moderar_n1/moderar_n2`. Concede automaticamente aos perfis `is_system = true`.
⚠️ **Removidas depois** (migration 20260622160000): `planos_acao.*` (moderação é por Subgrupo→Função N1/N2, não por perfil) e `configuracoes.*` (sem enforcement) — saíram do construtor de perfis e foram deletadas de `permissoes` (cascata p/ `perfil_permissoes`).

### Tickets / Chamados (migration 20260609000001)
| Table | Description |
|-------|-------------|
| `ticket_categorias` | Árvore self-ref por unidade (`pai_id`, `e_generica`, `ativo`). Unique index: máx 1 categoria genérica por unidade (`where e_generica = true`). Função `garantir_categoria_generica(unidade_id)` cria "Sem categoria" se não existir |
| `ticket_sla_config` | Config de SLA por unidade+categoria+prioridade (`tempo_aceite_min`, `tempo_resolucao_min`). Unique em `(unidade_id, categoria_id, prioridade)` |
| `tickets` | Chamado principal: `numero` (sequence), `titulo`, `descricao`, `prioridade` (enum), `status` (enum 9 valores), `aberto_por_id`, `assignee_id`, `sla_deadline_at`, `sla_pausado_em`, `sla_segundos_pausados`, `execucao_id` (origem opcional) |
| `ticket_eventos` | Timeline imutável — bloqueada por `CREATE RULE ... DO INSTEAD NOTHING` em UPDATE e DELETE |
| `ticket_evidencias` | Fotos/vídeos/documentos vinculados a ticket ou evento |

**Enums:** `ticket_status` (aberto/em_tratamento/aguardando_informacao/aguardando_validacao/corrigido/nao_corrigido/corrigido_parcialmente/cancelado/improcedente), `ticket_prioridade` (critica/alta/media/baixa), `ticket_evento_tipo` (11 valores)

**Triggers:**
- `trg_tickets_numero` — auto-incrementa `numero` via `ticket_numero_seq`
- `trg_tickets_sla` — calcula `sla_deadline_at` no insert (categoria específica → genérica da unidade)
- `trg_tickets_updated_at` — inline, sem `moddatetime()`
- `trg_tickets_sla_pausa` — pausa SLA ao entrar em `aguardando_informacao`, acumula segundos ao sair

**RLS:** via `usuario_unidade`. Escrita de categorias/SLA exige `usuario_tem_permissao('ticket','categorias_gerir')`.

### Programa de Parceiros (migrations 20260610080000 + 20260611150000, ✅ aplicadas)
| Table | Description |
|-------|-------------|
| `parceiros` | `nome, email (unique lower), telefone, documento (CPF só dígitos, unique parcial — chave de busca na UI), status status_geral default 'ativo', email_boasvindas_enviado_em, criado_em, criado_por, atualizado_em`. Um parceiro pode estar vinculado a várias `empresas` |
| `empresa_status_eventos` | Audit trail de mudanças de `empresas.status` — populado pelo trigger `empresas_log_status_change()` (AFTER UPDATE em `empresas`). Usado para detectar empresas que ficaram `inativo` no mês |
| `parceiro_emails_log` | Idempotência de envio de e-mail: `unique(parceiro_id, tipo, referencia)`. `tipo`: `boas_vindas` (referencia null) \| `resumo_mensal` (referencia = `'YYYY-MM'`) |

**Fluxo:** vínculo parceiro↔empresa e `parceiro_percentual` editados na aba "Parceiro" de `/sistema/empresas/[id]`. Cadastro/seleção de parceiro **por CPF** via `ParceiroModal.tsx`. E-mail de boas-vindas: `POST /parceiros/boas-vindas` (apps/api), disparado só após o vínculo ser salvo. Resumo mensal (a rota valida internamente o último dia do mês; comissão = `valor_mensalidade × parceiro_percentual / 100` para empresas `ativo` com `status_pagamento != 'cancelado'`; lista empresas que viraram `inativo` no mês): `POST /cron/parceiros/resumo-mensal`, protegido por `x-cron-secret` (`CRON_SECRET`), chamado diariamente pelo cron-job.org — ver `/ops`.

### Billing — Fase 1: catálogo (migration 20260615140000, ✅ aplicada)
| Table | Description |
|-------|-------------|
| `planos` | Catálogo-template de planos. `nome, descricao, tipo (gratuito/trial/pago), valor numeric(10,2), ciclo (mensal/anual, null em gratuito/trial), dias_trial, limite_execucoes_mes int, limite_armazenamento_bytes bigint, limite_tokens_ia_mes bigint, ativo, ordem`. **Limite NULL = ilimitado.** RLS admin-only. CRUD em `/sistema/planos`. ⚠️ A assinatura da empresa (Fase 2) fará **snapshot** dos termos — editar o catálogo não altera quem já assinou |
| `pacotes_adicionais` | Catálogo-template de pacotes avulsos. `nome, descricao, tipo (execucoes/tokens_ia/armazenamento), quantidade bigint, valor, ativo, ordem`. Para `armazenamento`, `quantidade` é em **bytes** (UI edita em GB). execucoes/tokens = saldo de consumo do período (use ou perde); armazenamento = permanente. RLS admin-only. CRUD em `/sistema/pacotes` |

### Billing — Fase 2A: assinatura + uso + enforcement (migration 20260615160000, ✅ aplicada)
| Objeto | Descrição |
|--------|-----------|
| `empresa_assinaturas` | 1:1 com empresa. **Snapshot** dos termos (`plano_nome/tipo/valor/ciclo` + 3 limites) + estado (`status`: trial/ativo/inadimplente/cancelado), período de uso **mensal** ancorado no dia (`periodo_inicio/fim`), contadores que resetam por período (`execucoes_usadas`, `tokens_ia_usados`, `execucoes_extra`, `tokens_ia_extra`), trial (`trial_fim`, `ja_usou_trial`), troca agendada (`proximo_plano_id`, `troca_efetiva_em`), Asaas (`asaas_customer_id/subscription_id`). RLS: leitura admin_sistema OU Admin da empresa (perfil `…002`); escrita admin_sistema |
| `empresa_pacotes_comprados` | Auditoria de compras + capacidade permanente de armazenamento (`tipo, quantidade, valor, periodo_inicio`). Mesma RLS |
| `avancar_periodo_assinatura(empresa)` | SECURITY DEFINER. Expira trial→gratuito, aplica troca agendada, avança períodos mensais vencidos e zera contadores. Chamada por todas as funções de leitura/enforcement (mantém fresco sem cron) |
| triggers `billing_inc_execucao` / `billing_inc_tokens` | AFTER INSERT em `checklist_execucoes` (deriva empresa via unidade) e `uso_ia_eventos` — incrementam contadores do período |
| `billing_pode_executar` / `billing_pode_consumir_ia` / `billing_armazenamento_disponivel(empresa,bytes)` | Booleans de enforcement. Sem assinatura → não bloqueia; limite null → ilimitado |
| `billing_status(empresa)` → jsonb | Leitura consolidada (plano, período, uso×limite×extra dos 3 recursos). Valida permissão (admin_sistema ou Admin da empresa) |

### Migrations 2026-06-17 (✅ aplicadas)
- `20260617140000_billing_catalogo_leitura.sql` — leitura de `planos`/`pacotes_adicionais` **ativos** por autenticados (corrige self-service `/gestao/plano`; escrita segue admin).
- `20260617160000_motivo_padrao_nao_execucao.sql` — motivo padrão "Não disponível" por unidade (grupo/subgrupo nulos), `motivo_padrao_unidade(unidade,tipo)`, trigger `checklist_seed_motivos_padrao` (AFTER INSERT em checklists, associa ≥1 de cada tipo a checklist novo não-template) + retroativo.

### Tickets — categoria padrão + RLS escopada (migration `20260620180000_ticket_categoria_padrao.sql`, ✅ aplicada 2026-06-22)
- Categoria genérica `e_generica` renomeada **"Sem categoria" → "Não informada"** (função `garantir_categoria_generica` + update dos dados).
- `ticket_categorias_escrita`/`ticket_sla_escrita`: permissão `('ticket','categorias_gerir')` **+ unidade** (`with check` incluído). Antes não escopava unidade.

### Documentos — escrita por permissão + cota (migration `20260620160000_documentos_escrita_permissao.sql`, ✅ aplicada 2026-06-20)
- RLS de escrita em `documentos`/`documento_etapas`/`etapa_imagens` por **permissão `documentos`** (criar/excluir) + unidade (antes só `is_admin_sistema`).
- **Storage**: imagens de etapa (bucket `empresas`, prefixo `etapas/`) graváveis/deletáveis por quem tem permissão `documentos` (antes só admin).
- **Cota**: `uso_armazenamento.origem` passa a aceitar `'documento'` — imagens de etapa contam na cota (registradas via `lib/uso.ts`).

### Catálogos — escrita por permissão (migration `20260620140000_catalogos_escrita_permissao.sql`, ✅ aplicada 2026-06-20)
- `catalogos` e `catalogo_valores` ganham policy de escrita por **permissão `catalogos`** (criar/editar/excluir) + unidade, além de `is_admin_sistema`/admin da empresa. Antes só `is_admin_sistema` escrevia → gestor com permissão tomava erro de RLS. Espelha o padrão de `agendamentos`.

### Admin da empresa — RLS escopada (migration `20260620120000_admin_empresa_rls.sql`, ✅ aplicada 2026-06-20)
- Dá ao "Admin da empresa" (`usuario_empresa.perfil_id='…002'`) as mesmas funções de gestão do admin de sistema, **restritas à sua empresa**. Vários admins por empresa (em paralelo).
- **Helpers** (security definer, stable, `search_path=public`): `is_admin_empresa(p_empresa_id)`, `is_admin_empresa_unidade(p_unidade_id)`, `is_admin_empresa_grupo(p_grupo_id)`, `is_admin_empresa_subgrupo(p_subgrupo_id)`.
- **Escopo**: empresa inteira (TODAS as unidades). `is_admin_empresa_unidade(unidade_id)` = é admin da empresa dona da unidade (NÃO exige membership em `usuario_unidade`).
- **Policies aditivas** (`for all`, OR com as existentes — não reescreve): estrutura (`unidades`/`grupos`/`subgrupos`/`turnos`), acessos (`usuario_empresa`/`usuario_unidade`/`usuario_grupo`/`usuario_subgrupo`) e **operacionais (todas as unidades)**: checklists(+versoes/secoes/atividades/opcoes/nao_exec), checklist_execucoes(+respostas), documentos(+etapas/imagens), catalogos(+valores), nao_execucao_motivos, causa_raiz, tickets(+categorias/sla/eventos/evidencias), planos_acao(+evidencias/movimentacoes/mov_evidencias), tarefa_listas(+grupos/subgrupos/itens/execucoes/respostas), agendamentos. Filhas escopadas via `<fk> in (select id from <pai> where is_admin_empresa_unidade(unidade_id))` — só liberam p/ admin (não afrouxam p/ usuário comum).
- **Guard crítico**: `usuario_empresa_admin_empresa` `with check` proíbe atribuir `perfil_id='…001'` (Admin de sistema). `perfis`/`perfil_permissoes` já tinham policy de empresa (20260607120000).
- **UI**: `SessionContext.carregarUnidades` lista todas as unidades da empresa p/ o admin; `lib/admin.ts ehAdminDaEmpresa()` no bypass de subgrupo das telas.
- ⚠️ **Gap de SEED corrigido** (migration `20260629000000_admin_empresa_permissoes_acessos.sql`, ✅ aplicada via service role 2026-06-29): o perfil seed **Admin da empresa** (`…002`) tinha só ~50/66 permissões — faltavam as de **Acessos** (`usuarios`, `unidades`, `perfis` + `empresas.ver/editar`), então o admin não conseguia aprovar pré-cadastro nem gerir usuários ("Você não tem permissão"). O `insert ... select` concede essas a `…002` com `on conflict do nothing` (NÃO concede `empresas.criar/deletar` — isso é de plataforma). Descoberto testando como admin da empresa real. As policies RLS já existiam; o que faltava era a **linha em `perfil_permissoes`** (RLS libera a ação, mas `usuario_tem_permissao` ainda checa o vínculo perfil→permissão).

### Listas de Tarefas — cota de mídia (migration `20260618160000_uso_armazenamento_tarefa.sql`, ✅ aplicada 2026-06-18)
- `uso_armazenamento.origem` aceita `'tarefa'`; policy de insert ganhou bypass `is_admin_sistema()`. Mídia de tarefa contabilizada via `lib/uso.ts` + bloqueio `billing_armazenamento_disponivel`.

### Listas de Tarefas — fix RLS (migration `20260618140000_tarefas_admin_exec.sql`, ✅ aplicada 2026-06-18)
- `tarefa_exec_insert` ganhou bypass `is_admin_sistema()` (admin não tem `usuario_unidade`, então não conseguia abrir/responder uma lista). Mantém `usuario_id = auth.uid()`.

### Listas de Tarefas (migration `20260618120000_tarefas.sql`, ✅ aplicada 2026-06-18)
- `tarefa_listas` (modelo: unidade_id, titulo, status rascunho|publicada|encerrada, `abertura_data_limite`, `abertura_max_respostas`, `edicao_janela_horas`, `notificar_whatsapp`), `tarefa_lista_grupos`/`tarefa_lista_subgrupos` (atribuição), `tarefa_itens` (titulo, ordem, flags `aceita_observacao`/`aceita_evidencia`/`exige_checkin`), `tarefa_execucoes` (1 por usuário: `unique(lista_id,usuario_id)`, `aberta_em`, `editavel_ate`, status), `tarefa_respostas` (`unique(execucao_id,item_id)`, feito, observacao, evidencia_url/tipo, lat/lng).
- Permissão `tarefas` (ver/criar/editar/deletar), concedida aos perfis `is_system`. Helper `usuario_tem_permissao`.
- RLS padrão: leitura por membro da unidade (`usuario_unidade`); escrita da lista exige `usuario_tem_permissao('tarefas',...)`; execução/respostas: usuário cria/edita as **suas** (`usuario_id = auth.uid()`), gestão lê todas da unidade. Mídia no bucket `execucoes` sob `tarefas/`.

### IA — log de falhas (migration 20260617120000, ✅ aplicada)
- `ia_falhas` (admin-only RLS): `contexto` (ajuda|consulta), `provedor`, `modelo`, `erro`, `empresa_id`, `criado_em`. Gravada (fire-and-forget, service-role) no catch do failover em `/api/ajuda` e `/api/documentos/consultar`. Exibida em `/sistema/integracoes-ia` ("Últimas falhas").
- Modelo Gemini padrão nas rotas: `gemini-2.5-flash` (2.0-flash foi desativado pelo Google).

### Templates de checklist (migration 20260616120000, ✅ aplicada)
- `checklists.is_template boolean` + `template_segmentos text[]` — modelo é um checklist sem `unidade_id`, curado por admin. Policies de leitura de `checklists`/`checklist_secoes`/`checklist_atividades`/`checklist_atividade_opcoes` liberam `is_template` pra qualquer autenticado (galeria pública).
- RPC `clonar_template(p_template_id, p_unidade_id, p_nome)` → cópia profunda (seções/atividades/opções + remapeia `atividade_pai_id`) como rascunho na unidade; valida admin OU membro da unidade. Seed idempotente (oficina, restaurante).
- Galeria: `/gestao/checklists/modelos`. Curadoria admin (`/sistema/templates`) ainda NÃO feita.

### Billing — Fase 3: Asaas (migration 20260615180000, ✅ aplicada)
| Objeto | Descrição |
|--------|-----------|
| `empresa_cobrancas` | Espelho local das cobranças Asaas. `tipo (assinatura/pacote)`, `asaas_payment_id` (unique), `asaas_subscription_id`, `pacote_id`, `valor`, `billing_type`, `status` (espelha Asaas: PENDING/CONFIRMED/RECEIVED/OVERDUE…), `vencimento`, `pago_em`, `invoice_url`, `meta jsonb` (p/ pacote: tipo_recurso/quantidade/creditado). RLS: leitura admin_sistema ou Admin da empresa |
| `asaas_webhook_eventos` | Idempotência (`event_id` PK = id do evento Asaas). Webhook só processa se o insert não conflitar. Admin-only |
| `billing_creditar_execucoes`/`billing_creditar_tokens(empresa, qtd)` | Creditam saldo extra do período (chamadas pelo webhook só quando o pagamento confirma). Armazenamento é inserido direto em `empresa_pacotes_comprados` |

**API (apps/api):** `lib/asaas.ts` (cliente env-based: `ASAAS_API_KEY`, `ASAAS_ENV` sandbox|production, header `access_token`). `routes/billing.ts`: `POST /billing/assinar` (assinatura recorrente, cancela a anterior), `/comprar-pacote` (cobrança avulsa; crédito só no webhook), `/webhook/asaas` (valida header `asaas-access-token` = `ASAAS_WEBHOOK_TOKEN`, idempotente). Auth das duas primeiras: Bearer token do usuário, exige Admin da empresa ou admin_sistema.

**Plano de billing (decisões fechadas, padrão de mercado/freemium):** período = aniversário da assinatura (não calendário); enforcement NÃO é tempo real (contador por período, pequeno excedente tolerado); **sem rollover** — allowance mensal reseta a cada período (use ou perde), pacotes entram no saldo do período; armazenamento = capacidade fixa (plano + pacotes permanentes), uso sempre real; limite excedido **bloqueia** a ação; modelo **freemium** (plano gratuito permanente + trial com `dias_trial` configurável + pagos); fim do trial → cai no plano gratuito; tiers fixos (não plano por cliente); split de parceiro via subconta Asaas (trocar parceiro recalcula %, remover → 100% CheckFlow). Fases 2-4 (assinatura/trial/enforcement, Asaas, split) pendentes.

⚠️ **Armazenamento sempre reflete o uso real**: `executarLimpezaExecucoes` (apps/api) agora soma os bytes removidos do Storage e insere entrada **negativa** em `uso_armazenamento` (origem `execucao`, `tamanho_bytes < 0`) — a tabela não tem check `>= 0`. O uso líquido (adições − remoções) é o que conta; capacidade é fixa, o tempo de guarda é a alavanca de espaço.

### Hardening de regras (migration 20260611134557, ✅ aplicada)
- Policy `tickets_atualizar`: branch `usuario_tem_permissao('ticket','tratar')` agora exige vínculo com a unidade do ticket
- `workflow_on_checklist_concluido()`: `resultado` nulo conta como **reprovado** (fail-safe — nunca avança estágio por omissão)
- `checklist_execucoes.agendamento_id` (FK → agendamentos) + `agendamentos_processar()` reescrita: execução agendada nasce com `executado_por` **null** (pendência da unidade, não execução do gestor) e `data_expiracao` calculada do `tempo_guarda_meses`

### Integrações de IA (migrations 20260612235259 + 20260613001046, ✅ aplicadas)
| Table | Description |
|-------|-------------|
| `ia_provedores` | Provedores de IA da Consulta Inteligente: `provedor` (unique: gemini/anthropic/openai/groq/**custom1/custom2**), `api_key` (secreta — só lida no servidor via service key, UI nunca seleciona), `chave_mascara` (`••••1234`, segura p/ exibir), `modelo` (override), `base_url`+`nome_exibicao` (só para custom1/2 — OpenAI-compatible: SiliconFlow, DashScope, OpenRouter…), `ativo`, `ordem` (failover). RLS admin-only. Migrations 20260612235259 (base) + 20260613001046 (custom) |

Rota `/api/documentos/consultar` lê `ia_provedores` (ativo, por ordem) como fonte primária das chaves, com env var de fallback. Gerenciado em `/sistema/integracoes-ia`.

### Checklist offline — PWA (migration `20260626000000_checklist_permite_offline.sql`, ✅ aplicada 2026-06-26)
- `checklists.permite_offline boolean not null default false` — opt-in: marca se o checklist pode ser executado sem internet pelo PWA (aparece na lista offline da operação + definição pré-cacheada). Aplicada manualmente no SQL Editor (projeto Supabase não linkado localmente).
- Código é **deploy-safe**: leitura na operação é best-effort (try/catch); escrita na gestão é à parte (`ChecklistMontador.salvar` grava o flag num update separado).

### Pré-cadastro por QR (migration `20260627000000_pre_cadastros.sql`, ✅ aplicada 2026-06-27)
- `pre_cadastros`: nome, cpf, telefone, email, observacao, status (`pendente`/`aprovado`/`rejeitado`), empresa_id, usuario_id (preenchido na aprovação), moderado_por/em.
- **RLS:** INSERT `to anon, authenticated with check (status='pendente')` (página pública insere; sem leitura/edição p/ anon — anti-enumeração); SELECT/UPDATE só `is_admin_sistema() or is_admin_empresa(empresa_id)`. Grants explícitos (`insert to anon, authenticated`; `select, update to authenticated`).
- **RPC `empresa_publica(p_id)`** (security definer, grant anon): retorna `nome, logo_url` de empresa ativa — p/ a página pública mostrar a marca sem expor a tabela `empresas`.
- Aprovação reusa `/api/usuarios/criar` (cria usuário + dispara código de 1º acesso). Ver [[pendencia-precadastro-qrcode]].

## Onboarding

| Table | Notes |
|-------|-------|
| `onboarding_paginas` | `page_id` (pk), `titulo`, `ativo`, `cards_override` (jsonb, null = usa default do `registry.ts`) — 20260610030000 |

**RLS:** select para qualquer `authenticated`; insert/update/delete só `is_admin_sistema()`. Editável via `/sistema/onboarding`.

**Toda nova tela** deve ganhar uma linha aqui (insert `on conflict do nothing`) com o `page_id` usado em `registry.ts`.

### Notificação Templates (migration 20260609010000)
| Table | Description |
|-------|-------------|
| `notificacao_templates` | Um registro por `(empresa_id, tipo, canal)`. Unique em trio. `corpo` usa `{{variavel}}` para interpolação. `assunto` só para email. `ativo` permite desabilitar canal por tipo |

**Enums:** `notificacao_tipo` (ticket_aberto/ticket_movimentado/plano_aberto/plano_enviado_n2/reset_senha), `notificacao_canal` (whatsapp/email)

⚠️ `reset_senha` agora envia **código de 6 dígitos** (`{{codigo}}`), não link — atualizado em `seed_notificacao_templates` na migration 20260610070000 (também faz `update` nos templates existentes que ainda tinham `{{link}}`).

**Função `seed_notificacao_templates(empresa_id)`** — insere 10 templates padrão (5 tipos × 2 canais) com `on conflict do nothing`. Dollar-quoting correto: `$tpl$...$tpl$` dentro de função `$$...$$`.

### Perfil "Gestão do Grupo" por empresa (migration `20260630130000`, ✅ aplicada 2026-06-30 — 8/8 empresas com 28 permissões)
`seed_perfil_gestao_grupo(p_empresa_id)` (security definer) cria — se ainda não existir — um perfil **PER-EMPRESA** "Gestão do Grupo" (`is_system=false`, `publico=false`, `empresa_id`), **editável/excluível** pelo admin da empresa, com **28 permissões** (grupos/subgrupos, agendamentos, catálogos, documentos, causa_raiz, nao_execucao, ticket). Trigger `trg_empresa_gestao_grupo_seed` (after insert on `empresas`) + backfill das existentes (guard por nome não duplica). Mesmo padrão do `seed_notificacao_templates`. Diferente dos perfis de **sistema** (`…001/002/003`, `empresa_id null`, `is_system=true`).

**Trigger `trg_empresa_notif_seed`** — executa seed automaticamente em cada novo insert em `empresas`.

⚠️ **Gotcha de dollar-quoting**: dentro de função `$$...$$`, use `$tpl$...$tpl$` para strings multi-linha — nunca `$$tpl$...$tpl$` (o `$$` fecha a função prematuramente).

### Termos de Uso (migration 20260607000003)
| Table | Description |
|-------|-------------|
| `termos_uso` | Texto único do termo, válido para TODAS as empresas: `texto`, `versao` (string livre, ex timestamp `'2026-06-07 14:30'`), `atualizado_em`, `atualizado_por`. A versão vigente é o registro mais recente (`order by atualizado_em desc limit 1`) — histórico é preservado |

`usuarios.termos_aceitos_em` (timestamptz) + `termos_versao_aceita` (text) — registra o aceite individual.
Editado pelo admin em `/sistema/termos` (`TermosAdminPage`): salvar **insere uma nova versão** (não faz update), forçando reaceite de todos os usuários automaticamente — sem nova migration. RLS: leitura liberada a todos, escrita restrita a `is_admin_sistema()`.

### ⚠️ Unidades — NUNCA hard delete
Quase toda a árvore referencia `unidades(id)` com **`on delete cascade`** (grupos, usuario_unidade, checklists, catalogos, documentos, causa_raiz, nao_execucao, tickets, tarefas, padroes, variaveis). Um `delete` de unidade apaga os dados da unidade inteira. Algumas FKs (checklist_execucoes, workflows, planos_acao) são restrict → bloqueiam. **Regra: inativar (`status='inativo'`), nunca deletar** — aplicado em `acessos/empresa/page.tsx` (2026-06-22, era hard delete).

### Turnos (migration 20260607000002)
| Table | Description |
|-------|-------------|
| `turnos` | `nome`, `tipo` (`administrativo`\|`escala`), `config` jsonb, `ativo`, `modo_fora_turno` (`notificacao`\|`login`\|`aviso`, default `notificacao` — migration `20260622120000`) |

**`config` shapes:**
```
administrativo: { "dias": [ { "dia": 0-6 (0=domingo), "inicio": "HH:MM", "fim": "HH:MM" }, ... ] }
                 -- cada dia da semana pode ter horário próprio (ex: sáb 08-11h, seg-sex 08-17h)
escala:         { "data_referencia": "YYYY-MM-DD", "hora_inicio": "HH:MM",
                  "horas_trabalho": number, "horas_folga": number }
                 -- ciclo contínuo a partir da referência (ex: 12x36, 24x48)
```

`usuarios.turno_id` (nullable FK → `turnos`) — vínculo opcional 1 turno por usuário, editável em `UsuarioModal.tsx`.

**Perfil por empresa / vínculo de pessoa existente** (migration 20260622140000):
- `trg_validar_troca_perfil` agora roda em **INSERT or UPDATE** de `usuario_empresa` (era só UPDATE) — guard do perfil não-público também no 1º vínculo. Bypass quando `auth.uid()` null (service-role).
- `buscar_pessoa_por_cpf(p_cpf)` → `(id, nome, telefone)` security definer, restrita a admin sistema/empresa. Usada pelo `UsuarioModal` p/ detectar CPF já cadastrado e oferecer vínculo a outra empresa (mesma pessoa, perfil próprio por empresa).
Função `usuario_esta_no_turno(p_usuario_id, p_momento default now())` → boolean — calcula se o usuário está dentro do turno **agora**, suportando ambos os tipos (administrativo: olha dia da semana + janela; escala: calcula posição no ciclo trabalho/folga desde `data_referencia`). Sem turno = sempre `true` (não restringe).

**Modo fora do turno** (migration `20260622120000`) — 3 funções derivadas (todas `sem turno/inativo` = não restringe):
- `usuario_recebe_notificacao(uid, momento)` → `false` só se turno ativo modo `notificacao` e fora do horário. Usada nas 3 rotas de notificação WhatsApp (`/planos-acao/notificar`, `/tarefas/notificar`, `/tickets/notificar`) — substituiu o uso direto de `usuario_esta_no_turno`.
- `usuario_pode_acessar(uid, momento)` (security definer) → `false` só se turno ativo modo `login`, fora do horário, e **não** `is_admin_sistema()` nem `is_admin_empresa(empresa_id)`. Chamada no login (web) após autenticar; `false` → `signOut`.
- `usuario_deve_avisar_turno(uid, momento)` → `true` se turno ativo modo `aviso` e fora. Consumida por `AvisoTurno.tsx` (banner nos layouts).

### Catálogos
| Table | Description |
|-------|-------------|
| `catalogos` | Catalog metadata: `campo_chave`, `atributo_1..4` |
| `catalogo_valores` | Items: `valor_chave`, `atributo_1..4`, `imagem_url` |

### Documentos & Qualidade
| Table | Description |
|-------|-------------|
| `documentos` | Document library |
| `nao_execucao_motivos` | Reasons for non-execution |
| `causa_raiz` | **Banco** de causas raiz **pré-vinculadas a uma atividade de checklist** — `nome`, `observacoes`, `grupo_id`, `subgrupo_id`, `checklist_id`, `atividade_id` (FKs cascade, 20260622180000), `documento_id` (POP/IT de apoio), `unidade_id`, `status`. RLS: leitura por unidade, **escrita por permissão `causa_raiz`** + admins (20260622190000, era admin-only). **Regra**: só vincula a atividade **com validação** (`sim_nao`/`numero`/`multipla_escolha`/`localizacao`/`padrao` — filtro no cadastro), pois causa raiz pressupõe campo reprovável. |
| `causa_raiz_ocorrencias` | **Ocorrência real** de uma causa raiz na abertura de um plano de ação (≠ banco). `causa_raiz_id`, `atividade_id` (denormalizado p/ histórico por campo), `plano_acao_id`, `unidade_id`, `observacao` (própria da ocorrência), `criado_por`, `criado_em` (20260622200000). RLS: leitura/insert por membro da unidade; edição só admin. |

### Workflows (migration 20260606000006)
| Table | Description |
|-------|-------------|
| `workflows` | Pipeline header (`empresa_id`, `status`: rascunho/publicado/inativo) — transversal às unidades |
| `workflow_estagios` | Estágios sequenciais (`workflow_id`, `ordem`, `condicao_avanco`) |
| `workflow_estagio_itens` | Checklists dentro de um estágio — paralelos (`estagio_id`, `checklist_id`, `subgrupo_id`, `obrigatorio`) |
| `workflow_execucoes` | Instância de execução (`workflow_id`, `unidade_id`, `estagio_atual_ordem`, `status`) |
| `workflow_item_execucoes` | Estado de cada item numa execução (`checklist_execucao_id`, `status`: bloqueado/liberado/em_andamento/aprovado/reprovado/pulado) |

**`condicao_avanco`** values: `todos_aprovados` | `todos_concluidos` | `qualquer_aprovado`

**Motor de avanço:** trigger `trg_workflow_checklist_concluido` em `checklist_execucoes AFTER UPDATE`
→ chama `workflow_avaliar_avanco(execucao_id)` → libera próximo estágio automaticamente

**Funções RPC:**
- `workflow_iniciar(p_workflow_id, p_unidade_id, p_usuario_id)` → retorna `uuid` da execução
- `workflow_avaliar_avanco(p_execucao_id)` → void, chamada pelo trigger

**`checklist_execucoes`** agora tem coluna `resultado text check (resultado in ('aprovado','reprovado'))`
Também tem (migration 20260606000016): `motivo_nao_execucao_id` (FK `nao_execucao_motivos`), `motivo_nao_execucao_obs text` — usados quando o checklist inteiro não pôde ser executado (`status='nao_executado'`). Motivo de não execução de uma ATIVIDADE individual fica embutido no JSON da resposta: `{ _nao_executavel: true, motivo_id, motivo_descricao, observacao }`.

**Trigger `trg_checklist_bloquear_inativacao`** (migration 20260606000015): impede `update status='inativo'` em checklist usado em workflow `publicado` — lança exceção com contagem de workflows.

## RLS Policy Patterns

### Admin-only write, public read
```sql
create policy "X_admin"   on T for all    using (is_admin_sistema());
create policy "X_leitura" on T for select using (true);
```

### Unit-scoped (operator data)
```sql
create policy "X_unidade" on T for all using (
  unidade_id in (
    select unidade_id from usuario_unidade
    where usuario_id = auth.uid()
  )
);
```

## RLS Gotcha: nullable FK columns
Policies comparing `unidade_id in (...)` never match `NULL` rows (company-wide records). Always add an explicit `or (unidade_id is null and exists(...))` branch — bug found & fixed in `catalogos`/`catalogo_valores` (migration 20260606000014). Check other tables with nullable `unidade_id` for the same gap.

## RLS Gotcha: subqueries em `usuario_unidade` são afetadas pelo RLS da própria `usuario_unidade` (migration 20260614030000, ✅ aplicada)
`usuario_unidade` tinha **só** a policy `usuario_unidade_admin` (admin-only). Qualquer policy de OUTRA tabela que faz `exists (select 1 from usuario_unidade where usuario_id = auth.uid() ...)` ficava sempre falsa para usuários normais — porque a subquery em si é executada com RLS de `usuario_unidade`, que retornava vazio. Isso bloqueava silenciosamente `tickets_criar`, leitura de `checklists`, `catalogos`, `documentos`, `padroes_variaveis` etc. — erro típico: `new row violates row-level security policy` (42501) ou select retornando `[]` sem erro.

**Fix**: adicionar policy de SELECT permitindo o usuário ver a própria linha:
```sql
create policy "usuario_unidade_propria" on usuario_unidade
  for select using (usuario_id = auth.uid());
```
Se uma tabela nova depender de `usuario_unidade` em policy, essa policy já cobre — não precisa repetir.

⚠️ **Mesma classe em `usuario_empresa` e `usuario_grupo` (migration `20260630000000_usuario_empresa_grupo_self_select.sql`, ✅ aplicada 2026-06-30)** — descoberto no teste manual logando como **operador real**. As únicas policies dessas duas tabelas eram admin-sistema e admin-empresa; faltava o "ver a própria linha". Efeito: **qualquer não-admin** (operador/N1/N2/gestor) recebia `usuario_empresa = []` no `SessionContext` → **"Nenhuma unidade selecionada"** (app inutilizável), e toda subquery `select empresa_id from usuario_empresa where usuario_id = auth.uid()` (`empresas_acesso`, turnos, workflows, billing, uso) voltava vazia. O admin escapava via `is_admin_empresa`. Fix idêntico:
```sql
create policy "usuario_empresa_propria" on usuario_empresa for select using (usuario_id = auth.uid());
create policy "usuario_grupo_propria"   on usuario_grupo   for select using (usuario_id = auth.uid());
```
`usuario_subgrupo` já tinha (`usuario_subgrupo_propria`, 20260622210000) — os irmãos `usuario_empresa`/`usuario_grupo` ficaram de fora. **Lição: ao criar policy admin-only numa tabela de vínculo do usuário, sempre adicionar também a self-select `usuario_id = auth.uid()`.**

## RLS Gotcha: admin_sistema sem linha em `usuario_unidade` (migration 20260614040000, ✅ aplicada)
Mesmo com a policy acima, um `admin_sistema` pode não ter nenhuma linha em `usuario_unidade` (ele normalmente acessa tudo via `is_admin_sistema()`). Qualquer policy que dependa **só** de `exists (select 1 from usuario_unidade ...)` sem `or is_admin_sistema()` bloqueia o admin. Corrigido em `tickets_leitura`, `tickets_criar`, `ticket_eventos_*`, `ticket_evidencias_*`, `ticket_categorias_leitura`, `ticket_sla_leitura`. **Ao criar policy nova baseada em `usuario_unidade`, sempre adicionar `is_admin_sistema() or ...` no início.**

## Gotcha: embeds do PostgREST exigem FK real para a tabela embutida (migration 20260614050000, ✅ aplicada)
`tickets.aberto_por_id`/`assignee_id` referenciavam `auth.users(id)`, mas o frontend embute `usuarios!tickets_aberto_por_id_fkey(nome)`. Sem FK direta `tickets → usuarios`, o PostgREST retorna erro `PGRST200` ("Could not find a relationship...") e o `select` inteiro vira `null` — telas de listagem tratam isso como "nenhum registro encontrado" **sem nenhum erro visível**. Fix: repontar a FK para `usuarios(id)` (que já é 1:1 com `auth.users`), mantendo o nome padrão `tickets_aberto_por_id_fkey`. **Sempre que uma coluna referenciar `auth.users(id)` E for usada em embed `usuarios!...`, a FK precisa apontar para `usuarios(id)`, não `auth.users(id)`.**

## Evolution Rule
When the user says "Update /db with new table [X]", add X to the table index with a one-line description and migration filename. Keep constraint documentation up to date.
