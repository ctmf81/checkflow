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
- `resultado` = `'aprovado'` se todas as atividades conformes; `'reprovado'` se qualquer `calcularValidacao() === false`
- `data_expiracao` = `data_execucao + tempo_guarda_meses` meses (calculado pela aplicação)
- `tempo_guarda_meses` padrão: 12. Opções: 1, 3, 6, 12, 24, 36, 48, 64 meses
- Execuções são isoladas por `unidade_id` via RLS
- Quando vem de workflow (`?wf_item=<id>`): insert com `status='em_andamento'` → linka `workflow_item_execucoes` → update para `'concluido'` → trigger avança o pipeline

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

## Workflows
- Pipeline de checklists com estágios **sequenciais** e execução **paralela dentro** de cada estágio
- Transversal à unidade — `workflows` pertence à `empresa_id`, execuções são por `unidade_id`
- Cada item de estágio tem `subgrupo_id` opcional — define quem vê o checklist em Operação
- Condição de avanço por estágio: `todos_aprovados` | `todos_concluidos` | `qualquer_aprovado`
- Motor 100% em Postgres: trigger em `checklist_execucoes` avança estágio automaticamente
- Status de workflow_execucoes: `em_andamento` → `concluido` (sucesso) | `bloqueado` (reprovado sem condição satisfeita) | `cancelado`
- Em Operação, itens de workflow `liberados` aparecem na seção "Workflows em andamento" antes dos checklists avulsos

## Agendamentos (recorrência)
- Tela `/gestao/agendamentos`: cria disparos recorrentes de workflows ou checklists
- Recorrência personalizada: a cada X horas/dias/meses, a partir de uma data/hora de referência (`referencia_inicio`)
- `proxima_execucao` calculada automaticamente em Postgres (trigger); processamento via `agendamentos_processar()` chamada periodicamente por `pg_cron`
- Ativar/pausar e excluir agendamentos pela própria tela

## Motivo de Não Execução
- Configurado na criação do checklist (`checklist_nao_execucao_motivos`), tipado como `'checklist'` (todo o checklist) ou `'atividade'` (atividade obrigatória individual)
- Atividade obrigatória com motivos do tipo `'atividade'` associados exibe link "Não consigo executar esta atividade" → seleciona motivo, marca como "Não executado" (conta como respondida), pode desfazer
- Checklist com motivos do tipo `'checklist'` associados exibe link "Não foi possível executar este checklist" → modal com motivo + observação → cria `checklist_execucoes` direto com `status='nao_executado'`

## Termo de Uso
- **Único para todas as empresas** (não é configurável por tenant) — editado centralmente pelo admin do sistema em `/sistema/termos`
- Exibido como modal bloqueante (`TermosGate` + `TermosDeUsoModal`) no primeiro acesso de qualquer usuário (gestão, operação e sistema)
- Usuário precisa rolar o texto até o fim para habilitar o botão de aceite
- Aceite grava `usuarios.termos_aceitos_em` + `termos_versao_aceita`
- Ao publicar uma edição em `/sistema/termos`, é criada uma **nova versão** (registro novo, não sobrescreve) — todos os usuários com versão antiga são automaticamente questionados de novo no próximo acesso. Histórico de versões fica visível na própria tela de admin

## Turnos
- Cadastro em `/gestao/configuracoes/turnos`, dois tipos:
  - **Administrativo**: horário fixo configurável por dia da semana (ex: seg-sex 08-17h, sábado 08-11h — cada dia com sua própria janela)
  - **Escala**: ciclo rotativo trabalho/folga a partir de uma data de referência (ex: 12x36, 24x48 — calculado continuamente, sem precisar recadastrar)
- Vínculo opcional (1 turno por usuário) feito na edição do usuário (`UsuarioModal.tsx` em `/gestao/acessos/usuarios`)
- Efeito **único**: usuário fora do horário do seu turno não recebe mensagens de moderação por **WhatsApp** (e-mail continua sendo enviado, e ele continua podendo acessar/moderar planos de ação normalmente a qualquer hora)
- Usuário sem turno cadastrado nunca é restringido — recebe a qualquer hora
- Aplica-se tanto a moderadores N1 quanto N2 (mesma regra de notificação por não conformidade)

## Workflow + Checklist: regras de integridade
- Não é possível inativar um checklist em uso por workflow `publicado` (trigger bloqueia com exceção)
- Quem cria workflows pode usar checklists de outros grupos/subgrupos — picker tem seletor de Grupo + Subgrupo, pré-selecionado com o grupo/subgrupo atual do usuário

## Perfis — flag "público"
- `perfis.publico` (boolean): determina quem pode atribuir aquele perfil a um usuário
  - **Público** = pode ser atribuído por quem gerencia usuários do próprio grupo/setor (ex: substituição temporária de um líder de férias, sem precisar do admin da empresa)
  - **Não público** = só pode ser atribuído pelo Administrador da empresa
- ✅ Reforçado em DB via trigger `trg_validar_troca_perfil` (migration 20260607100800) — bloqueia a troca para perfil não-público se quem altera não for Admin da empresa/sistema, mesmo via chamada direta à API
- ✅ Aplicado em `UsuarioModal.tsx`: verifica o `perfil_id` de quem está editando em `usuario_empresa` — se for "Admin da empresa" (`00000000-0000-0000-0000-000000000002`) ou "Admin de sistema" (`...001`), vê todos os perfis; caso contrário, só vê perfis `publico = true` (+ o perfil atual do usuário sendo editado, para não escondê-lo)

## Tickets / Chamados

### Abertura
- Qualquer usuário autenticado pode abrir um ticket
- Pode ser aberto de **`/operacao`** (FAB "Abrir Ticket" — avulso, sem vínculo) ou de **`/gestao/tickets`** (listagem)
- **Grupo + subgrupo são obrigatórios** — destino do chamado
- Categoria é opcional — fallback automático para "Sem categoria" (criada por `garantir_categoria_generica()`)
- `execucao_id` registra origem quando aberto dentro de uma execução (campo opcional)

### Fluxo de Status
```
aberto → em_tratamento (aceite) → aguardando_informacao ↔ em_tratamento
       → aguardando_validacao (conclusão proposta)
       → corrigido | nao_corrigido | corrigido_parcialmente (validação pelo abridor)
       → cancelado | improcedente (a qualquer momento)
       → aberto (reabertura)
```
- Qualquer membro do grupo/subgrupo destino pode assumir (virar assignee)
- Cada transição exige **texto de observação obrigatório** + evidências opcionais
- Timeline de eventos é **imutável** (blocked por CREATE RULE)

### Devolução
- Assignee solicita informação ao abridor (`aguardando_informacao`)
- Sem deadline — tempo por participante é rastreado via eventos
- Abridor responde → volta para `em_tratamento`

### SLA
- Configurável por categoria + prioridade em `/gestao/tickets/sla`
- Pausa acumula em `sla_segundos_pausados` enquanto status = `aguardando_informacao`
- Semáforo visual: >50% restante = verde, 10–50% = amarelo, <10% ou vencido = vermelho

### Notificações
- Abertura → todos do subgrupo destino (turno respeitado para WA)
- Qualquer movimentação → abridor + assignee

### Permissões (`recurso = 'ticket'`)
| Ação | Descrição |
|------|-----------|
| `ver` | Visualizar tickets |
| `criar` | Abrir novos tickets |
| `tratar` | Assumir e tratar tickets |
| `cancelar` | Cancelar / marcar improcedente |
| `categorias_gerir` | Gerenciar categorias de tickets |

## Templates de Notificação

- Cada empresa tem **10 templates** padrão (5 tipos × 2 canais: whatsapp/email)
- Seed automático ao criar nova empresa (trigger `trg_empresa_notif_seed`)
- Admin pode editar corpo, assunto (email), e desabilitar canal por tipo
- Interpolação com `{{variavel}}` — variáveis disponíveis por tipo documentadas na UI
- Fallback: se template não encontrado no banco → usa mensagem hardcoded na API
- Gerenciado em `/gestao/configuracoes/notificacoes`

### Regra de destinatários por evento
| Evento | Destinatários |
|--------|--------------|
| `ticket_aberto` | Todos do subgrupo destino |
| `ticket_movimentado` | Abridor + assignee |
| `plano_aberto` | **Apenas N1** do subgrupo |
| `plano_enviado_n2` | **Apenas N2** do subgrupo |
| `reset_senha` | O próprio usuário (WA + email) |

## Regras de Negócio Críticas
- RLS obrigatório em todas as tabelas de dados de usuário
- Checklist publicado não pode ter sua estrutura mutada
- Operação não tem sidebar — layout separado em `operacao/layout.tsx`
- Executor não pode digitar localização — apenas GPS automático
- Vídeo da galeria com >1h recebe alerta visível (anti-fraude)
- QR scanner (BarcodeDetector API) só funciona no Chrome Android — exibe erro claro em outros browsers

## Evolution Rule
When a new product rule is consolidated, append it as a short bullet under the relevant section.
