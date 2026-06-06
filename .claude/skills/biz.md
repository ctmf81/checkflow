---
name: biz
description: Business rules and product logic for CheckFlow. Consult this skill before implementing any feature that touches plans, billing, access control, checklist flows, versioning, or user permissions. Also trigger when the user asks "how should this work?" or "what's the rule for X?" about product behavior.
---

# Business Rules

## Core Product
CheckFlow is a checklist management SaaS with two distinct areas:
- **Gestão** (`/gestao`) — admin backoffice: create checklists, configure activities, manage users/units
- **Operação** (`/operacao`) — mobile-first execution interface: operators fill checklists on device

## Tenant / Access Hierarchy
```
Empresa → Unidade → Usuário
                 → Checklist (published)
                 → Grupos / Subgrupos (optional taxonomy)
```
- Users belong to one or more `unidade` via `usuario_unidade`
- Checklists are scoped to a `unidade_id`
- Only published checklists appear in Operação

## Checklist Lifecycle
1. **Rascunho** — editable, not visible in Operação
2. **Publicado** — visible in Operação, creates immutable version snapshot in `checklist_versoes`
3. **Inativo** — hidden from Operação, not deleted

Rule: **never mutate a published checklist structure** — create a new version instead.

## Activity Types & Validation Rules
| Tipo | Validação automática |
|------|---------------------|
| `sim_nao` | Conforme/Não conforme vs `config.esperado` |
| `numero` | Conforme se `min ≤ valor ≤ max` (config.min / config.max) |
| `multipla_escolha` | Não conforme se qualquer seleção tem `e_valido = false` |
| `catalogo` | Sem validação — apenas seleção de item de `catalogo_valores` |
| `texto` | Sem validação — máscara (9=digit, A=upper, *=any), opcional QR scan |
| `foto` | Sem validação — captura obrigatória se `obrigatoria = true` |
| `video` | Sem validação — alerta se arquivo da galeria tem >1h (lastModified) |
| `localizacao` | Sem validação — GPS only (Nominatim reverse geocoding), sem input manual |
| `assinatura` | Sem validação — reservado para app móvel nativo |
| `data_hora` | Sem validação — datetime-local input |

## Execução de Checklist
- Ao finalizar, salva em `checklist_execucoes` com `status = 'concluido'`
- `data_expiracao` = `data_execucao + tempo_guarda_meses` meses (calculado pela aplicação)
- `tempo_guarda_meses` padrão: 12. Opções: 1, 3, 6, 12, 24, 36, 48, 64 meses
- Execuções são isoladas por `unidade_id` via RLS

## Atividades Dependentes
- Uma atividade pode ter `atividade_pai_id` + `valor_gatilho`
- Ela só aparece na execução quando a resposta do pai === `valor_gatilho`
- Suporta múltipla escolha: `valor_gatilho` comparado com array de seleção

## Catálogo
- Estrutura: `catalogos` (metadados) → `catalogo_valores` (itens)
- Cada valor tem: `valor_chave`, `atributo_1..4`, `imagem_url`
- Labels dos atributos vêm de `catalogos.atributo_1..4`
- Na execução: busca por texto, card expandido com imagem + todos atributos ao selecionar

## WhatsApp (Evolution API)
- Integração via Evolution API v2.2.3 (Baileys)
- Config armazenada em localStorage (`checkflow_evo_config`), não no DB
- Status verificado a cada 5s via `POST /whatsapp/status`
- QR gerado via `POST /whatsapp/conectar` (proxy no Fastify)
- ⚠️ Problema conhecido: `connectionStatus: "close"` se Redis não está disponível
  → Solução: `CACHE_REDIS_ENABLED=false` nas env vars da Evolution API no Railway

## Regras de Negócio Críticas
- RLS obrigatório em todas as tabelas de dados de usuário
- Checklist publicado não pode ter sua estrutura mutada
- Operação não tem sidebar — layout separado em `operacao/layout.tsx`
- Executor não pode digitar localização — apenas GPS automático
- Vídeo da galeria com >1h recebe alerta visível (anti-fraude)
- QR scanner (BarcodeDetector API) só funciona no Chrome Android — exibe erro claro em outros browsers

## Evolution Rule
When a new product rule is consolidated, append it as a short bullet under the relevant section.
