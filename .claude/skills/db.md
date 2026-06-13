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

## Table Index

### Tenant & Auth
| Table | Description |
|-------|-------------|
| `empresas` | Top-level tenants. Exclusão definitiva via RPC `excluir_empresa_cascata(p_empresa_id)` (somente `is_admin_sistema()`, somente status `inativo`) — 20260610040000 ajustou FKs (checklist_execucoes, workflow_execucoes, planos_acao, checklist_execucao_respostas) para `on delete cascade`. **20260610080000** adicionou: `parceiro_id` (FK → `parceiros`, on delete set null), `parceiro_percentual numeric(5,2)` (0-100), `plano text`, `valor_mensalidade numeric(10,2)`, `status_pagamento text` default `'pendente'` (em_dia/pendente/inadimplente/cancelado), `pagamento_vencimento date` |
| `unidades` | Units within a company (`empresa_id`, `grupo_label`, `subgrupo_label`) |
| `usuarios` | App users linked to `auth.users`. `cpf` (login, único) e `telefone` (WhatsApp, único quando preenchido — index `usuarios_telefone_key`, 20260610050000) são obrigatórios para novos cadastros (UI/API validam 11/10-11 dígitos); `email` é opcional — sem e-mail real, gera-se `<cpf>@checkflow.local`. View `usuarios_sem_contato` lista cadastros legados sem cpf/telefone |
| `usuario_empresa` | M:N user ↔ empresa |
| `usuario_unidade` | M:N user ↔ unidade |
| `sessao_usuario` | Last active empresa/unidade/ambiente per user |
| `password_reset_tokens` | OTP de 6 dígitos para login por código (20260610060000). `tipo`: `primeiro_acesso`\|`reset_admin`\|`self_service`\|`sessao_senha`. `codigo_hash` (sha256), `expira_em` (15min OTP / 10min sessão), `tentativas` (máx 5), `usado`. Sem RLS policies — só service role (`apps/web/lib/passwordReset.ts`) |

### Taxonomy
| Table | Description |
|-------|-------------|
| `grupos` | Checklist grouping (`unidade_id`) |
| `subgrupos` | Sub-grouping within grupo |

### Checklists
| Table | Description | Migration |
|-------|-------------|-----------|
| `checklists` | Headers: `nome`, `status`, `versao_atual`, `tempo_guarda_meses`, `subgrupo_id` | 20260603000017, 20260606000002 |
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

### Hardening de regras (migration 20260611134557, ✅ aplicada)
- Policy `tickets_atualizar`: branch `usuario_tem_permissao('ticket','tratar')` agora exige vínculo com a unidade do ticket
- `workflow_on_checklist_concluido()`: `resultado` nulo conta como **reprovado** (fail-safe — nunca avança estágio por omissão)
- `checklist_execucoes.agendamento_id` (FK → agendamentos) + `agendamentos_processar()` reescrita: execução agendada nasce com `executado_por` **null** (pendência da unidade, não execução do gestor) e `data_expiracao` calculada do `tempo_guarda_meses`

### Integrações de IA (migration 20260612235259, ⏳ não aplicada)
| Table | Description |
|-------|-------------|
| `ia_provedores` | Provedores de IA da Consulta Inteligente: `provedor` (unique: gemini/anthropic/openai/groq/**custom1/custom2**), `api_key` (secreta — só lida no servidor via service key, UI nunca seleciona), `chave_mascara` (`••••1234`, segura p/ exibir), `modelo` (override), `base_url`+`nome_exibicao` (só para custom1/2 — OpenAI-compatible: SiliconFlow, DashScope, OpenRouter…), `ativo`, `ordem` (failover). RLS admin-only. Migrations 20260612235259 (base) + 20260613001046 (custom) |

Rota `/api/documentos/consultar` lê `ia_provedores` (ativo, por ordem) como fonte primária das chaves, com env var de fallback. Gerenciado em `/sistema/integracoes-ia`.

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

**Trigger `trg_empresa_notif_seed`** — executa seed automaticamente em cada novo insert em `empresas`.

⚠️ **Gotcha de dollar-quoting**: dentro de função `$$...$$`, use `$tpl$...$tpl$` para strings multi-linha — nunca `$$tpl$...$tpl$` (o `$$` fecha a função prematuramente).

### Termos de Uso (migration 20260607000003)
| Table | Description |
|-------|-------------|
| `termos_uso` | Texto único do termo, válido para TODAS as empresas: `texto`, `versao` (string livre, ex timestamp `'2026-06-07 14:30'`), `atualizado_em`, `atualizado_por`. A versão vigente é o registro mais recente (`order by atualizado_em desc limit 1`) — histórico é preservado |

`usuarios.termos_aceitos_em` (timestamptz) + `termos_versao_aceita` (text) — registra o aceite individual.
Editado pelo admin em `/sistema/termos` (`TermosAdminPage`): salvar **insere uma nova versão** (não faz update), forçando reaceite de todos os usuários automaticamente — sem nova migration. RLS: leitura liberada a todos, escrita restrita a `is_admin_sistema()`.

### Turnos (migration 20260607000002)
| Table | Description |
|-------|-------------|
| `turnos` | `nome`, `tipo` (`administrativo`\|`escala`), `config` jsonb, `ativo` |

**`config` shapes:**
```
administrativo: { "dias": [ { "dia": 0-6 (0=domingo), "inicio": "HH:MM", "fim": "HH:MM" }, ... ] }
                 -- cada dia da semana pode ter horário próprio (ex: sáb 08-11h, seg-sex 08-17h)
escala:         { "data_referencia": "YYYY-MM-DD", "hora_inicio": "HH:MM",
                  "horas_trabalho": number, "horas_folga": number }
                 -- ciclo contínuo a partir da referência (ex: 12x36, 24x48)
```

`usuarios.turno_id` (nullable FK → `turnos`) — vínculo opcional 1 turno por usuário, editável em `UsuarioModal.tsx`.
Função `usuario_esta_no_turno(p_usuario_id, p_momento default now())` → boolean — calcula se o usuário está dentro do turno **agora**, suportando ambos os tipos (administrativo: olha dia da semana + janela; escala: calcula posição no ciclo trabalho/folga desde `data_referencia`). Sem turno = sempre `true` (não restringe). Usada em `/planos-acao/notificar` (API) para pular o envio de WhatsApp a quem está fora do turno — não afeta e-mail nem a capacidade de moderar pelo sistema.

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
| `causa_raiz` | Root cause categories |

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

## Evolution Rule
When the user says "Update /db with new table [X]", add X to the table index with a one-line description and migration filename. Keep constraint documentation up to date.
