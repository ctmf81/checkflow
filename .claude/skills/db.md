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
| `checklist_execucoes` | Execution records (`data_expiracao`, `status`, `resultado`, `iniciado_em`) | 20260606000002 |
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

### Web Push (migration 20260717150000, ✅ aplicada)
| Table | Description |
|-------|-------------|
| `push_subscriptions` | Inscrições de Web Push por aparelho: `usuario_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`. RLS: usuário gerencia as suas (select/insert/update/delete); admin sistema lê. Envio via API (`enviarPush`, service role); reassociação ao usuário logado em `POST /push/subscribe`. Ver `/ops`, `/biz`, [[feature-web-push]] |

### Agendamentos (migration 20260606000015)
| Table | Description |
|-------|-------------|
| `agendamentos` | Recurring scheduler for workflows/checklists: `tipo_alvo` (workflow/checklist), `intervalo_unidade` (horas/dias/meses), `intervalo_valor`, `referencia_inicio`, `proxima_execucao` (auto-calc via trigger), `ativo`, `ultima_execucao_em`. **Janela (20260716140000)**: `dias_semana smallint[]` (0=dom…6=sáb, null=todos), `hora_inicio`/`hora_fim smallint` (`hora_fim` EXCLUSIVA; constraint `agendamento_hora_valida`: `hora_inicio<hora_fim`, fuso São_Paulo). **`nao_empilhar boolean default false` (20260717120000)** |

**Funções:**
- `agendamento_calcular_proxima(referencia, unidade, valor, a_partir_de)` → loops adding interval until past target
- `agendamento_set_proxima()` trigger → recalculates `proxima_execucao` on insert/update of recurrence fields
- `agendamentos_processar()` → processes due schedules (`for update skip locked`), calls `workflow_iniciar()` or inserts `checklist_execucoes` (status `'em_andamento'`), recalculates next run. **Pula** (sem avançar `proxima_execucao`) quando: a **empresa não tem o módulo Agendamentos no plano** (`empresa_libera_recurso(empresa,'agendamentos')` false — gate do cron no downgrade, já que service role ignora RLS; retoma ao religar, migration `20260720140000`); fora dos `dias_semana`/faixa de horário (em `America/Sao_Paulo`); ou `nao_empilhar` e já há pendência aberta do agendamento (`agendamento_id=id`, `em_andamento`, `executado_por null`). Reescrita nas migrations 20260716140000, 20260717120000 e 20260720140000.
- **Disparo em produção via HTTP** `POST /cron/agendamentos/processar` (cron-job.org ~10 min) — pg_cron do Supabase free é instável. Idempotente (roda por pg_cron E HTTP sem duplicar). Ver `/ops`.

### Validação de troca de perfil (migration 20260607100800)
Trigger `trg_validar_troca_perfil` (before update em `usuario_empresa`) chama `validar_troca_perfil()`: bloqueia a troca para um perfil **não público** a menos que quem está fazendo a alteração seja Admin da empresa (`00000000-0000-0000-0000-000000000002`) ou Admin de sistema (`...001`) — reforça em DB a regra que já existe na UI do `UsuarioModal`/`alterarPerfil`, protegendo contra chamadas diretas à API.

### Permissões — catálogo completo (migration 20260607100332)
Adiciona `permissoes` faltantes que existiam só na UI do `PerfilModal` (sem registro em DB, logo marcar não tinha efeito):
`grupos.adicionar_usuario/gerenciar_usuario`, `subgrupos.gerenciar_funcoes`, `workflows.*`, `turnos.*`, `catalogos.*`, `documentos.*`, `causa_raiz.*`, `nao_execucao.*`, `planos_acao.ver/moderar_n1/moderar_n2`. Concede automaticamente aos perfis `is_system = true`.
⚠️ **Removidas depois** (migration 20260622160000): `planos_acao.*` (moderação é por Subgrupo→Função N1/N2, não por perfil) e `configuracoes.*` (sem enforcement) — saíram do construtor de perfis e foram deletadas de `permissoes` (cascata p/ `perfil_permissoes`).
⚠️ **`indicadores` removido do construtor** (`permissoes.ts`, 2026-06-30): nunca existiu em `permissoes` e não tem enforcement próprio.
✅ **`relatorios` REINTRODUZIDO com enforcement (2026-07-14)** — feature Relatórios por IA. 4 ações (`criar/editar/excluir/executar`) em `permissoes` + `permissoes.ts` (com `flag:'ia'`), RLS por ação e rota que checa `executar`. Menu ficou em **Configurações → Relatórios** (ocupou o link morto `/gestao/configuracoes/relatorios`). Ver seção "Relatórios por IA" abaixo.
✅ **Menu lateral passou a respeitar permissões** (`Sidebar.tsx`, 2026-06-30, commit `82774d1`): cada item declara o `recurso` que o libera (ou é admin-only); **só aparece o que o perfil do usuário tem permissão** (carrega `perfil_permissoes` via RLS — `usuario_empresa` próprio + leitura pública de `permissoes`/`perfil_permissoes`). Admin empresa/sistema vê tudo. Home/Planos de Ação/Indicadores não têm permissão de perfil → sempre visíveis. **É UX** — segurança real segue no RLS + checagem de permissão nas ações.

### Tickets / Chamados (migration 20260609000001)
| Table | Description |
|-------|-------------|
| `ticket_categorias` | Árvore self-ref por unidade (`pai_id`, `e_generica`, `ativo`). Unique index: máx 1 categoria genérica por unidade (`where e_generica = true`). Função `garantir_categoria_generica(unidade_id)` cria "Sem categoria" se não existir |
| `ticket_sla_config` | Config de SLA por unidade+categoria+prioridade (`tempo_aceite_min`, `tempo_resolucao_min`). Unique em `(unidade_id, categoria_id, prioridade)` |
| `tickets` | Chamado principal: `numero` (sequence), `titulo`, `descricao`, `prioridade` (enum), `status` (enum), `aberto_por_id`, `assignee_id`, `sla_deadline_at`, `sla_pausado_em`, `sla_segundos_pausados`, `execucao_id` (origem opcional), **`ticket_pai_id`** (auto-FK; ≠ null = é duplicado de outro; `on delete set null`, migration `20260720160000`) |
| `ticket_eventos` | Timeline imutável — bloqueada por `CREATE RULE ... DO INSTEAD NOTHING` em UPDATE e DELETE. `autor_id` **NOT NULL sem default** → o cliente SEMPRE passa `autor_id` (bug corrigido 2026-07-05). FK `autor_id` → `usuarios(id)` (repontada de auth.users em `20260703020000`, senão o embed `autor:usuarios` quebra a query) |
| `ticket_evidencias` | Fotos/vídeos/documentos. `uploaded_by` **NOT NULL** e `evento_id` devem ser passados pelo cliente (bugs 2026-07-05). Sobe no bucket `execucoes` em `tickets/<ticket_id>/...` |

**Enums:** `ticket_status` (aberto/em_tratamento/aguardando_informacao/aguardando_validacao/corrigido/nao_corrigido/corrigido_parcialmente/cancelado/improcedente/**`duplicado`** — este último adicionado em `20260720150000`; `corrigido_parcialmente` e `improcedente` não são mais oferecidos na UI desde 2026-07-05, só histórico), `ticket_prioridade` (critica/alta/media/baixa), `ticket_evento_tipo` (+ **`vinculo`/`desvinculo`** em `20260720150000`; `conclusao` em `20260703010000`)

**Triggers:**
- `trg_tickets_numero` — auto-incrementa `numero` via `ticket_numero_seq`
- `trg_tickets_sla` — calcula `sla_deadline_at` no insert (categoria específica → genérica da unidade)
- `trg_tickets_updated_at` — inline, sem `moddatetime()`
- `trg_tickets_sla_pausa` — pausa SLA ao entrar em `aguardando_informacao`, acumula segundos ao sair
- `trg_tickets_valida_vinculo` (`20260720160000`) — integridade do vínculo de duplicados: bloqueia auto-vínculo, cross-unidade, cadeia (principal que já é duplicado) e tornar duplicado um ticket que já é principal (mantém **flat**)

**RLS:** via `usuario_unidade`. Escrita de categorias/SLA exige `usuario_tem_permissao('ticket','categorias_gerir')`. **`tickets_leitura`** (recriada em `20260720160000`, **corrigida em `20260720170000`**): admin, responsável, abridor, membros da unidade (se sem responsável) **e o abridor de qualquer duplicado deste ticket** (interessado enxerga o principal — via função `eh_interessado_no_ticket`).
- ⚠️ **GOTCHA — RLS auto-referencial = recursão infinita (42P17):** a `20260720160000` colocou `select ... from tickets` DENTRO da policy de SELECT de `tickets` → o Postgres reaplica a policy recursivamente e aborta TODA leitura ("infinite recursion detected in policy for relation tickets"). **Regra:** qualquer checagem numa policy que precise LER a própria tabela (ou outra tabela cuja policy leia esta) deve ir para uma função **`SECURITY DEFINER`** (roda como dono, não reaplica RLS). Corrigido na `20260720170000` com `eh_interessado_no_ticket(uuid)`. Validado E2E em prod (2026-07-20). ⚠️ **Duplicados: enum `20260720150000` aplica SEPARADO e ANTES da `20260720160000`** (ADD VALUE não pode ser usado na mesma transação em que é criado). (Des)vínculo é server-side em `apps/api` (`/tickets/vincular`, `/desvincular`, service role — o responsável do principal pode não ter UPDATE no duplicado pela RLS).

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
| `empresa_assinaturas` | 1:1 com empresa. **Snapshot** dos termos (`plano_nome/tipo/valor/ciclo` + 3 limites) + estado (`status`: trial/ativo/inadimplente/cancelado), período de uso **mensal** ancorado no dia (`periodo_inicio/fim`), contadores que resetam por período (`execucoes_usadas`, `tokens_ia_usados`, `execucoes_extra`, `tokens_ia_extra`), trial (`trial_fim`, `ja_usou_trial`), troca agendada (`proximo_plano_id`, `troca_efetiva_em`), Asaas (`asaas_customer_id/subscription_id`). **Avisos de fim de trial** (`aviso_trial_5d_em`/`aviso_trial_1d_em`, `20260715120000`): idempotência do cron `/cron/billing/avisos-trial` (avisa admins por WA+email a 5d/1d do fim — ver `/ops`). RPC `empresa_dias_trial(empresa)` SECURITY DEFINER = dias até `trial_fim` (null fora de trial/vencido) p/ o banner `AvisoTrial` na Home. RLS: leitura admin_sistema OU Admin da empresa (perfil `…002`); escrita admin_sistema |
| `empresa_pacotes_comprados` | Auditoria de compras + capacidade permanente de armazenamento (`tipo, quantidade, valor, periodo_inicio`). Mesma RLS |
| `empresa_gestao_lembretes` (migration `20260719130000`) | Throttle dos **lembretes de gestão** ao admin (Fase 3). PK `(empresa_id, tipo)` + `ultimo_envio_em` — o cron `/cron/gestao/lembretes` só reenvia após 3 dias. `tipo` hoje = `pre_cadastros_pendentes`. RLS admin-only (cron usa service role). Ver `/biz`, `/ops` |
| `avancar_periodo_assinatura(empresa)` | SECURITY DEFINER. Expira trial→gratuito, aplica troca agendada, avança períodos mensais vencidos e zera contadores. Chamada por todas as funções de leitura/enforcement (mantém fresco sem cron) |
| triggers `billing_inc_execucao` / `billing_inc_tokens` | AFTER INSERT em `checklist_execucoes` (deriva empresa via unidade) e `uso_ia_eventos` — incrementam contadores do período |
| `billing_pode_executar` / `billing_pode_consumir_ia` / `billing_armazenamento_disponivel(empresa,bytes)` | Booleans de enforcement. Sem assinatura → não bloqueia; limite null → ilimitado |
| `billing_status(empresa)` → jsonb | Leitura consolidada (plano, período, uso×limite×extra dos 3 recursos). Valida permissão (admin_sistema ou Admin da empresa) — ⚠️ **não usar em cron** (exige admin logado; o cron lê `empresa_assinaturas` direto via service role) |
| `empresa_avisos_uso` (migration `20260719120000`) | Idempotência dos **alertas de limite de uso** ao admin (Fase 1). Chave `unique(empresa_id, recurso, faixa, periodo_ref)` — `recurso` ∈ execucoes/tokens_ia/armazenamento, `faixa` ∈ 80/100, `periodo_ref` = `periodo_inicio` da assinatura. Cron `/cron/billing/avisos-uso` grava 1 linha por aviso enviado; reseta por período. RLS admin-only (cron usa service role). Ver `/biz`, `/ops` |
| `sistema_alertas` (migration `20260720120000`) | Alertas de ops do painel `/sistema/alertas`. `id` texto (origem define a chave: `whatsapp-down-<ts>` ou id do webhook Railway), `alert_type/severity/message/value/threshold/service`, `acked/acked_at`, índice `created_at desc`. **Substitui o Map em memória** de `routes/alerts.ts` (escala horizontal — réplicas compartilham). API grava/lê via service role; leitura no painel mostra últimos 100 das últimas 24h. RLS admin-only. Ver `/ops` |
| `sistema_estado` (migration `20260720120000`) | KV interno `chave→valor` (+`atualizado_em`). Hoje só `whatsapp_ok` (`'true'/'false'`) — último estado do healthcheck do WhatsApp. **Substitui o `let ultimoWhatsappOk`** em memória de `routes/whatsapp.ts`, para o anti-spam de alerta funcionar com múltiplas réplicas. RLS admin-only. Ver `/ops` |

### ⚠️ Migrations 2026-07-05 — TICKETS (APLICAR NO SQL EDITOR — pendentes)
Correções do fluxo de ticket descobertas nos testes manuais (Tela 11). **Precisam ser aplicadas em prod pelo SQL Editor:**
- `20260703010000_ticket_evento_tipo_conclusao.sql` — `alter type ticket_evento_tipo add value if not exists 'conclusao'`. Sem isso, **concluir** quebra (fluxo direto emite `conclusao`; enum só tinha conclusao_proposta/validacao).
- `20260703020000_fix_ticket_eventos_fk_usuarios.sql` — repointa FK `ticket_eventos_autor_id_fkey` → `usuarios(id)` (era auth.users). Sem isso o embed `autor:usuarios(nome)` falha e a **timeline vem VAZIA**. (Mesmo gotcha da `20260614050000`, que cobriu `tickets` mas esqueceu `ticket_eventos`.)
- `20260703030000_tickets_atualizar_with_check.sql` — `tickets_atualizar` ganha `WITH CHECK` (mesma unidade). Sem isso, **transferir/reatribuir** para outro assignee barra operador não-abridor (USING vira check da linha nova).
- `20260703040000_storage_execucoes_tickets.sql` — `execucoes_upload/delete` passam a aceitar caminho `tickets/<ticket_id>/...` (comparação por texto, sem cast p/ uuid). Sem isso, **evidência de ticket não sobe**.
- `20260716150000_storage_execucoes_tarefas.sql` (✅) — mesmo padrão para `tarefas/<tarefa_execucao_id>/...` (escopado a `tarefa_execucoes.unidade_id`). Sem isso, **evidência de tarefa não sobe** ("new row violates row-level security policy"). Bucket `execucoes` aceita 3 tipos de 1º segmento: id de `checklist_execucoes`, `tickets`, `tarefas`.
- **Já aplicadas nesta leva**: `20260702020000` (buscar_email_por_cpf normaliza `\D`), `20260703000000` (`usuarios_leitura_scoped` via função `partilha_empresa(uuid)` SECURITY DEFINER — operador lê nome de colega; a subquery direta em `usuario_empresa` era barrada pelo RLS aninhado).
- **UPDATE de dados** (backfill de evidência órfã da abertura): `update ticket_evidencias set evento_id = (select id from ticket_eventos e where e.ticket_id=ticket_evidencias.ticket_id and e.tipo='abertura' order by criado_em limit 1) where evento_id is null`.

### Migrations 2026-07-08 — NOTIFICAÇÕES (novos tipos)
- `20260708120000_notif_tipos_add.sql` (✅ aplicada) — `alter type notificacao_tipo add value if not exists 'plano_devolvido_n1' / 'tarefa_publicada'`. **Rodar sozinha** (enum add value não pode ser usado na mesma transação do seed).
- `20260708120001_notif_templates_novos.sql` (✅ aplicada) — `seed_notificacao_templates_extra()` (defaults dos 2 tipos: plano_devolvido_n1 wa+email, tarefa_publicada só wa) + trigger `trg_seed_notif_empresa` passa a chamar as duas funções + backfill das empresas existentes.

### Migrations 2026-07-05/06 — PLANOS DE AÇÃO
- `20260703050000_subgrupo_tem_n2.sql` (✅ aplicada) — função `subgrupo_tem_n2(uuid)` SECURITY DEFINER (devolve booleano). Corrige "Enviar para N2" desabilitado p/ N1 não-admin: o count `usuario_subgrupo funcao='nivel_2'` roda sob RLS (só a própria linha via `usuario_subgrupo_propria`) → N1 não via o N2. Usada em `gestao/planos-acao/[id]`.
- **⚠️ Gotcha `usuario_subgrupo.funcao`**: valores REAIS em prod são **minúsculos** (`operacao`/`nivel_1`/`nivel_2`/null), como o código usa. A migration `20260624000000` (CHECK capitalizado `'Operação'/'Nível 1'/'Nível 2'`) **NÃO foi aplicada** — não usar os valores capitalizados. RLS de SELECT: só `usuario_subgrupo_propria` (própria linha) + admin/admin_empresa; contagens de peers precisam de função SECURITY DEFINER.
- **PDF da execução é gerado sob demanda** (`POST /api/execucoes/[id]/pdf` grava `checklist_execucoes.pdf_url`), não no finalizar. Tela do plano agora tem botão "Gerar PDF" quando nulo (`38551da`).

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

### Serviços / Entitlements + billing (✅ TUDO aplicado 2026-07-09/11)
- `servicos` (chave, nome, tipo `modulo|caracteristica`, `recursos text[]`, flag, ordem, ativo, **`padrao`**) + `plano_servicos` (plano_id × servico_id). Migration base `20260709050000`; `padrao` em `...070000`. RLS: SELECT authenticated; escrita `is_admin_sistema`. Empresa herda do `empresa_assinaturas.plano_id`.
- **Funções (SECURITY DEFINER)**:
  - `empresa_libera_recurso(empresa_id, recurso)` (`...060000`, +padrão em `...080000`) — espelha o opt-in: sem plano/sem serviços = true; senão true se um serviço-módulo do plano OU um serviço `padrao` contém o recurso.
  - `empresa_fase_assinatura(empresa_id)` → `ativa|carencia|bloqueada` (`...200000`, +cortesia em `...230000`): `pago`/`cortesia`/sem-assinatura = ativa; trial vencido → carência (+30d) → bloqueada.
  - `empresa_pode_criar(empresa_id)` = fase = 'ativa' (`...200000`).
- **RLS fase 2 (gate por plano)** — `empresa_libera_recurso` nas write policies de **autoria** (incl. `*_admin_empresa`; tickets via policy `restrictive` de insert): Dashboards `...060000`, Documentos `...090000`, Tarefas `...100000`, Tickets `...110000`, Agendamentos `...120000`, Turnos `...130000`, Padrões `...140000`, Planos de Ação `...150000`. Padrão amplo (qualquer ação) em `...170000`.
- **Bloqueio de criação por carência** (`...220000`): policies `restrictive` de insert em `checklists/tarefa_listas/tickets` = `is_admin_sistema() OR empresa_pode_criar(empresa)`.
- **Planos**: `planos.tipo` inclui `cortesia` (`...230000`); `planos.padrao` (índice único parcial, `...210000`) = plano com que empresa nova nasce; `planos.selecionavel_empresa` (`20260713120000`, backfill `tipo='pago'`→true) = empresa contrata sozinha (`/gestao/plano`) vs só-admin atribui. Permissões `usuarios/importar` + `usuarios/aprovar_precadastro` (`...160000`, com backfill). Ver `/biz`, `/security`.
- **Ajustes 2026-07-14** (UPDATEs no catálogo, ✅ aplicados): serviço `ia` renomeado "Serviços de IA" (cobre Consulta Inteligente + IA-foto + Relatórios) — `20260714130000`; recurso `nao_execucao` adicionado aos `recursos` do serviço **Checklists** (`20260714140000`) — antes não estava em nenhum serviço, então sumia do menu do admin da empresa em plano configurado.
- **⚠️ Recursos CORE (não gateáveis)**: `unidades`, `perfis`, `usuarios` NÃO pertencem a nenhum serviço-módulo → num plano configurado o gate de menu os escondia até para o admin da empresa (bug 2026-07-14). Fix é **client-side** em `lib/entitlements/gating.ts` (`RECURSOS_CORE` sempre passam); não há recurso `unidades` em `permissoes` (é só um `perm` de menu). Ver `/security`.

### Relatórios por IA — Feature 2 de IA (migration `20260714120000_relatorios_ia.sql`, ✅ aplicada 2026-07-14)
IA gera relatório das execuções de um checklist nas últimas X horas (1–24h). Entitlement = característica `ia` (gate na UI + na rota que gasta token; NÃO é módulo, então NÃO usa `empresa_libera_recurso`). Validada E2E em prod (cenários caminho-feliz / bloqueio-sem-IA / permissões-por-ação).
| Table | Description |
|-------|-------------|
| `relatorio_modelos` | Template reutilizável: `unidade_id`, `checklist_id`, `nome`, `periodo_horas` (int **1–24** check), `prompt` (text, pré-preenchido com seções/atividades do checklist), `criado_por`. RLS: leitura por unidade + `is_admin_empresa_unidade` + admin sistema; insert/update/delete checam `usuario_tem_permissao('relatorios', criar/editar/excluir)`; **`empresa_pode_criar` restrictive insert** (bloqueia em somente-leitura pós-trial) |
| `relatorios_gerados` | Instância: `modelo_id`, `unidade_id` (denormalizado p/ RLS), `status` (`gerando`/`pronto`/`erro`), `periodo_de`/`periodo_ate` (snapshot da janela REAL), `conteudo` (text), `erro_msg`, `gerado_por`. RLS **só leitura** por unidade (escrita é da rota via service role) |

**Rota** `apps/web/app/api/relatorios/gerar/route.ts` (assíncrona): valida auth + permissão `executar` (checa `perfil_permissoes` na mão, service role) + gate `ia` + `billing_pode_consumir_ia` + `empresa_pode_criar` → insere `gerando`, devolve id → **fire-and-forget** compila execuções→markdown (`lib/relatorios/compilarExecucoes.ts`), failover de provedores (não-streaming), grava `pronto`/`erro` + `uso_ia_eventos`. Front faz **polling**. Ver `/biz`, `/uimap`.

### Dashboards — painéis públicos de TV (migration `20260709030000_dashboards.sql`, ✅ aplicada)
- `dashboards` (unidade_id, nome, `token` único default `encode(gen_random_bytes(16),'hex')`, transicao_segundos, refresh_segundos) + `dashboard_paineis` (dashboard_id, ordem, titulo, `tipo`, `atividade_id` → checklist_atividades, `checklist_id` → checklists, janela_horas, `alerta_silencio_horas`). Permissão `dashboards` (ver/criar/deletar), seed p/ perfis `is_system`. RLS: leitura por membro da unidade / admin-empresa; escrita por `usuario_tem_permissao('dashboards','criar')` + unidade (ou admin). **Leitura pública NÃO usa RLS** — a rota `/api/painel/[token]` usa service-role e é escopada pelo token. Ver `/biz`, `/security`.
- **Frescor por painel** (`20260711120000_painel_alerta_silencio.sql`, ✅ aplicada): `dashboard_paineis.alerta_silencio_horas int` nullable — horas sem nova leitura até o selo de frescor virar alerta (null = sem alerta). Ver `/biz`.
- **Painel tipo checklist + tempo de execução** (`20260711140000_painel_checklist.sql`, ✅ aplicada): `dashboard_paineis.tipo` (`'atividade'`|`'checklist'`, default `'atividade'`) + `checklist_id` FK; `atividade_id` vira **nullable**; CHECK `dashboard_paineis_alvo_ck` garante **exatamente um** alvo conforme o tipo (painéis antigos satisfazem o default). `checklist_execucoes.iniciado_em timestamptz` = carimbo de abertura da execução (cliente grava só no fresh insert "de uma vez"; retomada/agendada/workflow/offline ficam null) → base do tempo médio. Ver `/biz`.
- **Performance (2026-07-09)**: leitura leve (SELECT indexado, MVCC não trava o transacional). Salvaguardas: migration `20260709040000` = índice composto `checklist_execucao_respostas(atividade_id, criado_em)` (range scan da janela) + **cache em memória de 15s por token** na rota (colapsa N TVs do mesmo dashboard num hit + anti-abuso do link público). Painel de checklist adiciona `idx_dashboard_paineis_checklist` e reusa `idx_execucoes_checklist`. Escala futura = **read replica do Supabase** apontando só a rota pública (não banco à parte).

### Storage `empresas` — upload de arquivo de documento (2026-07-09, ✅ aplicadas)
- **Gotcha do bucket compartilhado**: `empresas` guarda logos + imagens de etapa (`etapas/`) + PDF da Consulta Inteligente (`documentos/`). O INSERT tinha policy só p/ `is_admin_sistema()` (`upload_logo`, do hardening 20260606000005) e p/ `etapas/%` (20260620160000). Faltava o prefixo **`documentos/%`** → admin da empresa/gestor batia em "violates RLS" ao subir o PDF.
- `20260709000000_empresas_bucket_pdf.sql` — `file_size_limit=10MB` + `allowed_mime_types=null` (bucket criado no painel podia ter tipo só-imagem).
- `20260709020000_storage_documentos_arquivo.sql` — **fix real**: policy `documentos_arquivo_upload/delete` no prefixo `documentos/%` (`is_admin_sistema() OR usuario_tem_permissao('documentos','criar')`). Cliente parou de usar `upsert` (caminho já único). ⚠️ Ao adicionar prefixo novo em bucket compartilhado, criar a policy de storage do prefixo. Ver `/security`.

### Consulta Inteligente — markdown em cache (migration `20260708150000_documento_markdown.sql`, ⏳ aplicar)
- `documentos.conteudo_markdown text` + `markdown_gerado_em timestamptz` — markdown extraído do PDF (1× via IA) para a consulta não reanexar o PDF a cada pergunta. Gerado em `lib/documentoMarkdown.ts` (`gerarMarkdownDocumento`) via `POST /api/documentos/extrair-markdown` (no upload) e lazy na 1ª consulta. Consulta usa o texto (barato, qualquer provedor); só cai pro PDF anexado se não houver markdown (imagem ou conversão falhou). Sem RLS nova.

### Listas de Tarefas — data de liberação (migration `20260708140000_tarefa_liberacao.sql`, ✅ aplicada 2026-07-08)
- `tarefa_listas.liberacao_em timestamptz null` — quando a lista publicada passa a aparecer na Operação (null = imediata). Futuro = lista "agendada", oculta pro operador. Independe da janela de abertura (que rege o encerramento). Lógica derivada em `lib/tarefas.ts` (`liberada()`, `statusTarefa()`). Sem mudança de RLS.

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

**Enums:** `notificacao_tipo` (ticket_aberto/ticket_movimentado/plano_aberto/plano_enviado_n2/**plano_devolvido_n1**/**tarefa_publicada**/reset_senha), `notificacao_canal` (whatsapp/email)

⚠️ `reset_senha` agora envia **código de 6 dígitos** (`{{codigo}}`), não link — atualizado em `seed_notificacao_templates` na migration 20260610070000 (também faz `update` nos templates existentes que ainda tinham `{{link}}`).

**Função `seed_notificacao_templates(empresa_id)`** — insere 10 templates padrão (5 tipos × 2 canais) com `on conflict do nothing`. Dollar-quoting correto: `$tpl$...$tpl$` dentro de função `$$...$$`.

**Novos tipos (2026-07-08, migrations `20260708120000` + `20260708120001`, ✅ aplicadas):** `plano_devolvido_n1` (WhatsApp+email; N2 devolve o plano ao N1) e `tarefa_publicada` (**só WhatsApp**; nova lista de tarefas). ⚠️ **Gotcha do enum**: `alter type ... add value` foi numa migration **separada** do seed — Postgres não deixa usar um valor de enum recém-criado na mesma transação. Os defaults ficam em `seed_notificacao_templates_extra(empresa_id)` (função nova, chamada junto da original no trigger `trg_seed_notif_empresa` + backfill das empresas existentes). API: `NotificacaoTipo` estendido; `planos-acao.ts` mapeia `devolvido_n1`→`plano_devolvido_n1` (removeu o fallback-only); `tarefas.ts` usa `buscarTemplate('tarefa_publicada')` (desativado → não dispara). Total: **13 registros/empresa**.

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

⚠️ **`usuario_esta_no_turno` com `turno.ativo = false`**: a função faz `join turnos t ... where t.ativo` — se o turno estiver inativo, `not found` → retorna `true` (usuário sempre "dentro do turno", sem restrição). Comportamento esperado, mas usuários não devem ficar alocados em turnos inativos. Ao inativar um turno, desatar `turno_id` dos usuários antes. Descoberto no teste 9.4.11 (2026-07-02).

⚠️ **Timezone das funções de turno**: `usuario_esta_no_turno()` e derivadas rodam em UTC (timezone padrão do Supabase). `hora_inicio` / janelas dos dias são interpretadas como UTC. Admins que configuram horários em BRT (UTC-3) devem somar 3h ao cadastrar. Bug de design — sem correção no schema atual.

**Modo fora do turno** (migration `20260622120000`) — 3 funções derivadas (todas `sem turno/inativo` = não restringe):
- `usuario_recebe_notificacao(uid, momento)` → `false` se turno ativo modo `notificacao` e fora do horário, **OU se o usuário está de férias** (`20260715130000`: colunas `usuarios.ferias_inicio/ferias_fim date` + branch de férias na função — data UTC do momento `between` início e fim, inclusivo). Usada nas 3 rotas de notificação WhatsApp (`/planos-acao/notificar`, `/tarefas/notificar`, `/tickets/notificar`). Espelho TS (só p/ teste): `estaDeFerias`/`usuarioRecebeNotificacao` em `lib/turnos.ts`. Editado na `UsuarioModal` (gestão de usuários/grupos).
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
