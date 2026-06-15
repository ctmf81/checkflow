---
name: status
description: Quick project status snapshot for CheckFlow. Run at the start of any session, after finishing a task, or whenever you need to re-orient. Trigger when the user says "what did we do?", "where are we?", "give me a status", or starts a new session and needs context fast.
---

# Project Status Snapshot

When invoked, silently execute:
```bash
git status -s
git log -n 5 --oneline
```

Then produce a summary of **at most 3 lines**:
```
Recently finished: [inferred from git log]
In progress now:   [inferred from git status]
Next logical step: [one-sentence inference, only if obvious]
```

## Rules
- Keep it telegraphic — no explanations, no extra headers
- If `git status -s` is clean, say "nothing in progress"
- Goal: full orientation in under 5 seconds

---

## Pendências (atualizado 2026-06-12)
- ⏳ **Rotacionar chave da Evolution** (boa higiene — `checkflow_evo_key_2026` já passou pelo git): trocar `AUTHENTICATION_API_KEY` (serviço Evolution) + `EVOLUTION_API_KEY` (serviço API) pelo MESMO valor novo, quase simultâneo. WhatsApp/sessão Baileys NÃO cai (auth key ≠ sessão). Validar depois com `POST /whatsapp/status` body `{}` → `conectado:true`
- ✅ Colunas financeiras movidas de `empresas` p/ `empresa_financeiro` (admin-only) em 2026-06-13 — migration 20260613002351 (⏳ aplicar). Resolve a exposição via RLS de linha. Ajustados: rota parceiros, `/sistema/empresas/[id]`, `/sistema/parceiros`, pentest §10

- ✅ `pg_cron` configurado em 2026-06-11 (job `processar-agendamentos`, */10 min, jobid 2) — conferir duplicata: `select * from cron.job;`
- Testar fluxo de agendamentos end-to-end (criar agendamento com referência no passado e ver disparo — agora aparece como pendência da unidade na Operação)
- Testar "motivo de não execução" (checklist precisa ter motivos associados na criação via ChecklistMontador)
- ✅ Validado em produção (2026-06-14): geolocalização desktop, busca catálogo "ads", vídeo quadrado/retângulo

## Known Open Issues (atualizado 2026-06-06)

| # | Issue | Severidade |
|---|-------|-----------|
| 1 | ~~WhatsApp QR Code não funciona~~ ✅ RESOLVIDO 2026-06-11 — bug do Evolution 2.2.3 (loop infinito de reconexão, issue #2430); fix = upgrade da imagem para `evoapicloud/evolution-api:v2.3.7` no Railway. QR gera normalmente; instâncias órfãs (`CheckFlow`, `checkflows`) deletadas, restou só `checkflow` | ✅ |
| 3 | ~~`user` no SessionContext via `as any`~~ ✅ RESOLVIDO 2026-06-12 — removido o cast em operacao/layout.tsx | ✅ |
| 5 | ~~Redirect login ausente ao expirar sessão na Operação~~ ✅ RESOLVIDO 2026-06-12 — `onAuthStateChange` redireciona p/ /login em SIGNED_OUT na Operação (layout) e na Gestão/Sistema (Header) | ✅ |
| 6 | Permissões `ticket.ver`/`ticket.criar` existem no catálogo mas não são aplicadas (leitura/criação são por unidade) | 🟡 Médio |

~~#4 (checklist publicado editável)~~ corrigido em 2026-06-11: montador abre publicado em somente-leitura, "Liberar edição" com confirm + banner exigindo republicação.

## Migrations aplicadas em produção (Supabase)
- `20260606000005_security_hardening.sql` ✅ aplicada
- `20260606000006_workflows.sql` ✅ aplicada
- `20260606000014_fix_rls_catalogos.sql` ✅ aplicada
- `20260606000015_workflow_guards_e_agendamentos.sql` ✅ aplicada
- `20260606000016_motivo_nao_execucao_em_execucoes.sql` ✅ aplicada
- `20260607000001_permissao_agendamentos.sql` ✅ aplicada
- `20260607000002_turnos.sql` ✅ aplicada
- `20260610080000_parceiros.sql` ✅ aplicada (2026-06-11)
- `20260611134557_hardening_regras_negocio.sql` ✅ aplicada (2026-06-11)
- `20260611150000_parceiros_documento_unico.sql` ✅ aplicada (2026-06-11)
- `20260612235259_ia_provedores.sql` ✅ aplicada (2026-06-12) — provedores de IA gerenciados em `/sistema/integracoes-ia`
- `20260613002351_empresa_financeiro.sql` ✅ aplicada (2026-06-13) — colunas financeiras movidas p/ tabela admin-only (migration idempotente: insert guardado por information_schema)
- `20260613001046_ia_provedores_custom.sql` ✅ aplicada (2026-06-13) — provedores customizados OpenAI-compatible
- `20260613004044_checklist_permite_continuar.sql` ✅ aplicada (2026-06-13) — modo pausável vs execução única
- `20260614020000_limpeza_execucoes_expiradas.sql` ✅ aplicada (2026-06-14) — coluna `midia_removida_em` p/ cron de limpeza
- `20260614030000_fix_usuario_unidade_select_propria.sql` ✅ aplicada (2026-06-14) — policy select própria linha
- `20260614040000_fix_tickets_rls_admin_sistema.sql` ✅ aplicada (2026-06-14) — `or is_admin_sistema()` nas policies de tickets
- `20260614050000_fix_tickets_fk_usuarios.sql` ✅ aplicada (2026-06-14) — FK aberto_por_id/assignee_id → usuarios(id)
- `20260614060000_tickets_visibilidade_assignee.sql` ✅ aplicada (2026-06-15) — ticket some pra outros após assumido + policies grupos/subgrupos por unidade (transferência)
- `20260615120000_valida_ultimo_admin_empresa.sql` ✅ aplicada (2026-06-15) — trigger impede remover perfil "Admin da empresa" do último admin
- `20260615140000_billing_catalogo.sql` ⏳ aplicar (2026-06-15) — Billing Fase 1: tabelas `planos` e `pacotes_adicionais` (catálogo admin-only)

## Features entregues em 2026-06-07
- Fix build (parens nullish coalescing, cast PdfExecucao `as any`)
- Fix mensagens de erro de geolocalização (códigos PERMISSION_DENIED/POSITION_UNAVAILABLE/TIMEOUT + detecção HTTPS)
- Fix RLS catálogos com `unidade_id is null` (catálogo geral da empresa)
- Vídeo: gravação quadrada no desktop, adaptada à câmera no mobile
- Guard: bloqueia inativação de checklist em uso por workflow publicado
- Seletor Grupo+Subgrupo no picker de checklists do workflow
- Sistema completo de agendamentos recorrentes (schema + UI + pg_cron)
- Motivo de não execução por atividade obrigatória e por checklist inteiro

## Features entregues em 2026-06-10
- Onboarding contextual em todas as ~30 telas (`gestao/**` e `sistema/**`), atalho "?" reposicionado para canto inferior direito, oculto em mobile
- Painel admin `/sistema/onboarding`: liga/desliga onboarding por tela e edita conteúdo (JSON) via `onboarding_paginas`
- "Regra de evolução" documentada em `/uimap` e `/db`: toda tela nova ganha entrada no registry + onboarding + permissões automaticamente
- Exclusão definitiva de empresa **inativa** com cascata completa (RPC `excluir_empresa_cascata`, fix de 8 FKs sem `on delete cascade`), modal de confirmação não-trivial (digitar nome da empresa + checkbox de ciência) em `/sistema/empresas/[id]`
- Nova skill `/queries`: biblioteca de SQL de gestão organizada por tela/funcionalidade
- **Login somente por CPF** (`/login` sem opção de e-mail) + provisionamento exige `cpf`+`telefone` (Fase 1, migration 20260610050000, view `usuarios_sem_contato`)
- **Login por código (OTP)** completo (Fases 2-6): tabela `password_reset_tokens` (20260610060000), helpers em `apps/web/lib/passwordReset.ts`, rota `apps/api` `/whatsapp/enviar-codigo`, template `reset_senha` migrado para `{{codigo}}` (20260610070000)
  - `/recuperar-senha` e `/nova-senha` reescritos para fluxo CPF → código → nova senha (sem `resetPasswordForEmail`)
  - `/primeiro-acesso` (nova página): código de boas-vindas enviado automaticamente na criação/importação de usuário
  - Botão "Resetar senha" em `/gestao/acessos/usuarios` → `/api/usuarios/resetar-senha` (admin_sistema ou `usuario_tem_permissao('usuarios','editar')`)
- **Programa de Parceiros** (indicação): migration `20260610080000_parceiros.sql` — tabelas `parceiros`/`empresa_status_eventos`/`parceiro_emails_log` + colunas em `empresas` (`parceiro_id`, `parceiro_percentual`, `plano`, `valor_mensalidade`, `status_pagamento`, `pagamento_vencimento`). Aba "Parceiro" + aba "Pagamento" (agora wired) em `/sistema/empresas/[id]`, listagem `/sistema/parceiros`, `ParceiroModal`, rotas `apps/api/src/routes/parceiros.ts` (`/parceiros/boas-vindas`, `/cron/parceiros/resumo-mensal`), templates de e-mail em `email-templates.ts`

## Features entregues em 2026-06-11
- **Programa de Parceiros 100% operacional em produção**: 3 migrations aplicadas, Resend com domínio `checkflow.digital` verificado, boas-vindas validado de ponta a ponta, cron diário no cron-job.org (POST + `x-cron-secret` + `Content-Type: application/json` + body `{}`) — envio real todo último dia do mês 18h
- Busca de parceiro por **CPF** (não mais e-mail) — `documento` normalizado (só dígitos) e único (20260611150000)
- **Auditoria completa de regras de negócio** × código (~15 correções): guard de último dia no cron, boas-vindas só após salvar vínculo, anti-enumeração de CPF no solicitar-codigo (resposta genérica p/ sem-telefone e rate-limit), erros de update verificados (empresa/tickets), permissão `ticket.cancelar` aplicada, reabertura → `aberto` sem assignee, policy `tratar` com escopo de unidade, resultado nulo = reprovado no motor de workflow, execuções agendadas como pendência da unidade (`executado_por` null + `agendamento_id`), filtro `@checkflow.local` nas notificações, guard de edição reconhecido como já existente no montador (falso positivo da auditoria)
- **Fix crítico Node 20**: todo `createClient` do supabase-js na API precisa de `{ realtime: { transport: ws } }` — sem isso crash 500 (afetava parceiros, tickets, planos-acao, whatsapp)
- **pg_cron configurado** (job `processar-agendamentos`, */10min) — agendamentos recorrentes ativos
- **WhatsApp QR resolvido** (bug de 5 dias): upgrade Evolution `evoapicloud/evolution-api:v2.3.7`, conectado em produção; instâncias órfãs deletadas
- **Trocar número do WhatsApp**: botão "Trocar número / Desconectar" em `/sistema/whatsapp` + rota `POST /whatsapp/desconectar`
- Sidebar: só o item mais específico acende (fix destaque duplo Tickets/SLA); nav sistema cobre `/sistema/empresas/[id]`

## Features entregues em 2026-06-12/13
- **Failover multi-provedor de IA** na Consulta Inteligente (`/api/documentos/consultar`): Gemini → Claude → OpenAI → Groq + 2 customizados OpenAI-compatible (SiliconFlow/DashScope/OpenRouter via base_url). Gerenciado em `/sistema/integracoes-ia` (tabela `ia_provedores`, admin-only, chave mascarada). PDF só Gemini/Claude
- **Bug "Sessão inválida" na Consulta** resolvido: middleware redirecionava /api p/ login (sessão é localStorage) + env `NEXT_PUBLIC_SUPABASE_URL` no Railway apontava p/ a API Fastify → rota blindada (só aceita `*.supabase.co`, valida com secret key). ⚠️ env do Railway web foi corrigida
- **Fix crítico Node 20**: todo `createClient` supabase-js na API precisa de `{ realtime: { transport: ws } }` (sem isso 500)
- **empresa_financeiro**: colunas financeiras movidas de `empresas` (expostas a membros) p/ tabela admin-only
- **Avaliação de UX completa**: toast + ConfirmDialog (`components/ui/feedback.tsx`) substituindo 32 alert/confirm nativos; Gestão responsiva (sidebar vira drawer mobile); dashboard "em moderação" corrigido; "Manter conectado" morto removido; toasts de sucesso em CRUDs; hints de estado em tickets; status do PDF na conclusão; FAB ticket não sobrepõe onboarding
- **Auth**: redirect p/ login ao expirar sessão (onAuthStateChange na Operação + Header); removido `user as any`
- **Operação**: seção "Não finalizados" (em_andamento do operador) — Continuar (restaura respostas via ?exec=) ou "Não executar" com motivo obrigatório (ninguém descarta livre, nem admin); fix race condition no carregamento (espera unidadeAtiva)
- **Checklist**: modo `permite_continuar_depois` (pausável c/ "Continuar depois" salvando parcial vs execução de uma vez); criar pela área pré-marca grupo/subgrupo; tempo de guarda default 1 mês
- Migrations aplicadas: ia_provedores, ia_provedores_custom, empresa_financeiro, checklist_permite_continuar

## Features entregues em 2026-06-14
- **Tickets — jornada de resolução**: ao assumir, ticket some da lista dos demais (RLS); assignee pode transferir para outro grupo/setor da unidade (modal em `gestao/tickets/[id]`, evento `transferencia`, volta pra `aberto` sem assignee) — migration 20260614060000 ⏳ aplicar
- **Bug fix**: link "Ver execução completa" em `/gestao/planos-acao/[id]` apontava pra rota errada (`/operacao/{execucao_id}` = tela de executar checklist, não de visualizar) — agora abre o PDF da execução
- **Bug fix**: Operação → Histórico não listava plano de ação de execuções reprovadas — query selecionava coluna inexistente `plano_acao_movimentacoes.criado_em` (real: `created_at`), PostgREST retornava erro 42703 e `data: null`, UI mostrava "Nenhum plano de ação aberto" sem erro visível. Fix: alias `criado_em:created_at` em `operacao/page.tsx`
- **Tickets**: múltiplas evidências ao abrir chamado (adicionar/remover individualmente em `NovoTicketModal.tsx`)
- **Indicadores de uso** (`/sistema/empresas/[id]`): "Checklists executados" e "Consulta Inteligente" agora mostram histórico mensal (últimos 3 meses)
- **Limpeza automática de mídia por tempo de guarda**: `POST /cron/limpeza-execucoes` (cron-job.org, 1x/dia) remove fotos/vídeos/PDFs de execuções expiradas do bucket `execucoes` e dos planos de ação vinculados, preservando o registro — ver `/ops`
- **Bug crítico "Erro ao criar ticket" resolvido** (3 migrations, ver `/security` e `/db`):
  1. `usuario_unidade` sem policy de select própria — bloqueava `tickets_criar` e leitura de `checklists`/`catalogos`/etc para usuários normais
  2. `admin_sistema` sem linha em `usuario_unidade` — `or is_admin_sistema()` adicionado nas policies de tickets/eventos/evidências/categorias/SLA
  3. FK `tickets.aberto_por_id`/`assignee_id` apontava para `auth.users` em vez de `usuarios` — quebrava o embed do PostgREST e a listagem de tickets ficava vazia sem erro visível

## Features entregues nesta sessão
- Inativar/Duplicar checklist (com picker de destino)
- Gravar vídeo via getUserMedia (sem galeria)
- Toggle exibir/ocultar referência em atividades sim_nao e numero
- Suporte decimal + fix máscara `0` como wildcard
- QA/security audit: 7 issues corrigidos (IDOR, hardcoded keys, RLS, RPC buscar_email_por_cpf)
- **Workflow completo**: schema + motor Postgres (trigger+função) + UI editor + execuções
- Resultado de execução (aprovado/reprovado) gravado em `checklist_execucoes.resultado`
- Operação: seção "Workflows em andamento", link `?wf_item=`, banner de contexto
- Fix N+1 em operacao/page.tsx (contagem de atividades em batch)

**This skill is live.** When the user says "update skills with what we did today", update the Known Open Issues table and sections acima.
