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

## Pendências (atualizado 2026-06-11)
- ✅ `pg_cron` configurado em 2026-06-11 (job `processar-agendamentos`, */10 min, jobid 2) — conferir duplicata: `select * from cron.job;`
- Testar fluxo de agendamentos end-to-end (criar agendamento com referência no passado e ver disparo — agora aparece como pendência da unidade na Operação)
- Testar "motivo de não execução" (checklist precisa ter motivos associados na criação via ChecklistMontador)
- Validar em produção: geolocalização desktop, busca catálogo "ads", vídeo quadrado/retângulo

## Known Open Issues (atualizado 2026-06-06)

| # | Issue | Severidade |
|---|-------|-----------|
| 1 | ~~WhatsApp QR Code não funciona~~ ✅ RESOLVIDO 2026-06-11 — bug do Evolution 2.2.3 (loop infinito de reconexão, issue #2430); fix = upgrade da imagem para `evoapicloud/evolution-api:v2.3.7` no Railway. QR gera normalmente; instâncias órfãs (`CheckFlow`, `checkflows`) deletadas, restou só `checkflow` | ✅ |
| 3 | `user` no SessionContext acessado via `as any` → pode ser undefined | 🟠 Alto |
| 5 | Redirect para login ausente quando sessão expira na Operação | 🟡 Médio |
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
