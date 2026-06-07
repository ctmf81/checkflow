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
| `empresas` | Top-level tenants |
| `unidades` | Units within a company (`empresa_id`, `grupo_label`, `subgrupo_label`) |
| `usuarios` | App users linked to `auth.users` |
| `usuario_empresa` | M:N user ↔ empresa |
| `usuario_unidade` | M:N user ↔ unidade |
| `sessao_usuario` | Last active empresa/unidade/ambiente per user |

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

### Permissões — catálogo completo (migration 20260607100332)
Adiciona `permissoes` faltantes que existiam só na UI do `PerfilModal` (sem registro em DB, logo marcar não tinha efeito):
`grupos.adicionar_usuario/gerenciar_usuario`, `subgrupos.gerenciar_funcoes`, `workflows.*`, `turnos.*`, `catalogos.*`, `documentos.*`, `causa_raiz.*`, `nao_execucao.*`, `planos_acao.ver/moderar_n1/moderar_n2`. Concede automaticamente aos perfis `is_system = true`.

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
