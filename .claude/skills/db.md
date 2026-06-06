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

## Evolution Rule
When the user says "Update /db with new table [X]", add X to the table index with a one-line description and migration filename. Keep constraint documentation up to date.
