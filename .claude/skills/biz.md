---
name: biz
description: Business rules and product logic for CheckFlow. Consult this skill before implementing any feature that touches plans, billing, access control, checklist flows, versioning, or user permissions. Also trigger when the user asks "how should this work?" or "what's the rule for X?" about product behavior.
---

# Business Rules

## ⏳ BACKLOG — Funcionalidades modulares por empresa (pendente) — 2026-06-18
O sistema é grande e pode confundir empresas pequenas. Ideia: cada empresa **habilita só as funcionalidades (telas) que usa**.
- **Na criação da empresa**, o admin escolhe quais funcionalidades/telas ficam liberadas (começa enxuto).
- Depois, pelo menu **Acessos**, o admin pode **habilitar/desabilitar** as demais funções a qualquer momento.
- **Integração com perfis**: só as funcionalidades habilitadas aparecem na **montagem dos perfis** (permissões). Se não está habilitada para a empresa, não aparece como opção no perfil (e fica oculta no menu).
- ⚠️ **Mapear dependências entre funcionalidades** para não gerar inconsistências (ex: Planos de Ação dependem de Checklists; Workflows dependem de Checklists; Tickets podem depender de Grupos; Tarefas dependem de Grupos/Subgrupos; SLA depende de Tickets). Habilitar/desabilitar deve respeitar o grafo de dependências (não deixar uma função ativa sem o pré-requisito).
- A definir: modelo de dados (flags por empresa, ex. `empresa_funcionalidades`), como o menu lateral e o construtor de perfis leem essas flags, e defaults por porte de empresa.

## Listas de Tarefas — IMPLEMENTADO 2026-06-18 (migration `20260618120000_tarefas.sql` ✅ aplicada)
Feature **separada do Checklist** (leve, pontual, broadcast). Tabelas: `tarefa_listas`, `tarefa_lista_grupos`, `tarefa_lista_subgrupos`, `tarefa_itens`, `tarefa_execucoes`, `tarefa_respostas`. Permissão `tarefas` (ver/criar/editar/deletar). UI: Gestão `/gestao/tarefas` (listagem + indicadores) e `/gestao/tarefas/[id]` (montador); Operação 4ª aba "Tarefas" (`operacao/AbaTarefas.tsx`).
**Decisões fechadas na implementação**: janela de edição = `edicao_janela_horas` a partir da abertura da instância (null = até encerrar), com countdown na execução; 1 instância por pessoa por lista (`unique(lista_id,usuario_id)`); flags **por tarefa** (observação/evidência/checkin); mídia no bucket `execucoes` sob `tarefas/{execId}/` (conta na cota: `registrarUsoArmazenamento(..., 'tarefa', ...)` + bloqueio por `billing_armazenamento_disponivel` antes do upload — migration `20260618160000`); **check-in tolerante** (se GPS indisponível/negado, conclui mesmo assim como "sem localização", lat/lng null); notificar WhatsApp = flag `notificar_whatsapp` (toggle, default off) — **wired 2026-06-18**: ao publicar com a flag, o web chama `POST /tarefas/notificar` (apps/api, `routes/tarefas.ts`) que envia WhatsApp aos membros dos subgrupos atribuídos (ou dos grupos, se não houver subgrupo), respeitando o turno (`usuario_esta_no_turno`). Fire-and-forget, não bloqueia a publicação.
**Agendamento + status + duplicar (2026-07-08)** — migration `20260708140000_tarefa_liberacao.sql`:
- **Data de liberação** (`tarefa_listas.liberacao_em`): quando a lista publicada passa a **aparecer na Operação**. **Campo obrigatório no montador, pré-preenchido com a data/hora atual** (libera ao publicar); no futuro → lista fica **agendada** e é **ocultada do operador** até a data (barreira `liberada()` em `lib/tarefas.ts`, antes da janela de abertura). Nunca gravado null (fallback = agora).
- **Status derivado** (`statusTarefa()` em `lib/tarefas.ts`) para a listagem da gestão: `rascunho` · `agendada` (liberação no futuro) · `em_execucao` (liberada + janela de abertura aberta) · `finalizada` → **exibido como "Concluída"** (encerrada manual OU janela de abertura fechada por data limite/nº respostas). Filtro por chips (Todas/Rascunho/Agendada/Em execução/Concluída) + badge usam esse status derivado.
- **Operação (aba Tarefas)** — 2 seções: **Liberadas** (disponíveis; mostram "Prazo: …" quando há data limite) e **Concluídas** = execuções do operador **encerradas** OU com **prazo de edição expirado** (finalizadas sem concluir). Cada card de Concluídas tem **cor por completude**: 🟢 verde (tudo respondido) · 🟡 amarelo (parcial) · 🔴 vermelho (nada) — expirada-sem-concluir aparece com "Finalizada (prazo encerrado)" + a cor. **Sem status novo no banco** — tudo derivado de `status`+`editavel_ate`+respostas.
- **Duplicar** (menu ⋮ na listagem): cria cópia como **rascunho** ("… (cópia)") com toda a config (liberação, janela, notificar) + itens + atribuições grupos/subgrupos. Excluir também foi para o ⋮.
- **Tooltip ⓘ** no "Nº máximo de respostas": explica que o limite é o **total somando todos os operadores** (cada pessoa responde 1×), e ao atingir fecha para novas aberturas.

**Concluir + listagem de concluídas (2026-07-08)**: a execução da lista ganhou um botão **"Concluir tarefas"** (verde, fim da lista) que marca `tarefa_execucoes.status = 'encerrada'`. **Continua editável enquanto a janela de edição não expira** — reabrir uma concluída mostra "Salvar alterações" + aviso; só registra o término, não trava. Some quando o prazo de edição já encerrou. A aba Tarefas passou a ter **duas seções**: **A fazer** (listas disponíveis, já excluindo as encerradas do usuário) e **Concluídas** (as `encerrada` do usuário, com data, ordenadas da mais recente; vêm via join, então aparecem mesmo se a janela de abertura já fechou). `status` (`em_andamento`/`encerrada`) já existia no schema — sem migration.

Espec original abaixo (mantida como referência):
- **Conceito**: existe um **modelo de lista** (título + N tarefas/itens "to-do") distribuído a **1+ grupos e 1+ subgrupos**. Enquanto o modelo está liberado, **vários usuários executam** — **cada um gera sua própria instância** de resposta.
- **DUAS janelas de tempo distintas** (parte da configuração da lista):
  1. **Janela de abertura de novas instâncias**: até quando se pode **abrir** uma nova execução da lista — encerra por **data limite** OU **nº de respostas** (o que vier primeiro). Enquanto aberta, o usuário pode iniciar uma nova instância.
  2. **Janela de edição da instância**: depois de aberta, por quanto tempo ele pode **continuar respondendo/editando** (marcar/desmarcar tarefa, adicionar/editar observação, adicionar/editar evidências). Pode ser "ao longo do dia" ou o período definido. Na execução, **mostrar o tempo restante até o bloqueio da edição** daquela instância.
- **Montagem** (quem tem perfil que permite criar): título + tarefas; flags **por tarefa** — cada tarefa define se aceita **observação**, **evidência** (foto/vídeo) e se **exige checkin** (localização).
- **Execução** (Operação): aparece numa **nova aba "Tarefas"** (4ª aba, junto de Checklists/Histórico/Documentos), para quem está nos subgrupos atribuídos. Para cada tarefa: marca se realizou + (se a tarefa permitir) texto/evidência + (se exigir) checkin.
- **Menu/permissão**: pelo menu o usuário executa as listas dos seus grupos/subgrupos; com permissão (perfil), também **cria modelos** de lista.
- **Acompanhamento (Gestão) — Indicadores (2026-07-17, `2d7d354`)**: botão 📊 na listagem abre **página dedicada** `/gestao/tarefas/[id]/indicadores` (substituiu o modal simples). 3 abas: **Resumo** (KPIs respostas/conclusão média/nº tarefas + gráfico **feito × não-feito por tarefa** em barras + **por pessoa** expansível com o que cada um respondeu/obs/evidência/local), **Evidências** (grid de todas as fotos+vídeos → lightbox + quem resolveu/item), **Mapa** (pontos com check-in via **Leaflet CDN/OSM**, fallback lista Google Maps). Dados: `tarefa_execucoes` + `tarefa_respostas`. Sem migration.
- **Evidência de tarefa — storage (2026-07-16, `10aa8bd`)**: sobe em `execucoes/tarefas/<tarefa_execucao_id>/...`. As policies `execucoes_upload`/`execucoes_delete` foram ampliadas (migration `20260716150000`) para aceitar o 1º segmento `tarefas` (escopado a `tarefa_execucoes.unidade_id`), além de `tickets` e id de `checklist_execucoes`. Antes dava "new row violates row-level security policy". Leitura é via `getPublicUrl` (bucket público).
- **Notificação ao publicar (RECOMENDAÇÃO a confirmar)**: canal garantido = aba Tarefas na Operação. WhatsApp **individual por pessoa** do subgrupo deve ser **opcional por lista** (toggle "avisar por WhatsApp"), **respeitando o turno** de cada um; default **desligado** (evita custo/spam de disparo automático p/ subgrupo inteiro).
- ~~Pontos a confirmar~~ — **respondidos na implementação** (ver "Decisões fechadas" acima): mídias **contam** na cota (origem `tarefa`, com bloqueio antes do upload) e o limite é de **1 instância por pessoa por lista** (`unique(lista_id,usuario_id)`).

## Relatórios por IA (Feature 2 de IA) — IMPLEMENTADO e VALIDADO 2026-07-14
IA gera o relatório das **execuções de um checklist nas últimas X horas** (1–24h). Menu em **Configurações → Relatórios**; geração na **Home**.
- **Modelo** (`relatorio_modelos`) = template reutilizável: escolhe checklist (com filtro grupo→subgrupo) + período (1–24h) + **prompt pré-preenchido** com as seções/atividades do checklist (o gestor não procura os campos; edita à vontade).
- **Geração** = executar o modelo. **Assíncrona**: cria `relatorios_gerados` (`status='gerando'`), a rota gera em background e o front faz **polling** até `pronto`/`erro`. Compila as execuções da janela em markdown → IA (failover de provedores) → texto.
- **Entitlement = característica `ia`** ("Serviços de IA", mesma de Consulta Inteligente + IA-foto). Sem IA no plano: menu some, tela bloqueia, rota 402. NÃO é módulo → gate na UI + na rota (tokens), não em `empresa_libera_recurso`.
- **Permissões de perfil (4, independentes)**: `criar`/`editar`/`excluir` (CRUD do modelo, enforçado por RLS) e `executar` (gerar; a rota checa; o grupo na Home só aparece com ela). Botões da tela CRUD escondem por permissão.
- **Não é operação**: fica só na Gestão (menu + Home), nunca na Operação. Consulta/geração é de líder/gestor.
- **Somente-leitura pós-trial**: criar modelo e gerar **bloqueiam** (`empresa_pode_criar`); consultar os já gerados continua.
- **Gate de tipos de atividade por serviço do plano (2026-07-18)**: um tipo ligado a serviço **gateado** some do montador (`AtividadeModal`) quando o plano não inclui o serviço — mesma régua opt-in do menu (null = sem restrição). Lógica em `lib/tiposAtividade.ts` (`TIPOS_ATIVIDADE` com `recurso`/`flag` + `tiposAtividadeDisponiveis`, reusa `planoLiberaRecurso`/`planoLiberaFlag`). Na **edição**, o tipo atual é mantido mesmo se gateado (não trava atividade já criada). Aplicado hoje ao **`catalogo`** (recurso `catalogos`); **`padrao`** deixado pronto (comentado) p/ quando voltar ao montador. Escopo: só o **montador** (esconder p/ adicionar) — execução de atividades já criadas NÃO é bloqueada.

## Sessão multi-empresa — perguntar empresa a cada login (2026-07-14)
Usuário com **mais de uma empresa**: o sistema **pergunta qual empresa a cada login** (antes restaurava a última automaticamente e não havia como trocar → ficava preso). A persistência da sessão vale **a partir da unidade**, não da empresa.
- Logout **zera `sessao_usuario.ultima_empresa_id`** (mantém a última unidade) → próximo login cai no `EscolherEmpresaModal`. Reload dentro da sessão mantém.
- Botão **"Trocar empresa"** no menu do usuário (Gestão e Operação) quando há +1 empresa — reabre o seletor via `SessionContext.trocarEmpresa()`.
- Empresa única = inalterado (auto-seleciona). Ver `/uimap` (SessionContext/Header).

## Avisos de fim de trial — IMPLEMENTADO 2026-07-15
Antes de a empresa cair em **somente-leitura** (pós-trial; ver `billing-ciclo-bloqueio`), o sistema avisa com antecedência:
- **Cron diário** `/cron/billing/avisos-trial` (x-cron-secret): para trials a **0–5 dias** do fim, avisa os **admins da empresa** (perfil `…002`) por **WhatsApp + e-mail** com link `/gestao/plano`. Idempotente: heads-up a ≤5 dias e urgente a ≤1 dia, 1× cada (`empresa_assinaturas.aviso_trial_5d_em/1d_em`). Mensagens hardcoded (aviso de plataforma, não editável em Notificações). **Precisa ser agendado no cron-job.org** — ver `/ops`.
- **Banner na Home** (`AvisoTrial`): aparece só nos **últimos 5 dias**, mostra os dias restantes + CTA "Ver planos". Qualquer membro vê os dias (RPC `empresa_dias_trial`); o CTA leva a `/gestao/plano` (contratação é do admin).
- Não respeita turno (é aviso administrativo, não operacional).

## Alertas de limite de uso ao admin — Fase 1 IMPLEMENTADO 2026-07-19
Alertas de **gestão** ao admin da empresa (perfil `…002`), WhatsApp + e-mail, **sempre ligados** (mensagem de plataforma, sem toggle) — reusam o molde do cron de trial.
- **Cron diário** `/cron/billing/avisos-uso` (x-cron-secret): para cada empresa, mede os **3 recursos com limite** (execuções/mês, tokens de IA/mês, armazenamento) e avisa em **80%** (heads-up) e **100%** (atingido). `%` = `usado / (limite + extra_de_pacote)`; `limite null` = ilimitado (não alerta).
- **Idempotência por período de cobrança** (tabela `empresa_avisos_uso`, chave `empresa+recurso+faixa+periodo_ref=periodo_inicio`): cada aviso sai **1× por recurso × faixa × período**; reseta na virada (execuções/tokens zeram; armazenamento só re-alerta no período novo se seguir acima). Quem pula direto para 100% recebe só o de 100%.
- **Conteúdo por recurso**: execuções/tokens resetam no período → CTA "comprar pacote / subir de plano"; armazenamento é permanente → CTA "liberar espaço (tempo de guarda) ou ampliar". Todos linkam `/gestao/plano`.
- **Fase 2 (cobrança/pagamento via webhook Asaas)** e **Fase 3 (pré-cadastros pendentes)** planejadas, não implementadas. ⚠️ Precisa **agendar o cron no cron-job.org** (ver `/ops`). Lógica pura + testes em `apps/api/src/lib/avisosUso.ts`.

## Atualização automática de listagens (polling) — 2026-07-15
**Todas** as listagens da Gestão se atualizam sozinhas via **polling** (`lib/usePolling.ts`, 45s), não Supabase Realtime — incluindo o **painel de Indicadores** e a lista de **modelos de Relatórios** (adicionados 2026-07-18; ficaram de fora só: forms/detalhe, operação, sistema/empresas, workflows-off, ajuda, catch-all). **Por quê**: Supabase é plano **free** — Realtime cobra em conexões simultâneas + reavaliação de RLS **por cliente/por mudança** (Postgres Changes) + cota de mensagens; polling é **previsível e barato** e a gente controla o custo. **Regras** (baratas): pausa em aba oculta + refetch ao voltar; intervalo 45s; só na tela ativa; escopo = listagens (não forms/detalhe). Fora do polling: **operação** (é offline-first, polling quebraria/geraria erro sem sinal) e **sistema** (admin único, baixa mudança). Realtime só valeria com poucas escritas + necessidade de instantâneo — não é o perfil operacional multi-tenant.

## Férias do usuário — não notifica (2026-07-15)
O gestor informa um **período de férias** (início/fim, opcional) na gestão de usuários (`UsuarioModal`, em Acessos → Usuários e no "Gerenciar usuários" dos Grupos). Durante o período, o usuário **não recebe NENHUMA notificação, por NENHUM canal** (WhatsApp, e-mail e push), em **todos os eventos** (tickets aberto/movimentado, planos, tarefas). Set-and-forget: acabou o período, volta a notificar sozinho. Validação: informar ambas as datas ou nenhuma; fim ≥ início. Ver `/db`.
- **Férias × Turno (regra distinta por canal, corrigido 2026-07-18)**: **Férias** suprime TUDO (WA+e-mail+push, todos os eventos) — função SQL isolada `usuario_esta_de_ferias` (migration `20260718150000`), cada rota de notificação faz early-return. **Turno** (modo notificação, fora do horário) suprime só **WA/push** (e-mail passa), via `usuario_recebe_notificacao`. Antes da correção o e-mail e o `ticket_movimentado` **escapavam** durante as férias.

## Alertas de gestão ao admin — Fases 2 e 3 IMPLEMENTADO 2026-07-19
Continuação dos alertas de gestão ao admin da empresa (perfil `…002`), WhatsApp + e-mail, sempre ligados. (A Fase 1 = limites 80%/100% está na feature de `avisos-uso`.)
- **Fase 2 — Cobrança/pagamento (event-driven, SEM cron)**: no **webhook Asaas** (`routes/billing.ts`), ao receber **`PAYMENT_OVERDUE`** (fatura em atraso), além de marcar a assinatura `inadimplente`, avisa o admin (WA+e-mail) com **link da fatura** (`invoiceUrl`) + valor/vencimento **e a data-limite do corte**. Idempotente pelo **dedup de `event_id`** que o webhook já faz (cada evento processa 1×). Best-effort: falha de canal não muda o 200 ao Asaas. Template `emailFaturaVencida`.

## Inadimplência corta acesso (2026-07-22, migration `20260722120000`)
- **Regra**: plano **pago** cuja fatura recorrente vence e não é paga → webhook `PAYMENT_OVERDUE` marca `status='inadimplente'` **e grava `empresa_assinaturas.vencido_em`** (menor vencimento em aberto — âncora). Passados **7 dias** de `vencido_em` sem pagar, `empresa_fase_assinatura` retorna **`carencia`** (somente-leitura: bloqueia criação, o que existe segue acessível), **reusando o mecanismo do pós-trial**.
- **Date-driven, SEM cron**: o corte acontece sozinho ao passar `vencido_em + 7` (a fase é reavaliada a cada checagem de RLS). Ordem na fase: `cancelado` → **inadimplente>7d** → pago/cortesia→ativa → trial. Cortesia não sofre (sem cobrança).
- **Volta a ativa** assim que o pagamento confirma: o webhook zera `status='ativo'` + `vencido_em=null` (tanto no ramo recorrente quanto na ativação de plano pendente).
- **UI** (`/gestao/plano`): banner vermelho de "fatura vencida" com a data-limite do corte (ou "sistema em somente-leitura" se já cortou) + botão "Pagar fatura" (usa a cobrança `OVERDUE`). `billing_status` agora devolve `vencido_em`.

## Split de parceiro — repasse automático (2026-07-22, migrations `20260722130000`)
- **Fase 4 do billing**: sai a comissão manual/estimada, entra o **split real do Asaas**. Cada parceiro tem uma **subconta** (`parceiros.asaas_wallet_id`). Ao **assinar** ou **reativar** um plano pago (`routes/billing.ts`), se a empresa tem parceiro **ativo COM wallet** e **`empresa_financeiro.parceiro_percentual > 0`**, a assinatura é criada com `split: [{ walletId, percentualValue }]` → o Asaas repassa a `%` da mensalidade a cada cobrança recorrente.
- **Onde ficam os campos**: `parceiro_id` e `parceiro_percentual` vivem em **`empresa_financeiro`** (não em `empresas` — movidos na migration `20260613002351`). `montarSplitParceiro(supabase, empresaId)` lê de lá (service role ignora RLS).
- **Escopo**: só a **mensalidade** (assinatura). Pacotes avulsos **não** têm split.
- **Fallback seguro**: sem wallet / parceiro inativo / percentual 0 → sem split (cobra 100% CheckFlow, como antes).
- **4 vias aplicam o split** (todas via `montarSplitParceiro`): (1) 1ª contratação (`/assinar`), (2) **troca entre pagos** (`asaasAtualizarAssinatura`, split **autoritativo** — `[]` limpa split velho), (3) `/reativar`, (4) **`POST /billing/sincronizar-split`** — empurra o split para a assinatura **já existente** sem trocar de plano. A (4) é chamada automaticamente ao salvar o vínculo na **aba Parceiro** de `/sistema/empresas/[id]`, então **associar/trocar/remover parceiro DEPOIS da contratação** passa a valer nas próximas cobranças (best-effort: falha não bloqueia o salvamento do vínculo).
- **Criar a subconta pelo próprio CheckFlow (self-service)**: em `/sistema/parceiros`, botão **"Criar conta Asaas"** → `POST /parceiros/:id/conta-asaas` (**admin_sistema**) cria a subconta white-label (`asaasCriarSubconta` → `POST /accounts`) reusando nome/e-mail/documento/telefone do cadastro e grava o `walletId` sozinho. Idempotente (não recria se já há wallet). Com wallet, a UI mostra "Conta Asaas ativa (split ligado)".
  - **Dados de KYC no cadastro (migration `20260723120000`)**: `parceiros` guarda `data_nascimento` (PF), `tipo_empresa` (PJ: MEI/LIMITED/INDIVIDUAL/ASSOCIATION), `renda_mensal` (incomeValue), `cep`, `endereco`, `endereco_numero`, `complemento`, `bairro`. A rota `conta-asaas` monta o `POST /accounts` com tudo isso (PF→`birthDate`; PJ→`companyType`, default LIMITED). Editáveis no cadastro de parceiro novo (`ParceiroModal`, bloco colapsável "Dados para conta Asaas") e na **edição** (`ParceiroEditarModal`, botão "Editar" em `/sistema/parceiros`).
  - **O que dá para editar de um parceiro** (`ParceiroEditarModal`, admin_sistema): **nome, e-mail, telefone, CPF/CNPJ** + todo o KYC. ⚠️ **O documento trava depois que a subconta Asaas existe** (`asaas_wallet_id` preenchido) — o cadastro local não pode divergir da conta financeira real; o campo fica desabilitado com aviso. **Não** são editáveis pela tela: `status` (ativo/inativo) e `asaas_wallet_id` (só o botão grava). Não há exclusão de parceiro. Campos compartilhados em `ParceiroKycFields.tsx`, que também **completa Endereço e Bairro pelo CEP** (ViaCEP, ao digitar os 8 dígitos ou no blur; `logradouro`→endereco, `bairro`→bairro; CEP inexistente/API fora só avisa e deixa preencher à mão).
  - ⚠️ **Verificação Asaas**: mesmo com os dados preenchidos, a subconta pode precisar concluir **verificação/KYC no Asaas** antes de **receber** de fato. Se ainda faltar algo, o `POST /accounts` retorna erro descritivo, repassado ao admin na tela.
  - **`renda_mensal` (incomeValue) é opcional/mockado**: se o parceiro não preencher, a rota manda um padrão (`RENDA_MENSAL_MOCK = 5000`) — evita fricção. Editável na subconta.

## Captação de parceiros — pré-cadastro público (2026-07-23, migration `20260723140000`)
- **Fluxo**: interessado acessa o **formulário público `/seja-parceiro`** (link/QR gerado no botão "Formulário de captação" em `/sistema/parceiros`), preenche nome/CPF-ou-CNPJ/e-mail/telefone/mensagem → cria registro **PENDENTE** em `parceiro_pre_cadastros`. O admin de sistema **valida** na própria tela de Parceiros (seção "Interessados aguardando validação"): **Aprovar** cria um `parceiros` (status ativo) e marca o pré-cadastro `aprovado` (com `parceiro_id`); **Rejeitar** marca `rejeitado`. Depois é só **associar o parceiro à empresa** (aba Parceiro de `/sistema/empresas/[id]`).
- **Objetivo de billing**: como toda empresa entra em **trial**, associar o parceiro **durante o trial** garante que o **1º pagamento já saia com o split correto** (a assinatura é criada na contratação do plano pago).
- **Espelha o pré-cadastro de usuários** (`20260627000000`): RLS = INSERT anônimo só `status='pendente'` (anti-spam via validação); SELECT/UPDATE só `is_admin_sistema()`. Componentes: `app/(auth)/seja-parceiro/page.tsx` (público), `FormularioParceiroModal` (link+QR), validação inline na página de parceiros.
- **Fase 3 — Pré-cadastros pendentes (cron diário)**: `/cron/gestao/lembretes` (x-cron-secret) avisa o admin quando há `pre_cadastros` `status='pendente'` há **≥1 dia**. **Throttle de 3 dias por empresa** (tabela `empresa_gestao_lembretes`, chave `empresa+tipo`) para não spammar diariamente. Link para Acessos → Usuários. Template `emailPreCadastrosPendentes`.
- Lógica pura + testes: `apps/api/src/lib/avisosGestao.ts`; helper de notificação reusável `apps/api/src/lib/adminEmpresa.ts` (`buscarAdminsEmpresa`/`notificarAdmins`). ⚠️ A Fase 3 precisa **agendar o cron no cron-job.org** (ver `/ops`). A Fase 2 não precisa de agendamento (dispara no webhook, que já está configurado).

## Core Product
CheckFlow is a checklist management SaaS with two distinct areas:
- **Gestão** (`/gestao`) — admin backoffice: create checklists, configure activities, manage users/units
- **Operação** (`/operacao`) — mobile-first execution interface: operators fill checklists on device

## Execução offline (PWA) — 2026-06-26
O app é um **PWA instalável** e **offline vale SÓ para a operação** (gestão/sistema sempre online). Detalhes técnicos em `/arch`.
- **Login é online-única**: não existe login offline (senha exige servidor). O operador loga uma vez **com internet** (depósito/escritório) e a sessão fica no aparelho; em campo o app o reconhece sem rede. A sessão dura (Supabase time-box/inactivity = never).
- **Flag por checklist** (`permite_offline`, opt-in, toggle no montador): só os marcados aparecem na lista offline e têm a definição pré-baixada. Decisão: opt-in conservador — o gestor escolhe quais checklists são seguros p/ campo sem sinal.
- **O que funciona offline**: abrir a lista (só os offline), abrir o checklist a frio, preencher (incl. **foto**, **catálogo** — valores cacheados, sem imagem), reprovar + abrir **plano de ação**, **finalizar** → fila local → sincroniza sozinho ao reconectar (plano replayado junto).
- ⚠️ **NÃO há rascunho local de respostas em andamento** (decisão 2026-06-30, commit `e016ebb`): o autosave/restauração local foi **removido**. Sair/recarregar **sem finalizar** (offline) ou **sem "Continuar depois"** (online) **perde** o progresso. Ver "Modo de execução do Checklist".
- **O que EXIGE conexão**: **workflow** e **execução agendada** (`?exec=`) não finalizam offline (bloqueiam, mensagem orienta a finalizar online). Billing não é checado offline. **"Continuar depois" também exige internet** (cria `em_andamento` no servidor) — offline o botão fica **desabilitado** com a dica "finalize para salvar no aparelho" (2026-06-30, commit `c4857b1`; antes falhava em silêncio). Offline, o único jeito de salvar é **Finalizar** → fila local.
- **Aviso de sem conexão**: a lista da Operação mostra um banner "Sem conexão — exibindo só os checklists disponíveis offline" quando `!navigator.onLine` (`useOnlineStatus`, 2026-06-30).
- **Fila de sync presa ao aparelho**: as execuções finalizadas offline ficam em **IndexedDB do device** (`lib/syncQueue.ts`, store `pending_submissions`). **Sobrevive ao logout** (signOut não limpa IndexedDB); sincroniza quando um operador abre a **Operação nesse mesmo device** com internet (`PendingSync` no layout: ao carregar, no evento `online`, e a cada 30s). Idempotente (upsert por id do cliente; respostas/planos "criar só se não existem") — reenvio não duplica. Atribui ao operador original (`userId` guardado na fila). Risco: device nunca mais usado online → pendentes ficam parados ali (não some, mas não sobe sozinho noutro lugar).
- **Instalação**: botão "Instalar" na operação e na gestão (só aparece no navegador; some no app instalado). Removida a opção "compartilhar app".

## Pré-cadastro de usuários por QR (2026-06-27)
Onboarding self-service com moderação. Detalhes técnicos em `/db` (RLS) e `/uimap`.
- Página pública (`/pre-cadastro/[empresaId]`, acessada por **QR** gerado na tela de Usuários) → a pessoa preenche nome/CPF/telefone (e-mail/setor opcionais) → vira **pendente**.
- O **admin da empresa** modera na tela de Usuários (aba "Pré-cadastros" com contador): **Aprovar** (escolhe perfil + unidades) → reusa `/api/usuarios/criar` (cria o usuário **e dispara o código de 1º acesso** WhatsApp/e-mail); **Rejeitar** marca rejeitado.
- E-mail é **recomendado** no form (canal de backup do código). CPF já existente → **vincula** à empresa (e reenvia o código se a pessoa nunca concluiu o 1º acesso). Spam é contido pela moderação (anônimo só cria pendente).

## Setup automático de nova empresa — 2026-06-28
Ao criar uma empresa (`NovaEmpresaModal`), o sistema executa automaticamente:
1. **Unidade padrão** (já existia antes)
2. **Grupo padrão + Subgrupo padrão** — estrutura mínima para receber checklists e usuários (commits `3be77bb`/`359f464`)
3. **2 turnos padrão** — "Administrativo" (seg-sex 08-17h) + "12x36" com 4 períodos (trigger `trg_empresa_turnos_seed`)
4. **Perfil "Gestão do Grupo"** — perfil per-empresa editável, 28 permissões de gestão de área (trigger `trg_empresa_gestao_grupo_seed`)
5. **10 templates de notificação** — WhatsApp + e-mail para cada tipo de evento (trigger `trg_empresa_notif_seed`)
6. **Checklist MODELO fixo (SEMPRE, 2026-07-09)**: toda empresa nova recebe um checklist determinístico **"Checagem de início de trabalho"** já publicado no subgrupo padrão — **2 seções × 4 atividades** cobrindo os 6 tipos sem cadastro prévio (sim_nao/multipla_escolha/numero/texto/foto/data_hora). Rota `/api/empresas/checklist-modelo` (admin_sistema, service role, estrutura hardcoded). Best-effort: falha não bloqueia a criação. Independe do checklist por IA — os dois coexistem.
7. **Checklist inicial por IA** (opcional, campo no modal): se o admin informar uma descrição, gera via IA um checklist **já publicado** (2 seções, tipos sem cadastro prévio — sim_nao/numero/texto/foto/data_hora/multipla_escolha), escopado à unidade/subgrupo padrão. Geração best-effort: falha da IA não impede criar a empresa. Motor: `lib/ia/checklistIA.ts` (reusa o failover de `ia_provedores`; **NÃO debita tokens do cliente**).
8. **"Salvar administrador"**: no fluxo de criação, o 1º admin é vinculado à empresa (`usuario_empresa`, perfil Admin da empresa) **e registrado como N1 no subgrupo padrão** (`usuario_subgrupo`, funcao=`nivel_1`) — pronto para receber e moderar planos de ação (commit `238d158`).

Toda a estrutura nasce consistente: a empresa pode receber execuções imediatamente após a criação.

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

## Modelos (Templates) de Checklist
- Checklist com `is_template=true` + `template_segmentos[]`, sem `unidade_id`, curado por admin em `/sistema/templates` (reusa o ChecklistMontador em `modoTemplate`). Leitura pública (galeria); só modelos `publicado` aparecem na galeria.
- Empresa clona em `/gestao/checklists/modelos` (galeria por segmento, preview) → RPC `clonar_template(template_id, unidade_id, nome)` cria checklist rascunho na unidade (cópia profunda seções/atividades/opções + dependências).
- **Gerar com IA** (admin, `/sistema/templates` → "Gerar com IA"): `POST /api/templates/gerar` usa o failover de IA (ia_provedores) para produzir um JSON estruturado e cria o template como **rascunho** para revisão no montador (nunca publica direto). Tipos restritos a sim_nao/numero/texto/foto/data_hora/multipla_escolha; falhas em `ia_falhas` (contexto 'template').

## Activity Types & Validation Rules
| Tipo | Validação automática |
|------|---------------------|
| `sim_nao` | Conforme/Não conforme vs `config.esperado` |
| `numero` | Conforme se `min ≤ valor ≤ max` (config.min / config.max) |
| `multipla_escolha` | Não conforme se qualquer seleção tem `e_valido = false` |
| `catalogo` | Sem validação — apenas seleção de item de `catalogo_valores` |
| `texto` | Sem validação — máscara (9=digit, A=upper, *=any), opcional QR scan. **Sem máscara = textarea que cresce** com o conteúdo (execução). Opcional: **preencher por foto (IA)** |
| `foto` | Sem validação — captura obrigatória se `obrigatoria = true` |
| `video` | Sem validação — alerta se arquivo da galeria tem >1h (lastModified) |
| `localizacao` | Sem validação — GPS only (Nominatim reverse geocoding), sem input manual |
| `assinatura` | Sem validação — reservado para app móvel nativo |
| `data_hora` | Sem validação — datetime-local input |

## Modo de execução do Checklist (continuar depois)
- `checklists.permite_continuar_depois` (boolean, default true), definido no montador (config), seção "Modo de execução"
- **true (pausável)**: na execução aparece "Continuar depois" — salva o progresso parcial (respostas + upload de fotos/vídeos já feitos) numa execução `em_andamento` e volta. Ao reabrir (via `?exec=`), as respostas são **restauradas** (fotos/vídeos voltam como `{url}`, a UI faz preview). Botão Voltar disponível
- **false (de uma vez)**: sem botão Voltar nem "Continuar depois" — o operador conclui em uma sessão
- Execuções iniciadas e não finalizadas (em_andamento, do próprio operador, não-workflow) aparecem na seção vermelha "Não finalizados" no topo da aba Checklists da Operação, com "Continuar" (retoma via `?exec=`). **Não há descarte livre — nem para admin**: a única forma de abandonar é "Não executar" → escolher um motivo (`nao_execucao_motivos` tipo checklist vinculado ao checklist) → respostas são descartadas e a execução salva como `nao_executado` com `motivo_nao_execucao_id`/`_obs`. Se o checklist não tem motivos cadastrados, só resta finalizar
- ⚠️ **Abrir um checklist é SEMPRE execução nova e limpa** (decisão 2026-06-30, commit `e016ebb`): não existe rascunho local; **nada é restaurado** ao reabrir do zero. A única restauração é a **retomada explícita** via "Continuar" do "Não finalizados" (server `?exec=`, respostas vêm do banco). Quem responde e sai **sem** "Continuar depois"/Finalizar **perde** o progresso — intencional (evita dados de uma execução abandonada reaparecerem na próxima, num checklist recorrente). O plano de ação só vira registro no **finalizar** (com a execução) — nunca um plano órfão.

## Home / Visão Geral (`/gestao`) — revisado 2026-06-20
- **A Home é, por enquanto, dashboard de CHECKLIST** — só reflete informações de checklist. Dashboard da **unidade ativa** (escopado por `unidadeAtiva.id`; antes agregava todas as unidades).
- **Guia de implantação ("Primeiros passos")** (`components/onboarding/PrimeirosPassos.tsx`, revisado 2026-06-30): card no topo da Home **só para o admin da empresa** (gate `ehAdminDaEmpresa`) — guia de setup na ordem certa antes de operar: **estrutura (grupos/subgrupos) → equipe + funções (Operação/N1/N2) → criar checklist (modelo/zero/IA) → executar na Operação**. Conclusão detectada do banco (grupos/usuarios/checklists/execucoes), barra de progresso, "dispensar" por empresa (localStorage), some quando 100%. Nota dos **opcionais** (perfis, turnos, catálogos, documentos). Operador/gestor de área não veem.
- **Funil de Execuções** (período 1h/6h/12h/24h/15d/30d): tudo em **EXECUÇÕES concluídas** → Executados / Aprovados / **Corrigidos** / **Não corrigidos** / **Em moderação**. **Mudança 2026-07-08**: o tile único "Reprovados" foi **dividido em Corrigidos e Não corrigidos** — cada reprovada é classificada pelo desfecho do tratamento via `resumoPlanos` (todos os planos `corrigido` → Corrigidos; algum `nao_corrigido` → Não corrigidos; ainda em N1/N2 → conta só em "Em moderação"). Abaixo, **indicador de moderação por nível** (contagem de PLANOS): Aguardando N1 (em_moderacao_n1 + reaberto) / Aguardando N2 (em_moderacao_n2). **Últimas Execuções** (filtros Todos/Reprovados/Com PA, link PDF/planos) + Primeiros Passos.
- **Bloco "Planos com SLA crítico" REMOVIDO da Home (2026-06-20)** — Home é só checklist; SLA segue arquivado na UI. O campo `plano_acao_sla_horas` (SLA por atividade no montador) permanece no banco; `sla_prazo` do plano continua sendo calculado na abertura (`abertura + horas`), apenas não é exibido.

## Indicadores (`/gestao/indicadores`) — revisado 2026-06-22
- **Visão de UNIDADE** (escopado por `unidadeAtiva.id`; antes agregava várias unidades). Período 24h/15d/30d. Tudo filtrado pelo período (criados no período).
- **Checklists**: Top 5 mais reprovados · Top 5 atividades com maior não conformidade.
- **Tickets**: contadores Em aberto / Em tratamento / Críticos em andamento / Finalizados + Top 5 categorias.
- **Planos de ação**: Em moderação / Aguardando N1 / Aguardando N2 / Corrigidos / Não corrigidos.
- **Tarefas**: Listas ativas / Respostas / % concluído.
- **REMOVIDO** o card "Taxa de aprovação por unidade" (cruzava unidades/empresas) — 2026-06-22. **Visão de EMPRESA (cross-unidade) virá depois**, à parte.

## Tela interativa da execução (viewer) — `/gestao/execucoes/[id]` e `/operacao/execucao/[id]`
Visualização **somente-leitura** de uma execução já respondida, compartilhada entre Gestão e Operação (componente `ExecucaoViewer`, prop `ambiente`). Renderiza as respostas por **seção → atividade**, cada tipo do seu jeito:
- **foto** → miniatura que **amplia** (lightbox); **vídeo** → player que **toca**; **localização** → mapa; **texto/número/sim_não/multipla_escolha/catálogo/data_hora** → valor formatado; **IA-foto** → desempacota `{valor, foto_ia}` (mostra valor + a foto).
- **Planos de ação** vinculados à execução aparecem como **link clicável** (abre o plano).
- Botão **"Baixar PDF"** (`POST /api/execucoes/[id]/pdf`, geração sob demanda).
- Dados via `GET /api/execucoes/[id]/dados` (**service role** + checagem de acesso: admin de sistema **ou** o próprio executor — ver `/security`).
- **Aberta por**: na Gestão, pela seta na Home e pelo "Ver execução completa" do plano de ação; na Operação, pelo botão do Histórico. Mantém o operador dentro da Operação (ambiente=operacao).

## Acessos → Empresa (`/gestao/acessos/empresa`)
Configuração da **própria empresa e suas unidades** (recurso core, nunca gateado por plano). Edita dados da empresa e gere unidades. É gestão da própria conta — não é vazamento entre tenants, só visibilidade (ver `/security`, RECURSOS_CORE).

## Operação — tela principal (`/operacao`)
- Acesso restrito a usuários com **perfil de Operação** (ou perfil que permita a tela). Sem seletor de unidade na tela (unidade vem da sessão).
- **Visibilidade**: o operador vê só os checklists publicados dos **subgrupos aos quais está associado** (`usuario_subgrupo`). Associação feita em **Gestão → Grupos** (UsuariosGrupoModal/AdicionarUsuarioModal nas telas de grupos/subgrupos).
- Tocar num checklist = escolher um **modelo publicado** → cria uma **instância** de execução.
- **3 abas** (mais Tarefas/Tickets quando há): (1) **Checklists** (lista por grupo/subgrupo + Não finalizados / Agendados / Workflows em andamento — workflows só dos subgrupos do usuário); (2) **Histórico** (execuções do usuário: status, planos abertos, PDF); (3) **Documentos** (docs da unidade/subgrupos + Consulta Inteligente).
- **Regras de exibição da aba Checklists / Histórico (2026-07-08)**:
  - **Modelo de checklist**: card mostra só **título + qtd de atividades** (sem descrição); título em 1 linha (altura uniforme). **Campo de busca** só aparece com **≥6 modelos**.
  - **Não finalizados**: card responsivo no mobile (botões Continuar/Não executar vão pra linha de baixo).
  - **Histórico**: card em 3 linhas (título / tempo / status). Badge **"Concluído" só em execução aprovada** — reprovada mostra só o badge de tratamento ("Reprovado · Aguarda N1/N2 / Corrigido / Não corrigido"); "Não executado" e "Em andamento" seguem exibidos.
- **Execução (tela do checklist)**: sem bloco de descrição do checklist. Atividade obrigatória **ou** crítica indica só com **asterisco vermelho** (sem badge "crítica"). Indicador numérico da seção fica **amarelo** quando a seção está toda respondida mas tem plano de ação pendente (não conforme + `gera_plano_acao` sem plano registrado); verde só quando não há pendência.
- **Abrir Ticket** (FAB): chamado avulso para não conformidades **fora do roteiro** dos checklists (ex: máquina quebrou → ticket p/ Manutenção). Checklist = roteiro fixo; ticket = a qualquer momento.
- **Sair (logout)** (2026-06-30, commit `8427336`): menu de usuário no header (ícone + nome ▾ → **Sair**), disponível para **todo papel** — inclusive operador puro. Antes o header só tinha "Instalar" + "Gestão" (admin), e o operador ficava preso sem logout. O botão "Gestão" continua, só para quem tem acesso.
- **Não funciona offline** — requer conexão.

## Documentos (suporte de conhecimento da Operação) — revisado 2026-06-20
- Cadastrados em **Gestão → Configurações → Documentos**; consultados na aba **Documentos** da Operação. **Por unidade**. Três tipos:
  - **POP** (Procedimento Operacional Padrão) e **IT** (Instrução de Trabalho): organizados em **etapas**, cada uma com texto, imagens e **vídeo** (`documento_etapas`/`etapa_imagens`).
  - **Consulta Inteligente**: documento sobre o qual o operador faz perguntas em linguagem natural; resposta por **IA** (rota `/api/documentos/consultar`). ⚠️ Consome os **tokens de IA do plano** (enforcement `billing_pode_consumir_ia`).
    - **Markdown em cache (2026-07-08)**: em vez de reanexar o PDF inteiro a cada pergunta (caro; só Gemini/Claude leem PDF), o PDF é convertido **1× via IA** para **markdown** (`documentos.conteudo_markdown`, migration `20260708150000`). A consulta manda só o **texto markdown** → muito menos tokens/pergunta, mais rápido, e passa a funcionar com **todos os provedores** (texto). O PDF original segue guardado p/ download. Geração: no upload (`ConsultaInteligenteModal` chama `POST /api/documentos/extrair-markdown`, fire-and-forget) e **lazy** na 1ª consulta se faltar (`lib/documentoMarkdown.ts` → `gerarMarkdownDocumento`). Arquivo novo zera o markdown (regenera). Fallback: se a conversão falhar (ou for imagem), anexa o arquivo como antes.
- **IA: dois mecanismos distintos** — o **Assistente de Ajuda** (`/api/ajuda`) usa a IA da **plataforma CheckFlow** (`ia_provedores`) e **NÃO** debita a cota do cliente; a **Consulta Inteligente** debita os **tokens do plano do cliente**.
- **Consulta Inteligente sem arquivo (2026-07-09)**: enquanto não tem `arquivo_url`, o documento **não aparece na Operação** (nem conta pra exibir a aba Documentos) — filtrado em `AbaDocumentos` e no cálculo de `temDocumentos`. Na **listagem da Gestão** ele aparece com um aviso âmbar **"Falta arquivo"** para o gestor saber que precisa anexar.
- **Visibilidade na operação**: por subgrupo/grupo do documento, ou **geral** (sem vínculo). Admin/admin-empresa vê tudo.
- **Quem gerencia** (revisado 2026-06-20): quem tem a **permissão `documentos`** (criar/excluir) + admin de sistema/empresa. RLS de escrita por permissão em `documentos`/`documento_etapas`/`etapa_imagens` + **storage** das imagens (bucket `empresas`, prefixo `etapas/`) — migration `20260620160000`. Antes era só `is_admin_sistema` (gestor tomava erro).
- **Vídeo da etapa**: link do **YouTube OU Google Drive público** (helper `lib/videoEmbed.ts` resolve a URL de embed; Drive → `/preview`; aceita ID legado de 11 chars do YT). Sem upload de vídeo — só link.

## IA por foto no campo (2026-07-14) — texto / sim_não / número ✅ validada em prod
Nova entrada de campo (além de QR/barcode): o operador **tira uma foto** que a IA interpreta por um **prompt** configurado na atividade, e a resposta preenche o campo. Reusa a infra multimodal/failover de `ia_provedores` (mesma da Consulta Inteligente).
- **Config (montador, `AtividadeModal`)**: em texto/sim_não/número, toggle **"Preencher por foto (IA)"** + `config.ia_prompt` (obrigatório) + `config.ia_editavel` (operador pode ajustar o resultado). Guardado no `config` jsonb — sem migration. O toggle só aparece se o plano inclui a característica `ia` ("Serviços de IA"); some em checklist com `permite_offline` (IA exige internet).
- **Prompt final por tipo** (lib pura `lib/ia/interpretarFoto.ts`, 12 testes): prompt do gestor + sufixo → **texto** "resumido, máx 4 linhas"; **sim_não** "apenas sim ou não"; **número** "só o valor absoluto/decimal". Pós-processa (`normalizarSimNao`/`extrairNumero`/4 linhas).
- **Rota** `/api/ia/interpretar-foto` (não-streaming): busca tipo/prompt da atividade server-side; **gate característica `ia` + `billing_pode_consumir_ia`**; failover; debita `uso_ia_eventos`. Retorna `{ valor }`.
- **Execução** (`operacao/[id]`, `CampoIAFoto`): captura → rota → preenche o campo (escalar no path ao vivo). Foto **guardada como evidência** (bucket `execucoes`, cota de armazenamento) no finalize → resposta vira **`{ valor, foto_ia }`**. `calcularValidacao` desempacota (valida pelo valor); viewer + PDF idem; viewer/execução mostram a foto (lightbox). `ia_editavel=false` trava o campo (valor read-only). Exige conexão.
- **Billing**: debita **tokens do cliente** + gate pela característica `ia` (compartilhada com Consulta Inteligente). ⏳ Follow-up menor: embutir a foto no PDF (só o viewer mostra hoje). Detalhes em [[feature-ia-foto-campo]].

## Serviços / Entitlements por plano — IMPLEMENTADO v1 2026-07-09 (migration `20260709050000_servicos.sql`)
- **Serviço** = **módulo** (mapeia a 1+ `recursos` de permissão) ou **característica** (ex.: IA, flag). Tabelas `servicos` (chave, nome, descricao, tipo, `recursos text[]`, flag, ordem, ativo) + `plano_servicos` (plano_id × servico_id). Catálogo semeado (checklists, estrutura, tarefas, tickets, dashboards, documentos, catálogos, padrões, turnos, agendamentos, planos_acao + IA).
- **Cada plano marca quais serviços inclui** (multiselect no editor `/sistema/planos`). A empresa **herda do plano ativo** (via `empresa_assinaturas.plano_id` → `plano_servicos` → recursos).
- **Serviço "padrão"** (`servicos.padrao`, migration `20260709070000`): flag **GLOBAL do serviço** (definida em `/sistema/serviços`, NÃO por empresa/plano). Funções base **sempre disponíveis**, independem do plano — seed marca `checklists`, `estrutura` (grupos/áreas), `catalogos`, `documentos`, `planos_acao`. Os recursos desses serviços entram no conjunto liberado mesmo com plano restrito. Toggle em `/sistema/serviços` (só p/ módulo); na comparação aparecem como "incluído em todos".
  - **Editor de plano (2026-07-13)**: só os serviços **não-padrão** ficam marcáveis (checkbox); os **padrão** aparecem numa seção **"Sempre incluídos" (read-only)** + nota de que usuários/perfis também são sempre liberados. Ao salvar, os padrão são **sempre persistidos** em `plano_servicos` junto dos opcionais marcados — senão um plano só-padrão ficaria com `plano_servicos` vazio e cairia na regra opt-in ("sem serviços = libera tudo").
- **Gating v1 (UI)**: `SessionContext.recursosHabilitados` (Set de recursos de MÓDULO | **null = sem restrição**; regra opt-in: sem plano OU plano sem serviços = null). **Construtor de perfil** (`PerfilModal`) só mostra recursos liberados + core (`home/usuarios/perfis`). **Menu** (`Sidebar`) esconde módulos fora do plano — **admin de sistema ignora** (plataforma); **admin da empresa é limitado ao plano**.
- **Características (flags) — gating próprio (2026-07-13)**: `SessionContext.flagsHabilitadas` (Set de `servicos.flag` das características do plano | null = opt-in, sem restrição). Características **NÃO entram** em `recursosHabilitados` (só módulos, que têm `recursos`). A característica `ia` (nome **"Serviços de IA"**, 2026-07-14) gateia **duas** features: **Consulta Inteligente** (`/api/documentos/consultar`) **e IA por foto no campo** (`/api/ia/interpretar-foto`) — ambas exigem o plano incluir `ia` **além** da cota de tokens (`billing_pode_consumir_ia`) e compartilham a mesma cota. UI esconde as duas quando `ia` não está no plano (Consulta Inteligente: `NovoDocumentoModal`/listagem/`AbaDocumentos`; IA-foto: toggle no montador + botão na execução via `flagsHabilitadas`). O 402 do servidor é backstop. Antes a característica era só informativa (matriz).
- **Cotas** (execuções/armazenamento/tokens) enforçadas por `billing_*`. IA = **cota de tokens** (`limite_tokens_ia_mes`) **E** característica `ia` no plano (os dois têm que passar).
- **Comparação** (fim do trial, `/gestao/plano`): **matriz serviços × planos** (✓/—) + linhas de limites, pra comparar antes de assinar.
- **Visibilidade do plano p/ a empresa (`planos.selecionavel_empresa`, migration `20260713120000`)**: distingue plano que a **empresa contrata sozinha** (`selecionavel_empresa=true` → aparece em "Planos disponíveis" no `/gestao/plano`) do que **só o admin de sistema atribui** (`false` — ex.: trial, cortesia). `ativo` = existe no catálogo (inativo some de tudo); `padrao` (1 só) = default de empresa nova; `selecionavel_empresa` = auto-serviço. O **plano ATUAL da empresa aparece sempre** no topo do `/gestao/plano`, mesmo sendo não-selecionável (trial/cortesia). **Trava de downgrade**: estando num plano PAGO ativo, a empresa **não** pode voltar a um não-pago por conta própria (a UI esconde não-pagos da lista; só o admin faz). Backfill marcou os `tipo='pago'` como selecionáveis. Antes a regra era fixa (`ativo AND tipo='pago'`).
- **Catálogo**: CRUD em **`/sistema/servicos`** (nome, descrição, tipo, recursos, flag, ordem, ativo). O editor de plano assinala quais serviços o plano inclui.
- **RLS por plano (fase 2, iniciada 2026-07-09)**: função `empresa_libera_recurso(empresa_id, recurso)` (SECURITY DEFINER, espelha a regra opt-in **incluindo os serviços `padrao`** — migration `20260709080000`). Gating de UI **não** é barreira de tenant (RLS por unidade/empresa continua). Ver `/security`, `/db`.
  - **⚠️ Regra de rollout (por que gatear TODAS as write policies)**: RLS permissiva combina por **OR** → gatear um módulo exige o gate em toda write policy da tabela, **inclusive a `*_admin_empresa`** (senão o admin da empresa fura). Padrão: `is_admin_sistema() OR (empresa_libera_recurso(...) AND <regra atual>)`; admin_empresa vira `is_admin_empresa_unidade(...) AND empresa_libera_recurso(...)`.
  - **Módulos com gate (rollout completo 2026-07-09)**: Dashboards (`...060000`), Documentos (`...090000`), Tarefas (`...100000`), Tickets (`...110000`), Agendamentos (`...120000`), Turnos (`...130000`), Padrões (`...140000`), Planos de Ação (`...150000`). Catálogos/estrutura/checklists = `padrao` (sempre liberado, não precisa gate).

### Comportamento de contratação / upgrade / downgrade por módulo (fonte única)
- **Princípio geral (opt-in)**: empresa **sem plano** OU com **plano sem nenhum serviço** configurado = **SEM restrição** (nada muda). O gating só "liga" quando o plano tem serviços marcados. Isso protege as empresas atuais.
- **Serviços `padrao`** (checklists, estrutura/grupos-áreas, catálogos **e Planos de Ação** — decisão 2026-07-09, toggle em prod): **sempre disponíveis**, em qualquer plano ou downgrade. Nunca bloqueados por contratação. Gatear esses recursos é inócuo (a função retorna `true`). ⚠️ Por isso o gate de **Planos de Ação** (recurso `causa_raiz`, migration `...150000`) fica **inerte** enquanto `planos_acao.padrao=true` — está aplicado e pronto, mas só passa a valer se desligarem o toggle "padrão" em `/sistema/servicos`.
- **Contratar / Upgrade** (plano passa a incluir o módulo): recurso liberado imediatamente na próxima leitura de sessão — aparece no menu, no construtor de perfil, e a **escrita** deixa de ser barrada pela RLS. Sem migração de dados.
- **Downgrade** (plano deixa de incluir o módulo): a regra é **preservar dado, barrar autoria nova** — nunca destrutivo, nunca estrangula operação viva:
  - **Leitura**: sempre preservada (dados já criados continuam visíveis; downgrade não esconde/apaga).
  - **Documentos**: bloqueia **criar/editar** documento/etapa/imagem (autoria). Delete continua livre (limpeza).
  - **Tarefas**: bloqueia **criar/editar lista** e suas filhas (autoria). **Não** bloqueia o operador **executar/responder** lista já publicada, nem **excluir** lista.
  - **Tickets** (operacional): bloqueia **abrir ticket novo** (policy restrictive de insert, cobre operador + admin_empresa) e a **config** (categorias/SLA). **Não** bloqueia **tratar/concluir/comentar/anexar evidência** em tickets já abertos (senão tickets em aberto ficariam presos).
  - **Agendamentos**: bloqueia criar/editar agendamento (autoria). ✅ **O cron de disparo também pausa no downgrade** (2026-07-20, migration `20260720140000`): como ele usa service role e ignora a RLS, o gate `empresa_libera_recurso(...,'agendamentos')` é explícito dentro de `agendamentos_processar()` — agendamentos de empresa fora do plano param de disparar **sem avançar `proxima_execucao`** (retomam ao religar o módulo, sem empilhar as ocorrências do período pausado). Cobre checklist e workflow.
  - **Turnos**: bloqueia criar/editar turno (config). Turnos já configurados seguem valendo (leitura em `usuario_esta_no_turno`).
  - **Padrões**: bloqueia criar/editar variáveis/padrões/instâncias. Templates globais (`unidade_id` null) sempre liberados.
  - **Planos de Ação** (recurso `causa_raiz`): bloqueia só a **autoria do catálogo de causa raiz**. O plano em si é **operacional** (nasce no finalizar da execução, moderação N1/N2) e **nunca é gateado** — senão quebraria a finalização de checklist. Registrar ocorrência e N1/N2 adicionar causa durante a moderação também seguem livres.
  - **admin de SISTEMA** (plataforma) ignora todo gate; **admin da EMPRESA** é limitado ao plano.
- **Cotas vs. entitlements**: cotas (execuções/armazenamento/tokens) seguem em `billing_*` — independentes do gate de módulo. Um módulo liberado ainda respeita a cota.

## Dashboards (painéis públicos de TV) — IMPLEMENTADO 2026-07-09; **2 tipos de painel + frescor + tempo médio (2026-07-11)**
- **Objetivo**: monitorar em tempo quase real (TV/tela) a execução de checklist e agir preventivamente em desvios. Caso de uso original: acompanhar pontos de produção de etapas anteriores.
- **Estrutura**: `dashboards` (nome, `token` único, `transicao_segundos` = rotação entre painéis, `refresh_segundos` = polling dos dados) + `dashboard_paineis` (ordem, `tipo`, `atividade_id`, `checklist_id`, `janela_horas`, `alerta_silencio_horas`, título opcional). Gerenciado em **Gestão → Configurações → Dashboards** (lista + editor `[id]`). Migrations: `20260709030000_dashboards.sql` (base), `20260711120000_painel_alerta_silencio.sql` (frescor), `20260711140000_painel_checklist.sql` (tipo checklist + `iniciado_em`).
- **Permissão** `dashboards` (ver/criar/deletar); escopo **unidade**. O seletor cruza **qualquer grupo/subgrupo da unidade** (grupo→subgrupo→checklist→[atividade]), sem a trava de subgrupo — qualquer gestor monitora outros pontos.
- **Link público (TV)**: página `/painel/[token]` **sem login**; qualquer um com o link vê. Lê `GET /api/painel/[token]` (**service-role, escopada ao token** — só devolve os painéis daquele dashboard) em **polling**. Token **revogável/regenerável** no editor. Carrossel entre painéis + auto-refresh (separados).

### Dois tipos de painel (`dashboard_paineis.tipo`, CHECK de alvo único)
No editor, ao adicionar um painel escolhe-se o tipo: **"Uma atividade"** (`tipo='atividade'`, usa `atividade_id`) ou **"Checklist inteiro"** (`tipo='checklist'`, usa `checklist_id`). Painéis antigos = `'atividade'` (default). `alerta_silencio_horas` e `janela_horas` valem para os dois.

### Selo de frescor (silêncio) — ambos os tipos
- Cabeçalho de todo painel mostra "há X min" da **última leitura** (painel de atividade = última resposta daquela atividade; painel de checklist = última execução do checklist).
- `alerta_silencio_horas` (nullable, por painel, campo "alerta se parar (h)" no editor): **verde** até metade do prazo → **amarelo** entre metade e o prazo → **vermelho pulsante** ao estourar (texto "sem registro há X"). **null = sem alerta** (selo neutro só com "há X"). O gestor calibra pela cadência esperada do ponto (forno a cada 30min → 1h; limpeza 1×/turno → 8h). Resolve o ponto cego de a TV "congelar" sem ninguém perceber que parou de medir.

### Painel de ATIVIDADE — gráficos (repensados 2026-07-09 p/ contexto temporal + não-conformidade)
- **Número** → linha do tempo + **faixa aceitável SOMBREADA** (min/max do `config`) + pontos fora em vermelho + valor atual e **% fora da faixa**.
- **Padrão** (faixa varia por ponto — depende da combinação de variáveis): **ribbon** quando a faixa é única na janela (linha + faixa fixa, unidades reais); senão **índice normalizado** (0 = centro, ±100% = borda) — combinações diferentes comparáveis num eixo só, com zona fixa "dentro do padrão".
- **Sim/Não** → **linha da % de conformidade POR DIA** + linha de média. Cards: % conforme geral + tendência.
- **Única escolha** (`multipla_escolha` **só de escolha única**; multi-select fora) → **barras EMPILHADAS por dia** (composição no tempo; não-conforme em vermelho, conformes em cores).
- **Rodapé (2026-07-11)**: "N execuções · M não executadas — motivo (n)" — traz a **não-execução** (que não gera linha no gráfico) para o painel. Fonte: `checklist_execucoes` por `checklist_id` da atividade na janela (`resumoExecucao`).
- Tipos elegíveis: `sim_nao`, `multipla_escolha` (única), `numero`, `padrao`.

### Painel de CHECKLIST (2026-07-11) — a execução do checklist inteiro
Uma tela que responde "está rodando? · está conforme? · onde falha? · quão rápido? · está sendo tratado?":
- **Placar da janela**: Executados · **Aprovação %** · Reprovados · Não executados · **Tempo médio** (`placarChecklist`).
- **Conformidade por dia**: barras empilhadas aprovado (verde) × reprovado (vermelho) das concluídas (`conformidadePorDiaExec`).
- **Top atividades não conformes**: ranking das que mais reprovam na janela (`topNaoConformes`) — usa a coluna `conforme` **já gravada** na resposta (mesma base do `/gestao/indicadores`, não o recálculo do painel de atividade).
- **Rodapé — Não execução (2026-07-11, revisado)**: os **motivos de não execução** agrupados na janela ("falta de insumo (2), …"; "nenhuma no período" quando zero). Fonte: `resumoExecucao` sobre `checklist_execucoes` do checklist. *(O bloco "Tratamento"/planos foi **removido** do painel a pedido — o placar já mostra reprovados; o tratamento fica na gestão/indicadores.)*
- **Tempo médio de execução** (`tempoMedioExecucao`): média de `data_execucao − iniciado_em` das **concluídas com `iniciado_em`**. ⚠️ `iniciado_em` (migration `...140000`) é carimbado pelo cliente **só na execução "de uma vez"** (fresh insert, sem workflow) — retomada/agendada/workflow/offline ficam null e **saem da média**. Execuções antigas nasceram sem `iniciado_em` → tile mostra **"n/d"** até acumular execuções novas ("desde a ativação"). Pausáveis feitas em 1 sessão contam (duração real); só as realmente **pausadas** não entram (caem no path de update, não no fresh insert).

### Fonte de dados e lógica
- **Painel de atividade**: `checklist_execucao_respostas` (`resposta` jsonb, `criado_em`) por `atividade_id` na janela. ⚠️ para os gráficos a conformidade é **recalculada** na rota (número/padrão pela faixa; sim_não por `config.esperado`; única escolha por `checklist_atividade_opcoes.e_valido`) — o painel NÃO confia no `conforme` gravado. (O painel de checklist, por outro lado, usa `conforme` gravado para o Top NC e `checklist_execucoes.resultado` para o placar — decisão de consistência com a gestão.)
- **Painel de checklist**: `checklist_execucoes` (status/resultado/`iniciado_em`/`data_execucao`) + respostas das concluídas (Top NC) + `planos_acao` (tratamento), tudo por `checklist_id` na janela.
- Lógica pura em `lib/painelDados.ts` (atividade: `montarLinha`/`montarPadrao`/`serieConformidade`/`composicaoDiaria`/`agruparPorDia`/`resumoExecucao`; checklist: `placarChecklist`/`conformidadePorDiaExec`/`tempoMedioExecucao`/`topNaoConformes`), toda testada em `painelDados.unit.test.ts`. Payload montado por `montarPainelChecklist` na rota.
- **Imagens de etapa contam na cota** de armazenamento (`registrarUsoArmazenamento(..., 'documento', ...)`; origem `'documento'` adicionada ao CHECK). Documento é permanente (a limpeza por tempo de guarda NÃO apaga imagens de documento).
- **Excluir**: soft-delete (`status='inativo'`) **direto** (documento é consulta livre, não referenciado por checklist) — sem guard.
- **Duplicar**: copia documento + **etapas + imagens** (reusa as URLs das imagens; não re-faz upload). Pode duplicar p/ outra unidade/grupo/subgrupo.

## Execução de Checklist
- **PDF sob demanda** (2026-06-17): não é mais gerado automaticamente ao concluir. Botão "Gerar PDF" na tela de conclusão e no Histórico → chama `/api/execucoes/[id]/pdf` e mostra "Baixar" quando pronto.
- **Plano de ação na Operação**: do Histórico, o link abre `/operacao/plano/[id]` (visão **somente-leitura**: status, atividade, evidências, andamento N1/N2) — mantém o operador na Operação (antes ia para `/gestao/planos-acao`, sem acesso). Moderação segue na Gestão. RLS de `planos_acao` já permite leitura pelo executor (`checklist_execucao_id` executado por ele) + tabelas filhas via `plano_acao_id in (select id from planos_acao)`.
- Ao finalizar, salva em `checklist_execucoes` com `status = 'concluido'`
- `resultado` = `'aprovado'` se todas as atividades conformes; `'reprovado'` se qualquer `calcularValidacao() === false`
- ⚠️ **Plano de ação é OBRIGATÓRIO ao reprovar** item com `gera_plano_acao` (2026-06-30, commit `ae73ff6`): o **Finalizar bloqueia** ("Abra o plano de ação para: …") se há atividade não conforme com `gera_plano_acao=true` e **sem** plano preenchido (`planosCapturados[id]`). A observação do plano é obrigatória no modal. Antes era opcional (deixava finalizar sem tratativa). O plano só vira registro em `planos_acao` **no finalizar**, atrelado à execução.
- **"Continuar depois" salva só as respostas** (snapshot no servidor), **NÃO** o plano de ação em preenchimento (é finalize-only) — o plano digitado se perde ao "Continuar depois". Na retomada (`?exec=`) a atividade reaparece reprovada e a regra acima **força recriar** o plano antes de finalizar (nenhuma não conformidade escapa). Decisão do usuário (2026-06-30): **deixar assim** (coerente com "sem rascunho local").
- **Validação leva ao campo pendente** (2026-06-30): as seções são acordeão (uma aberta por vez); ao bloquear o Finalizar, o app **abre a seção do 1º campo pendente e rola até ela** (`irParaAtividade`) — vale p/ obrigatória sem resposta e p/ plano de ação faltando.
- `data_expiracao` = `data_execucao + tempo_guarda_meses` meses (calculado pela aplicação)
- `tempo_guarda_meses` **padrão: 1 mês** (era 12 — mudado no DB default em 2026-06-30, migration `20260630120000`, p/ não guardar mídia à toa). Vale em **todo** caminho de criação (manual, duplicação, modelo/`clonar_template`, IA, setup) — o usuário aumenta manualmente no montador se quiser. Opções: 1, 3, 6, 12, 24, 36, 48, 60 meses
- Execuções são isoladas por `unidade_id` via RLS
- Quando vem de workflow (`?wf_item=<id>`): insert com `status='em_andamento'` → linka `workflow_item_execucoes` → update para `'concluido'` → trigger avança o pipeline

## Estrutura do Checklist
- Um checklist tem **1 ou mais seções**; cada seção tem **1 ou mais atividades**.

## Gestão → Checklists (listagem + montador) — revisado 2026-06-17
**Listagem** (`/gestao/checklists`):
- Lista os checklists publicados/rascunho **dos subgrupos a que o usuário tem acesso**, da unidade ativa; inativos nunca aparecem (nem no filtro). Filtros: busca + Todos/Rascunho/Publicado.
- **"Usar um modelo"** → galeria `/gestao/checklists/modelos`. O modelo é genérico (criado pela CheckFlow/admin do sistema); usar = **copiar** para a unidade. **A cópia é independente**: adicionar atividade no modelo de origem **não** reflete na cópia (sem vínculo).
- **"Novo checklist"** → cria do zero numa unidade/grupo/subgrupo. A empresa contratante pode criar o próprio e **duplicar para outra unidade/grupo/subgrupo**.
- **"Gerar com IA"** (3ª opção de criação, 2026-06-30, commit `6ba82a7`): modal com um **prompt** (aviso para ser **bem detalhista** — pontos a verificar, faixas de valores, o que é crítico/abre plano) → cria um checklist **rascunho** na unidade ativa e **abre o montador para revisão/publicação** (nunca publica direto). Rota `POST /api/checklists/gerar` reusa o motor `lib/ia/checklistIA` (failover de `ia_provedores`, **IA da plataforma — NÃO debita tokens do cliente**, igual ao "Gerar com IA" de templates do admin). Os INSERTs rodam com o **JWT do usuário** → RLS garante unidade + permissão `checklists` (gestor sem permissão é barrado). Tipos restritos a sim_nao/numero/texto/foto/data_hora/multipla_escolha (catálogo/padrão dependem de cadastro prévio). A IA pode errar detalhes (ex.: múltipla escolha sem opções) → o usuário ajusta no montador.
- Menu por item: **Duplicar** e **Inativar**.

**Inativar** (regra forte):
- **Pede confirmação** (ConfirmDialog) — não é mais otimista silencioso.
- Se o checklist está vinculado a **um ou mais workflows publicados**, **NÃO pode ser inativado**: o sistema avisa, listando o(s) **nome(s) do(s) workflow(s)**, e exige que seja **desvinculado do workflow primeiro** (ou inativar o workflow). Guard duplo: pré-checagem na UI (`workflow_estagio_itens`→`workflow_estagios`→`workflows`, status publicado) + trigger no banco (`checklist_bloquear_inativacao_em_uso`). Obs: workflow é transversal à empresa, não tem "grupo de criação" próprio.
- Inativar preserva o histórico (só muda status → `inativo`).

**Duplicar** (modal, copia profunda → rascunho v0):
- Escolhe unidade de destino (pode ser outra), grupo, subgrupo e nome.
- Copia seções, atividades (incl. dependentes multinível), opções de múltipla escolha, **motivos de não execução** e **catálogos**.
- **Catálogos**: ao duplicar para **outra unidade**, recria o(s) catálogo(s) (estrutura + valores) no **cadastro de catálogos da unidade de destino** e remapeia `config.catalogo_id`. **Avisa + pede confirmação** antes (catálogo novo será criado lá). No mesmo destino, o `catalogo_id` continua válido (não recria).

**Tempo de guarda das mídias** (montador): opções 1/3/6/12/24/36/48/**60** meses (default **1 mês**). Apaga **só as mídias** (fotos/vídeos/PDFs) após o prazo — **o registro da execução é preservado**. Quanto maior o prazo, maior o consumo da **cota de armazenamento do plano**. ⏳ PENDENTE: prever configuração para a empresa guardar mídias em **repositório próprio (ex: S3)** — nesse modo o tempo de guarda não apagaria nada, só arquivaria.

## Grupos / Subgrupos — visibilidade e funções — revisado 2026-06-17
- Grupos e subgrupos são as áreas/setores da unidade (`unidade_id`/`grupo_id`, status ativo/inativo). Labels personalizáveis em Formatação.
- **Visibilidade**: o operador vê os checklists publicados dos subgrupos a que está associado (`usuario_subgrupo`). **Regra do "nenhum subgrupo selecionado = acesso a todos"**: aparece em `AdicionarUsuarioModal` e `SubgruposUsuarioModal` — confirmar implementação real no fetch da Operação.
- **Perfil público** (`perfis.publico=true`): perfil que **gestores de grupo/setor** podem atribuir (ex: cobertura temporária de liderança); não-público só o **Admin da empresa** (ou admin de sistema) atribui — trigger `validar_troca_perfil` garante. NÃO confundir com `empresa_id is null` (= perfil de sistema/global, modelo p/ todas as empresas). No `UsuariosGrupoModal` (contexto de gestor) o seletor de perfil mostra **só os públicos** (+ o perfil atual do usuário, mesmo não-público, apenas para exibição; só atualiza se mudar). Em Acessos → Usuários (admin da empresa) mostra todos.
- **Pré-requisito p/ adicionar ao grupo**: o usuário precisa **já estar cadastrado na empresa** (`usuario_empresa`). O `AdicionarUsuarioModal` só lista usuários da empresa; cadastro de novo usuário é em `/gestao/acessos/usuarios`.
- **"Gerenciar usuários"** (`UsuariosGrupoModal`) — por usuário do grupo: editar **nome/telefone/perfil/turno/período**; gerenciar **subgrupos** de acesso; **reenviar senha** (envia código por WhatsApp via `/api/usuarios/resetar-senha` — fluxo CPF+OTP, exige telefone); **remover do grupo** (apaga `usuario_grupo` **e** os `usuario_subgrupo` daquele grupo, sem acesso órfão — não exclui o usuário do sistema). Editar perfil respeita o guard do último admin (trigger). Perfil: só mostra públicos (+ atual); turno/período: carrega turnos da empresa + períodos condicionalmente (igual ao fluxo de Acessos → Usuários). Atualizado 2026-07-01.
- **Funções por subgrupo** (`usuario_subgrupo.funcao`): definem o papel do usuário sobre os checklists daquela área.
  - **— (null)**: só visualiza.
  - **Operação**: executa checklists.
  - **Nível 1**: executa + **modera** os planos de ação abertos por não conformidade → ações: **corrigir, não corrigir, escalar para N2**.
  - **Nível 2**: recebe a moderação **escalada pelo N1** → ações: **corrigir, não corrigir, devolver para N1**; também pode atuar como N1 e executar checklist.
  - **Notificações por nível**: cada nível só recebe alerta (WhatsApp + e-mail) quando a ação é **compatível com o seu nível** (N1 recebe o que é de N1; N2 recebe o escalado para N2).

## Acessos → Usuários — revisado/corrigido 2026-07-01
- Lista usuários **ativos** da empresa por padrão. **Toggle "Mostrar inativos"** exibe usuários inativados com badge cinza + visual acinzentado + botão "Reativar" (ícone RotateCcw). Ativos continuam ocultos no toggle inativo.
- **Inativar usuário**: `/api/usuarios/inativar` invalida a sessão do usuário (`signOut` global) + marca `status='inativo'`. **Guard do último admin**: bloqueia (HTTP 409) se o usuário for o último `admin_empresa` ativo da empresa — não pode restar a empresa sem administrador.
- **Reativar usuário**: rota via service role (bypassa RLS de escrita que só permite inativar o próprio). Admin de sistema ou admin da empresa pode reativar.
- **Cadastro/edição (modal `UsuarioModal`)**: nome, CPF, telefone, e-mail, **perfil** (obrigatório; só públicos p/ não-admin), **turno**, **período do turno** (seletor aparece condicionalmente se turno for tipo escala), **unidades**. Acessível também via **"Minha conta"** no dropdown do header (edita o próprio usuário logado; nome no header atualiza ao salvar).
- **Unidades inativas** não aparecem no seletor de unidades do modal (filtradas para não criar vínculo com unidade desativada).
- **RLS UPDATE de usuários por admin de empresa** (migration `20260701050000`): adicionada policy `usuarios_escrita_admin_empresa` — admin de empresa pode UPDATE em `usuarios` para qualquer usuário da sua empresa (inclui nome, cpf, telefone, turno_id, turno_periodo_id). Sem esta policy, o UPDATE via browser client falhava silenciosamente.
- **RLS leitura por admin de empresa** (migration `20260701000000`): policy `usuarios_admin_empresa` garante que admin de empresa veja todos os usuários da empresa diretamente, sem depender do join recursivo.
- 🔴→✅ **Bug corrigido (2026-06-17)**: a criação avulsa **não vinculava `usuario_empresa`/perfil/unidades** (usuário ficava órfão, não aparecia na lista nem podia entrar em grupos) e a **edição não salvava perfil/unidades**. Fix: rota `/api/usuarios/criar` agora recebe `empresaId/perfilId/unidades` e insere `usuario_empresa` (com rollback) + `usuario_unidade`; o modal salva perfil (`usuario_empresa`) e sincroniza unidades (`usuario_unidade`) na edição, e carrega as unidades atuais ao abrir. Avatar removido (não haverá foto de pessoa).
- ✅ **RLS resolvido (2026-06-20)**: o **Admin da empresa** agora tem policies próprias para gerenciar `usuario_empresa`/`usuario_unidade`/`usuario_grupo`/`usuario_subgrupo` (+ estrutura) da sua empresa — edições client-side de perfil/unidades funcionam sem depender de service role. Ver seção "Admin da empresa" abaixo.

## Admin da empresa — mesmas funções do admin de sistema, na empresa toda (2026-06-20)
- **Quem é**: usuário com `usuario_empresa.perfil_id = '…002'` (perfil de sistema "Admin da empresa"). Pode haver **vários em paralelo** numa mesma empresa.
- **Escopo = a empresa inteira** (TODAS as unidades dela), nunca outras empresas. "Não faz parte" = outras EMPRESAS, não outras unidades.
- ⚠️ **Regra de UI por unidade ativa (2026-06-20)**: TODA tela mostra os dados de **uma única unidade** — a **unidade ativa** da sessão. O admin da empresa (e qualquer usuário multi-unidade) **troca de unidade** para ver cada uma; nunca várias misturadas. O RLS cross-unidade do admin existe só para que, ao trocar para qualquer unidade da empresa, a consulta (filtrada por `unidade_id` da unidade ativa) retorne os dados. Telas devem **sempre filtrar por `unidadeAtiva.id`** (corrigido em Home e listagem de Planos de Ação, que não filtravam).
- **Escopo por unidade nas listagens (2026-06-20)**: TODA listagem deve **respeitar a unidade selecionada no SELETOR GLOBAL do header** (`unidadeAtiva`) — ou seja, filtrar a query por `unidadeAtiva.id`. **NÃO** se adiciona um seletor/dropdown de unidade próprio em cada tela (o do header já serve para todo o app; duplicar é redundante). [Tentei um componente `FiltroUnidade` por tela — REMOVIDO; o requisito é só respeitar o header.] Verificar que cada listagem filtra por `unidadeAtiva.id`.
- **Pode (em toda a SUA empresa, todas as unidades)**: gerenciar usuários/acessos (incl. **atribuir outro Admin da empresa**), estrutura (unidades, grupos, subgrupos, turnos), perfis não-sistema e permissões; e **vê/gerencia tudo** — todas as unidades + ignora o filtro por subgrupo nas telas operacionais (tickets, planos de ação, tarefas, operação, agendamentos, checklists, documentos, catálogos).
- **NÃO pode**: gerenciar outras empresas; definir catálogo de planos/preços (só seleciona o plano da própria empresa); adicionar parceiros/provedores de IA; mexer em colunas financeiras; e **não pode se tornar nem atribuir "Admin de sistema"** (guard no `with check`: `perfil_id <> '…001'`).
- **Implementação**: migration `20260620120000_admin_empresa_rls.sql` — helpers `is_admin_empresa(empresa_id)`, `is_admin_empresa_unidade/_grupo/_subgrupo` (escopo por EMPRESA, não por membership de unidade) + policies **aditivas** (RLS combina com OR; não reescreve as existentes) na estrutura, acessos e **tabelas operacionais (parents + filhas, todas as unidades)**. UI: `lib/admin.ts` `ehAdminDaEmpresa()` substitui o check de `role==='admin_sistema'` nas telas; `SessionContext.carregarUnidades` lista TODAS as unidades da empresa para o admin (perfil ...002).
- ⏳ **Pendente**: pentest de isolamento entre empresas (`pentest/admin-empresa-rls.mjs`) — garantir que admin da empresa A não lê/escreve dados da empresa B e não vira admin de sistema. Ver `/security`.

## Tickets — revisado 2026-06-18
- Chamado avulso para não conformidades fora do roteiro, direcionado a um **grupo + subgrupo** (terminologia padronizada — não usar "setor"; usar `grupoLabel`/`subgrupoLabel`). Categoria opcional. Qualquer usuário abre ticket para qualquer grupo/subgrupo da unidade.
- **Status**: aberto → em_tratamento → (opcional: aguardando_informacao = responsável pediu algo ao abridor, SLA pausa) → o **responsável conclui direto**: **corrigido** ou **nao_corrigido** (ou cancelado). O **abridor é avisado e pode REABRIR** se discordar (volta a 'aberto' sem responsável). **Mudança 2026-06-18**: removida a etapa "Propor conclusão"/`aguardando_validacao`. Evento `conclusao` notifica o abridor.
- **Mudança 2026-07-05: removidas as saídas "corrigido parcial" e "improcedente"** do fluxo (só complicavam) — some da operação E da gestão. Removidas de `lib/tickets.ts` (fonte única). Os status `corrigido_parcialmente`/`improcedente` seguem no enum só para dados históricos, mas **não são mais oferecidos**.
- **SLA**: cadastrado em `/gestao/tickets/sla` — prazo de **aceite** e **resolução** por **prioridade** (padrão da unidade + override por categoria raiz). Semáforo verde/amarelo/vermelho; pausa em aguardando_informacao. SLA de tickets **fica** (não confundir com o SLA de planos, arquivado). Gestão por permissão `ticket/categorias_gerir` + unidade. Defaults 60min aceite / 480min resolução.
- **Indicadores da listagem (revisado 2026-06-22)**: "Em aberto" conta **só os NÃO aceitos** (status `aberto`); ao ser assumido vira **"Em tratamento"** (em_tratamento + aguardando_*). Cards: Em aberto (a aceitar) / Em tratamento / Críticos em andamento / Finalizados. Filtro com as 4 abas. Antes "Em aberto" somava tudo não-finalizado. Grupos em `lib/tickets.ts`: `STATUS_NAO_ACEITO` / `STATUS_EM_TRATAMENTO`.
- **Visibilidade (2026-06-18)**: a listagem mostra só os tickets dos **subgrupos do usuário** (+ os que ele abriu); admin vê todos. Contadores idem.
- **Assumir**: só quem é do **subgrupo de destino** (ou admin). Demais ações por papel: responsável trata; abridor responde/valida/reabre; comentar sempre; cancelar = abridor ou permissão `ticket.cancelar`; improcedente = responsável com `ticket.cancelar`.
- **Decisão 2026-06-18: NÃO usar perfil em tickets** — o controle de acesso é por **subgrupo** (visibilidade por subgrupo + assumir só por membro) + papel (abridor/responsável). As permissões `ticket.*` do catálogo ficam sem enforcement (exceto `ticket.cancelar`, que já gateia improcedente/cancelar). Não enforçar `ticket.ver/criar/tratar`.
- **Categoria é OBRIGATÓRIA** ao abrir ticket (validação no `NovoTicketModal`, 2026-06-20).

### Tickets duplicados — vínculo a um principal (2026-07-20)
Várias pessoas podem abrir chamados para a mesma coisa. **Quem assumiu** um ticket (o responsável) — ou um admin — pode **vincular duplicados**, escolhendo um **principal** e marcando os demais como **duplicados** dele. Feito no detalhe do ticket (bloco "Duplicados vinculados" / modal Vincular).
- **Nos 2 sentidos**: "marcar outro como duplicado deste" (este vira principal) ou "marcar este como duplicado de outro" (o outro vira principal). Vínculo é **plano** (um duplicado nunca tem duplicados; escolher um principal que já é duplicado sobe para o pai real) e **só dentro da mesma unidade**.
- **O duplicado CONGELA**: status `duplicado`, sai das filas "Em aberto"/"Em tratamento" e do SLA (semáforo some). Aparece na listagem com badge **"Duplicado"**. Ninguém trata o duplicado — todo trabalho acontece no principal.
- **Quem abriu o duplicado vira "interessado" do principal**: (1) passa a **enxergar o principal** (RLS liberada) mesmo ele tendo responsável; (2) é **avisado (WA/e-mail/push) quando o principal é concluído** (corrigido/não corrigido) — respeitando férias/turno. Só na **conclusão** (sem ruído a cada movimentação). Na tela do duplicado, um banner aponta para o principal.
- **Desvincular** (responsável do principal/admin): devolve o duplicado para "Aberto" (vínculo errado). Cada (des)vínculo grava evento imutável na timeline dos dois (`vinculo`/`desvinculo`).
- **Onde**: (des)vínculo é **server-side** (`apps/api` `POST /tickets/vincular` e `/desvincular`, service role) porque o responsável do principal pode não ter permissão de UPDATE no duplicado pela RLS. Integridade garantida por trigger no banco. Ver `/db`, `/ops`.

### Tickets na OPERAÇÃO — novo (2026-07-05)
- **Aba "Tickets" na operação** (`app/operacao/AbaTickets.tsx`, ao lado de Checklists/Tarefas) — some quando não há ticket. Seções: **Aguardando você** (abri e voltou como `aguardando_informacao` → preciso responder), **Para assumir** (abertos sem responsável do meu subgrupo), **Em tratamento · comigo** (assumidos por mim), **Encerrados recentes** (últimos 5). Operação NÃO lista tickets que abri para OUTRO subgrupo (edge fora).
- **Tela de detalhe do ticket na operação** (`app/operacao/tickets/[id]/page.tsx`) — operador chega por link da notificação OU pela aba. Reusa `lib/tickets.acoesDisponiveis`.
- **Link da notificação por perfil**: operador puro (`perfil_id …003`) recebe `/operacao/tickets/[id]`; demais `/gestao/tickets/[id]` (na API `tickets.ts`). `GestaoGuard` também redireciona operador de `/gestao/tickets/[id]` → `/operacao/tickets/[id]`.
- **Assumir = um toque**: não exige observação nem evidência (grava evento com texto padrão "Ticket assumido"). As demais ações documentam (observação obrigatória, revelada ao escolher a ação). Menu de ações compacto (dropdown), na ordem: Solicitar informação · Comentar · Concluir corrigido · Marcar não corrigido · Cancelar.
- **Transferir na operação** (botão de ícone ⇄, fora do dropdown): grupo/subgrupo pré-marcados e editáveis + **"Atribuir a"** um usuário do subgrupo. Com usuário → vira `assignee` e `em_tratamento` (a notificação de `transferencia` chega direto nele); sem usuário → volta a `aberto` para o subgrupo assumir.
- **"Aguardando você"** também na **gestão** (banner "Aguardando sua resposta" no topo da lista, independente do filtro) — para o abridor não depender só da mensagem.
- **Evidências**: dois caminhos **Câmera + Galeria** (`components/tickets/EvidenciaPicker.tsx`), com **limite foto 10 MB / vídeo 50 MB** (`lib/midia.ts`) — barra no cliente com aviso. Fotos aparecem como **miniatura com lightbox** na timeline da operação. Evidência sempre vinculada ao evento (`evento_id`); `uploaded_by` obrigatório.

## Tickets → Categorias — revisado 2026-06-20
- Árvore de **2 níveis** (raiz → subcategoria) por unidade. Classifica os chamados.
- **Categoria padrão** `e_generica` = **"Não informada"** (renomeada de "Sem categoria" em `20260620180000`) — criada sob demanda via `garantir_categoria_generica`; não editável/excluível (badge "padrão"). É o fallback obrigatório quando o abridor não escolhe outra.
- **Quem gerencia**: perfil com a permissão **`ticket` / `categorias_gerir`** (criar/editar/excluir) — registrada no catálogo. RLS de escrita de `ticket_categorias` e `ticket_sla_config` = permissão **+ unidade** (escopo por unidade adicionado em `20260620180000`; antes não restringia unidade).
- **Excluir**: soft-delete (`ativo=false`) **direto** — tickets antigos ficam com a categoria inativa (sem guard, decisão do usuário).

## Assistente de IA — sugestões por tela (2026-06-18)
- O botão flutuante (`components/ajuda/AssistenteAjuda.tsx`) detecta a rota atual (`usePathname`) e mostra **perguntas sugeridas pertinentes àquela tela** (mapa `SUGESTOES_POR_TELA`, casa pelo prefixo mais específico; fallback `SUGESTOES_PADRAO`). Clicar no chip envia a pergunta. 100% frontend — **não muda a chamada à IA nem adiciona tokens** (tende a reduzir, por evitar tentativa-e-erro). Campo livre continua permitindo perguntar sobre qualquer parte do sistema.
- ⚠️ **Renderizado SÓ no layout de gestão** (`app/gestao/layout.tsx`) — **não existe na Operação** (só há sugestões p/ rotas `/gestao/*`). Se um dia entrar na operação, adicionar entradas `/operacao*`.
- **Cobertura do mapa (auditada 2026-07-13)**: checklists, tarefas, grupos, agendamentos, tickets, planos-acao, acessos/usuarios, acessos/perfis, acessos/turnos, catalogos, documentos, **dashboards**, workflows, padrao, nao-execucao, causa-raiz, notificacoes, formatacao, plano, indicadores. Telas sem entrada caíam no fallback genérico (perguntas de checklist) — foi o gap reportado (dashboards). **Regra viva: toda tela de gestão nova = entrada no `SUGESTOES_POR_TELA`** (junto do requisito do `/uimap`).
- ⏳ Evolução p/ cortar tokens de verdade (quando o MANUAL crescer): enviar só a seção da tela com fallback, ou RAG (pgvector) — ver `/status`.

## Premissa de montagem (mental model) — 2026-06-17
- Ao montar uma atividade, o que importa é o **tipo de resposta** desejado, não a pergunta. O usuário escolhe o **tipo** pela resposta que quer obter (sim ou não → Sim/Não; valor numérico → Número; escolher entre opções → Múltipla escolha; etc.). A pergunta vai no nome/descrição.
- Entender as **dependências entre campos** é parte do desenho: a resposta de uma atividade-pai (Sim/Não ou Múltipla escolha) define quais dependentes serão exibidas. Montar = decidir o tipo de cada resposta + a ramificação.

## Tipos de atividade — detalhes revisados 2026-06-17
- **Data/Hora**: na execução o campo já vem **pré-preenchido com o horário atual** (local); o operador pode ajustar. (`CampoDataHora` em `operacao/[id]/page.tsx`.)
- **Texto com QR Code / Barcode**: a leitura usa a câmera e **só funciona no app mobile**. No montador (`AtividadeModal`), ao habilitar QR/barcode, aparece aviso de que no desktop o operador digita o valor manualmente.

## Atividades Dependentes
- Uma atividade pode ter `atividade_pai_id` + `valor_gatilho`
- Ela só aparece na execução quando a resposta do pai === `valor_gatilho`
- A atividade-**pai** só pode ser do tipo **sim/não** ou **múltipla escolha** (tipos que servem de gatilho); múltipla escolha compara `valor_gatilho` com o array de seleção
- **Retomar execução pausada**: o operador NÃO usa URL — clica em **"Continuar"** na seção "Não finalizados" (topo da aba Checklists), que reabre restaurando as respostas (internamente via `?exec=`)

## Limites de mídia (fixos, globais) — 2026-06-17
- Constantes em `apps/web/app/operacao/[id]/page.tsx`: `MAX_FOTOS=5`, `MAX_VIDEO_SEG=10`, `VIDEO_BITRATE=1.5Mbps`, `FOTO_MAX_PX=1600`, `FOTO_QUALIDADE=0.8`.
- **Fotos**: comprimidas no navegador ao capturar (`comprimirImagem`: redimensiona p/ 1600px no lado maior + JPEG 0.8 → ~300–500 KB). Evidência de **plano de ação** aceita até **5 fotos** (botão some + aviso ao atingir; contador "n/5"). Atividade tipo **foto** continua **1 foto** (também comprimida).
- **Vídeo** (`GravadorVideo`, getUserMedia): bitrate fixo ~1,5 Mbps + **auto-stop em 10s**; ~2 MB por clipe. Contador mostra "mm:ss / 00:10".
- Racional de cota: 1 vídeo + 5 fotos ≈ 4–5 MB; **1 GB ≈ ~200 execuções** com mídia cheia. Tempo de guarda é a alavanca para liberar espaço (apaga só mídias).
- Decisão: limites **fixos no código** (padrão de mercado), não configuráveis por atividade/plano por enquanto.
- **Atividade tipo foto = exatamente 1 foto** (decisão fechada 2026-06-17). Múltiplas fotos só nas evidências de plano de ação (até 5).

## Catálogo (revisado 2026-06-20)
- Estrutura: `catalogos` (metadados, **por unidade**) → `catalogo_valores` (itens). Campo-chave + até 4 atributos. Cada valor: `valor_chave`, `atributo_1..4`, `imagem_url`.
- Na execução: atividade tipo catálogo → busca por texto/código, card com imagem + atributos. **Visibilidade por unidade** (qualquer membro da unidade vê) — confirmado correto.
- **Quem gerencia**: quem tem **permissão `catalogos`** (criar/editar/excluir) + admin de sistema/empresa. RLS de escrita por permissão adicionado em `20260620140000` (antes era só `is_admin_sistema` → gestor tomava erro silencioso). Vale p/ `catalogos` e `catalogo_valores`.
- **Excluir** (soft-delete `status='inativo'`): **bloqueia** se algum checklist **ativo** usa o catálogo (atividade com `config.catalogo_id`), listando os nomes — remover a referência antes. (2026-06-20)
- **Duplicar**: copia **estrutura + todos os valores** (cross-unidade remapeia `config.catalogo_id` quando vem do duplicar de checklist).
- **Integração via API**: aba "API" no modal — URL + headers(JSON); "Carregar campos" (`/catalogos/test-api`), mapeia campos→atributos, prévia, e "Sincronizar" (`/catalogos/{id}/sync`, upsert; aceita array ou `{data|items|results}`).
- **Sync automático (cron)**: `POST /catalogos/sync-all` sincroniza todos os catálogos com API configurada — **protegido por `x-cron-secret`** (2026-06-20). ⚠️ Requer um **agendador (Railway cron)** chamando o endpoint com o header; confirmar nas configs de ops.

## Padrão — validação combinatória (revisado 2026-06-22)
Atividade tipo `padrao`: validação **complexa** cujo valor de referência NÃO é fixo — depende da **combinação de variáveis** escolhida na execução. Caso de uso: linha de produção com vários modelos ao mesmo tempo (ex.: peso do biscoito depende de recheio + textura + formato).

**Modelagem (3 níveis):**
1. **Variáveis** (`/gestao/padrao/variaveis` → `variaveis` + `variavel_valores`, **por unidade**): atributos com seus valores possíveis (ex.: Formato → quadrado/redondo). Soft-delete (`ativo=false`).
2. **Padrão** (`/gestao/padrao/criar` → `padroes` + `padrao_variaveis` + `padrao_instancias` + `padrao_instancia_valores`, por unidade): nome + grupo/subgrupo opcional + quais variáveis o compõem + **instâncias**. Cada **instância** = uma combinação específica de valores (1 valor por variável) → **faixa esperada `valor_min`/`valor_max`** (valor único = min=max; pode ter só min OU só max). Validações na criação: combinação completa, faixa numérica, min≤max, combinações duplicadas bloqueadas. Edição **apaga e recria** variáveis+instâncias (não faz diff). Soft-delete.
3. **Atividade** referencia o padrão por `config.padrao_id`.

**Execução** (`CampoPadrao` em `operacao/[id]/page.tsx`): operador escolhe o valor de cada variável (selects) + digita o número medido → sistema acha a instância com a **combinação exata** e guarda `instancia_id`+`valor_min`+`valor_max` **junto da resposta** (resolve na hora; `calcularValidacao` compara sem reconsultar o banco). Combinação **sem instância** → aviso âmbar "sem valor de referência" e validação fica `null` (não dá pra aprovar/reprovar).

⚠️ **Achados da revisão (a corrigir):** nos saves de `VariavelModal.tsx` e `criar/page.tsx`, as escritas em tabelas filhas (`variavel_valores`, `padrao_variaveis`, `padrao_instancias`, `padrao_instancia_valores`) **não checam `error`** → RLS pode falhar em silêncio e ainda mostrar sucesso. Mensagens de erro expõem `error.message` cru (inconsistente com o padrão genérico das outras telas).

## WhatsApp (Evolution API)
- Integração via Evolution API **v2.3.7** (imagem `evoapicloud/evolution-api:v2.3.7` no Railway — atualizada em 2026-06-11; a org `atendai` no Docker Hub está desatualizada)
- Instância única: `checkflow` (Baileys)
- Config armazenada em localStorage (`checkflow_evo_config`), não no DB
- Status verificado a cada 5s via `POST /whatsapp/status`
- QR gerado via `POST /whatsapp/conectar` (proxy no Fastify)
- ⚠️ Histórico: v2.2.3 tinha bug de loop infinito de reconexão que impedia o QR de ser gerado (issue #2430 do EvolutionAPI, corrigido na v2.3.7) — NÃO fazer downgrade da imagem
- Env vars relevantes no serviço Evolution: `CONFIG_SESSION_PHONE_VERSION`; **Redis ATIVO** (`CACHE_REDIS_ENABLED=true`, `CACHE_REDIS_URI` = interna `redis.railway.internal:6379`, `CACHE_REDIS_PREFIX_KEY=checkflow`, `CACHE_REDIS_SAVE_INSTANCES=true`). ✅ **Verificado 2026-07-09**: chaves `checkflow:baileys:*` presentes no Redis (Database→Data) → sessão do WhatsApp **persiste** entre restarts (sem "sessão zumbi"/reler QR). Serviço Redis próprio no Railway (redis:8.2.1). Ver [[whatsapp-confiabilidade]].
- **Troca de número**: botão "Trocar número / Desconectar" em `/sistema/whatsapp` (com confirmação) faz logout da instância — sistema para de enviar até novo QR ser escaneado pelo número novo. Não mexe em env vars nem no banco
- Failover com 2 números: NÃO suportado hoje (instância única `EVO_INSTANCE`); avaliado em 2026-06-11, ficou para depois — exigiria `EVO_INSTANCE_BACKUP` + fallback em `lib/whatsapp.ts`

## Workflows
- ⛔ **DESABILITADO na UI desde 2026-06-18** (flag `WORKFLOWS_HABILITADO=false` em `apps/web/lib/features.ts`). Some do menu lateral, das telas `/gestao/workflows/*` (mostram "indisponível"), da seção "Workflows em andamento" na Operação, da opção em Agendamentos (criação + listagem) e do construtor de Perfis. Código e dados intactos — basta `true` para reativar tudo. Motivo: tema em estudo antes de publicar. **Não revisar/“fechar” esta tela enquanto a flag estiver off.**
- Pipeline de checklists com estágios **sequenciais** e execução **paralela dentro** de cada estágio
- Transversal à unidade — `workflows` pertence à `empresa_id`, execuções são por `unidade_id`
- Cada item de estágio tem `subgrupo_id` = quem executa a etapa. **Obrigatório ao publicar** (2026-06-18) — é o que define o setor responsável e a visibilidade por setor na Operação.
- Condição de avanço por estágio: `todos_aprovados` | `todos_concluidos` | `qualquer_aprovado`
- Motor 100% em Postgres: trigger em `checklist_execucoes` avança estágio automaticamente
- Status de workflow_execucoes: `em_andamento` → `concluido` (sucesso) | `bloqueado` (reprovado sem condição satisfeita) | `cancelado`
- **Vínculo execução↔workflow**: só quando o operador entra pelo card "Workflows em andamento" (`?wf_item=`); ao concluir, grava `checklist_execucao_id` no `workflow_item_execucoes` e o trigger avança. Executar o checklist **avulso NÃO conta** para o workflow.
- **Sequência entre setores** garantida pelo motor: só os itens do **estágio atual** ficam `liberado`; os próximos ficam `bloqueado` e nem aparecem até a condição do estágio ser satisfeita.
- **Operação (2026-06-18)**: "Workflows em andamento" mostra só os itens dos **subgrupos do operador** (admin vê todos); e os checklists que estão como item de workflow liberado **somem da lista avulsa** (evita a "porta dupla" de executar solto sem vincular).

## Agendamentos (recorrência) — revisado 2026-07-17
- Tela `/gestao/agendamentos`: cria disparos recorrentes de workflows ou checklists publicados (workflows da empresa; checklists da unidade ativa)
- Recorrência personalizada: a cada X horas/dias/meses, a partir de uma data/hora de referência (`referencia_inicio`)
- `proxima_execucao` calculada automaticamente em Postgres (trigger `agendamento_set_proxima`); processamento via `agendamentos_processar()`. **Disparo por HTTP** `POST /cron/agendamentos/processar` (cron-job.org, a cada ~10 min, header `x-cron-secret`) — o `pg_cron` do Supabase free é instável; ver `/ops`.
- **Sem catch-up**: se a referência está no passado, o sistema calcula o **próximo slot futuro** (não recupera disparos perdidos); dispara 1× quando vence e empurra a próxima pra frente.
- **Janela de geração (2026-07-16, migration `20260716140000`)** — opcional, por agendamento:
  - **Dias da semana permitidos** (`dias_semana smallint[]`, 0=domingo…6=sábado; null/vazio = todos). Chips no modal.
  - **Faixa de horário** (`hora_inicio`/`hora_fim smallint`; `hora_fim` é **EXCLUSIVA** — "das 8 às 18" = 08:00 até **17:59**). Fuso **America/Sao_Paulo**. Fora da janela o disparo **aguarda** (não avança `proxima_execucao`); ocorrências perdidas fora da janela colapsam num único disparo ao voltar.
- **"Não empilhar" (2026-07-17, migration `20260717120000`, `nao_empilhar boolean default false`)** — opção por agendamento (checkbox "Aguardar a resposta anterior antes de gerar a próxima"). **Padrão `false`** = cada slot gera sua própria ocorrência (**registra a não execução hora a hora**). Com `true`, o processamento só cria nova ocorrência de **checklist** se **não houver** pendente daquele agendamento (`em_andamento`, `executado_por` null) → evita acúmulo em "Agendados pendentes". Não se aplica a workflows.
- **Disparo**: workflow → `workflow_iniciar` (inicia o workflow, libera estágio 1). Checklist → cria `checklist_execucoes` como pendência da unidade (`executado_por` null + `agendamento_id`).
- **Visibilidade do agendado (2026-06-18)**: a pendência agendada de checklist aparece na Operação **só para operadores do subgrupo do checklist** (admin vê todas) — não mais para qualquer operador da unidade.
- **Agendado marcado não-executável (2026-07-16, `6c6f281`)**: ao abrir um agendado (`?exec=`) e marcar "Não foi possível executar", a **mesma linha** agendada vira `nao_executado` (reaproveita, não insere nova) → **sai de "Agendados pendentes"**. Antes ficava eterna (em_andamento/executado_por null).
- **Ativar/pausar, editar e excluir** pela própria tela (edição reabre o modal e recalcula `proxima_execucao`).
- **Permissão**: criar/editar/excluir exige a permissão `agendamentos` no perfil (RLS).
- **Listagem da Gestão por grupo (2026-06-18)**: gestor não-admin vê só os agendamentos dos seus subgrupos (`usuario_subgrupo`) — checklist pelo subgrupo do checklist; workflow pelos subgrupos dos itens. Admin vê todos.

## Motivo de Não Execução
- **Motivo padrão "Não disponível" (✅ 20260617160000)**: todo checklist deve ter SEMPRE ≥1 motivo de **cada tipo** (checklist e atividade). Há um motivo padrão "Não disponível" **por unidade** (grupo/subgrupo nulos → vale p/ todos os grupos). Um **trigger** (`checklist_seed_motivos_padrao` em `checklists` AFTER INSERT) associa o padrão dos 2 tipos a todo checklist novo não-template (inclui clonados de template); migration também aplicou **retroativo** aos existentes sem motivo. Helper `motivo_padrao_unidade(unidade, tipo)`. ⏳ Refinamento de UI pendente: mostrar/permitir remover o padrão no montador (com guard "≥1 por tipo") — hoje o padrão fica associado mas não aparece no seletor (filtrado por grupo).
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
- Cadastro em `/gestao/acessos/turnos`, dois tipos:
  - **Administrativo**: horário fixo configurável por dia da semana (ex: seg-sex 08-17h, sábado 08-11h — cada dia com sua própria janela)
  - **Escala**: ciclo rotativo trabalho/folga a partir de uma data de referência (ex: 12x36, 24x48 — calculado continuamente, sem precisar recadastrar)
- **Escopo por empresa** (não unidade): turno tem `empresa_id`; reusado entre unidades e vinculado ao **usuário**. É exceção deliberada à regra "toda tela = unidade ativa" — vale para as telas de Acessos em geral (são empresa-level).
- **Auto-seed ao criar empresa** (migration `20260701030000` + `20260701040000`): toda empresa nova recebe automaticamente 2 turnos padrão via trigger `trg_empresa_turnos_seed`:
  - "Administrativo" — seg-sex, 08:00–17:00
  - "12x36" — escala, data_referência 2026-01-01, hora_inicio 07:00, horas_trabalho=12, horas_folga=36 + 4 períodos (Turno 1/2/3/4, offsets 0/12/24/36h)
- Vínculo opcional (1 turno + 1 período por usuário) feito na edição do usuário em **Acessos → Usuários** (`UsuarioModal.tsx`) **e também** em **Grupos → Usuários → Editar** (`UsuariosGrupoModal.tsx` — gestores de grupo podem alterar). Campos: `usuarios.turno_id` + `usuarios.turno_periodo_id`
- **Períodos de escala** (`turno_periodos`): para turnos do tipo `escala`, o sistema computa automaticamente a quantidade de períodos com base em `(horas_trabalho + horas_folga) / horas_trabalho` (ex: 12x36 → 4 períodos). O gestor nomeia cada período (ex: "Turno A", "Turno B"). Cada período tem `offset_horas = i * horas_trabalho` — desloca o zero-point do ciclo para a equipe. `usuario_esta_no_turno()` aplica o offset do período atribuído ao cálculo do ciclo.
- **Proteção ao reduzir períodos**: ao editar um turno escala com mudança de `horas_trabalho` ou `horas_folga` que resulte em menos períodos que antes, o sistema detecta quantos usuários estão em períodos que serão removidos, exibe diálogo de confirmação ("X usuários perderão o período mas manterão o turno") e, se confirmado, faz `UPDATE usuarios SET turno_periodo_id = null` para os afetados antes de deletar/recriar os períodos.
- **Modo fora do turno** (revisado 2026-06-22) — coluna `turnos.modo_fora_turno`, escolha única de 3 (default `notificacao`):
  - `notificacao` (padrão, = comportamento histórico): fora do horário **não recebe WhatsApp** de moderação; acessa e usa normal. (e-mail sempre é enviado)
  - `login`: fora do horário **não consegue logar** (checado no login após `signInWithPassword` via RPC `usuario_pode_acessar`; bloqueado → `signOut` + aviso). **Quem já está logado continua** — não derruba sessão. **Isentos: admin de sistema e admin da empresa.** Notificações seguem normais.
  - `aviso`: fora do horário mostra **banner dispensável** ("Você está fora do seu horário de turno.", `components/layout/AvisoTurno.tsx` nos layouts gestão+operação, dispensa em sessionStorage); não bloqueia nada.
  - Cada modo faz **exatamente uma** coisa (mutuamente exclusivos). Funções SQL: `usuario_recebe_notificacao`, `usuario_pode_acessar`, `usuario_deve_avisar_turno` (migration `20260622120000`).
- Usuário sem turno (ou turno inativo) nunca é restringido
- Notificação aplica-se tanto a moderadores N1 quanto N2
- ⏳ **Pendência — férias**: ao revisar o módulo de notificações, implementar `ferias_inicio`/`ferias_fim` por usuário; usuário em férias não recebe nenhuma notificação (similar ao check de `usuario_esta_no_turno`)

## Workflow + Checklist: regras de integridade
- Não é possível inativar um checklist em uso por workflow `publicado` (trigger bloqueia com exceção)
- Quem cria workflows pode usar checklists de outros grupos/subgrupos — picker tem seletor de Grupo + Subgrupo, pré-selecionado com o grupo/subgrupo atual do usuário

## Perfis — flag "público"
- **Perfis criados automaticamente por empresa:** além dos perfis de **SISTEMA** globais (`Admin da empresa` `…002`, `Operação` `…003`, `Admin de sistema` `…001` — `empresa_id null`, `is_system=true`, não editáveis), toda empresa nova ganha um perfil **PER-EMPRESA "Gestão do Grupo"** (`is_system=false`, `publico=false`, `empresa_id` da empresa — **editável/excluível** pelo admin da empresa). 28 permissões de gestão de área (grupos/subgrupos, agendamentos, catálogos, documentos, causa raiz, não execução, tickets). Criado por `seed_perfil_gestao_grupo` + trigger `trg_empresa_gestao_grupo_seed` (migration `20260630130000`, espelha o perfil de referência da QA Smoke). Ver `/db`.
- **Admin de sistema oculto na tela de Perfis do admin de empresa** (2026-07-01): a query da listagem de perfis em `/gestao/acessos/perfis` filtra `.neq('id', '00000000-0000-0000-0000-000000000001')` para admin de empresa — o perfil "Admin de sistema" nunca aparece (não é gerenciável por ele).
- **Bug de permissões corrigido** (migration `20260701020000`): a foundation seed usava `acao = 'deletar'` mas o frontend usava `acao = 'excluir'` → todos os checkboxes "Excluir" de grupos/subgrupos/usuários/perfis chegavam sempre desmarcados ao salvar. Corrigido por rename no DB. Também faltavam as permissões `checklists.*` (criar/editar/excluir/configuracoes/duplicar) no catálogo — adicionadas na mesma migration.
- **Contagem de usuários no card de perfil**: UI minimalista — texto simples "N usuários" (ou "sem usuários" em cinza claro), sem stack de avatares.
- **Menu lateral por permissão** (2026-06-30, commit `82774d1`): o Sidebar da gestão **só mostra o que o perfil libera** — cada item mapeia um `recurso` (ou é admin-only); admin da empresa/sistema vê tudo; Home/Planos de Ação/Indicadores são sempre visíveis (sem permissão de perfil). É **UX** (esconder seção não-usada), não segurança — a barreira real é RLS + checagem de permissão nas ações. `indicadores`/`relatorios` foram **removidos do construtor** (não tinham enforcement; ver `/db`). "Relatórios"/"Dashboards" no menu = páginas **planejadas** (hoje 404).
- `perfis.publico` (boolean): determina quem pode atribuir aquele perfil a um usuário
  - **Público** = pode ser atribuído por quem gerencia usuários do próprio grupo/setor (ex: substituição temporária de um líder de férias, sem precisar do admin da empresa)
  - **Não público** = só pode ser atribuído pelo Administrador da empresa
- ✅ Reforçado em DB via trigger `trg_validar_troca_perfil` — bloqueia atribuir perfil não-público se quem faz não for Admin da empresa/sistema, mesmo via chamada direta à API. **Vale em INSERT e UPDATE** (migration 20260622140000 ampliou do UPDATE-only original 20260607100800). Bypass quando `auth.uid()` é null (service-role da API de criação é confiável).
- ✅ Aplicado em `UsuarioModal.tsx`: verifica o `perfil_id` de quem está editando em `usuario_empresa` — se for "Admin da empresa" (`00000000-0000-0000-0000-000000000002`) ou "Admin de sistema" (`...001`), vê todos os perfis; caso contrário, só vê perfis `publico = true` (+ o perfil atual do usuário sendo editado, para não escondê-lo)

## Usuário em múltiplas empresas (perfil por empresa)
- A **mesma pessoa** (1 linha em `usuarios`, login por **CPF** único) pode pertencer a **várias empresas**, com **`perfil_id` próprio em cada** (`usuario_empresa`). Unidades também são por empresa (`usuario_unidade`).
- **Vincular pessoa existente** (2026-06-22): em "Adicionar usuário" (`UsuarioModal`), ao sair do campo CPF (`onBlur`) chama a RPC `buscar_pessoa_por_cpf` (só admin sistema/empresa). Se o CPF já existe, entra em **modo vínculo**: nome/e-mail/telefone ficam read-only (dados pessoais não mudam), banner avisa, botão vira "Vincular à empresa".
- `/api/usuarios/criar`: se o CPF já existe, **vincula** (insert `usuario_empresa` + `usuario_unidade`) em vez de recriar — **não** cria auth user, **não** envia OTP de primeiro acesso, **não** altera senha. Se já estiver nesta empresa → 409 "já está cadastrada nesta empresa". Antes (bug): o fluxo só sabia criar do zero e batia na unicidade do CPF.

## Tickets / Chamados

### Abertura
- Qualquer usuário autenticado pode abrir um ticket
- Pode ser aberto de **`/operacao`** (FAB "Abrir Ticket" — avulso, sem vínculo) ou de **`/gestao/tickets`** (listagem)
- **Grupo + subgrupo são obrigatórios** — destino do chamado
- Categoria é opcional — fallback automático para "Sem categoria" (criada por `garantir_categoria_generica()`)
- `execucao_id` registra origem quando aberto dentro de uma execução (campo opcional)

### Fluxo de Status (revisado 2026-07-05)
```
aberto → em_tratamento (aceite) → aguardando_informacao ↔ em_tratamento
       → corrigido | nao_corrigido (responsável conclui direto)
       → cancelado (a qualquer momento)
       → aberto (reabertura pelo abridor)
```
- `corrigido_parcialmente`/`improcedente`/`aguardando_validacao` seguem no enum mas **NÃO são oferecidos** (fluxo antigo/histórico).
- Qualquer membro do grupo/subgrupo destino pode assumir (virar assignee)
- **Assumir não exige observação** (um toque); as demais ações exigem **texto obrigatório** + evidências opcionais
- Timeline de eventos é **imutável** (blocked por CREATE RULE). `ticket_eventos.autor_id` e `.uploaded_by`/evidência agora sempre preenchidos pelo cliente (eram bugs de NOT NULL).

### Visibilidade (✅ 20260614060000)
- Ticket **sem assignee**: visível para todos os membros da unidade (`usuario_unidade`)
- Ticket **com assignee**: visível apenas para `assignee_id`, `aberto_por_id` e `is_admin_sistema()` — some da lista dos demais
- Policy `tickets_leitura` reflete essa regra

### Devolução
- Assignee solicita informação ao abridor (`aguardando_informacao`)
- Sem deadline — tempo por participante é rastreado via eventos
- Abridor responde → volta para `em_tratamento`

### Transferência (✅ 20260614060000; operação + atribuição em 2026-07-05)
- Assignee em `em_tratamento` pode transferir para outro grupo/subgrupo da MESMA unidade — disponível na **gestão E na operação**.
- Ao transferir SEM atribuir a alguém: `grupo_id`/`subgrupo_id` mudam, `assignee_id` → `null`, `status` → `aberto` (novo destino assume). ⚠️ notifica só o abridor (não o subgrupo novo) — melhoria pendente.
- Ao transferir COM **"Atribuir a"** um usuário do subgrupo: `assignee_id` = usuário, `status` = `em_tratamento`; a notificação de `transferencia` chega direto nele.
- Evento `transferencia` registra `meta: {de:{grupo,subgrupo}, para:{grupo,subgrupo,usuario}}` + observação obrigatória.
- **RLS `tickets_atualizar`** ganhou `WITH CHECK` (mesma unidade) em `20260703030000` — sem isso, reatribuir para outro assignee barrava operador não-abridor (USING virava check da linha nova).

### SLA
- Configurável por categoria + prioridade em `/gestao/tickets/sla`
- Pausa acumula em `sla_segundos_pausados` enquanto status = `aguardando_informacao`
- Semáforo visual: >50% restante = verde, 10–50% = amarelo, <10% ou vencido = vermelho

### Notificações
- Abertura → todos do subgrupo destino (turno respeitado para WA)
- Qualquer movimentação → abridor + assignee (menos o ator)
- **Link por perfil** (2026-07-05): cada destinatário recebe link para `/operacao/tickets/[id]` (operador puro) ou `/gestao/tickets/[id]` (demais).
- Fluxo completo: `notificarTicket()` (cliente, fire-and-forget) → `POST /tickets/notificar` (API decide destinatários por evento, turno, template da empresa, WA+email).

### Permissões (`recurso = 'ticket'`)
| Ação | Descrição |
|------|-----------|
| `ver` | Visualizar tickets |
| `criar` | Abrir novos tickets |
| `tratar` | Assumir e tratar tickets |
| `cancelar` | Cancelar / marcar improcedente |
| `categorias_gerir` | Gerenciar categorias de tickets |

## Planos de Ação — moderação N1/N2 (revisado 2026-06-20)
- **Origem**: PA é aberto **automaticamente** quando uma execução tem atividade **não conforme** marcada para gerar plano. Nasce em `em_moderacao_n1`. **Por enquanto NÃO há abertura manual** (sem não-conformidade não há PA).
- **Visibilidade da listagem**: só vê o plano quem **o abriu** (`criado_por`) **OU** quem **pertence ao grupo/subgrupo de resolução** (`planos_acao.subgrupo_id` = subgrupo do checklist). Admin vê todos. Filtro client-side via `visivelPorSubgrupo` + `criado_por === user.id` (`lib/visibilidade.ts`). Antes só filtrava por status (confiava só no RLS) — **corrigido**.
- **Ordenação da lista**: seletor "Mais antigos primeiro" (default) / "Mais recentes primeiro" (por `created_at`).
- **SLA arquivado por enquanto** (decisão 2026-06-20): removidas as tags de SLA da lista e do detalhe. `sla_prazo` ainda existe no banco mas não é exibido. Retomar quando o tema de SLA for definido.
- Funções do usuário no plano (`usuario_subgrupo.funcao`, valores **minúsculos** `operacao`/`nivel_1`/`nivel_2`/null): **admin = N2**. N1/N2 são camadas de moderação, não pessoas fixas — **N1 e N2 também executam checklist**, além de moderar.
- **⚠️ Moderar exige perfil com acesso à Gestão** (2026-07-05): a moderação vive em `/gestao/planos-acao/[id]`; perfil **Operação puro (…003) não acessa a Gestão** → só vê o acompanhamento read-only em `/operacao/plano/[id]`. Por isso a tela de **Funções** (`grupos/[id]/subgrupos`) **bloqueia marcar N1/N2 em usuário com perfil Operação** (aviso: precisa de perfil com acesso à Gestão, ex. "Gestão do Grupo"). Decisão: resolver na origem (bloqueio no seletor) em vez de portar moderação para a operação — não mexe no fluxo testado.
- Estados: `em_moderacao_n1` → `em_moderacao_n2` (se escalado) → `corrigido` | `nao_corrigido` (terminais).
- Ações por papel/estado (`gestao/planos-acao/[id]/page.tsx` → `botoesDisponiveis`):
  - `em_moderacao_n1` + (N1/N2/admin): `corrigido`, `nao_corrigido`, `enviado_n2` (escala)
  - `em_moderacao_n2` + (N2/admin): `corrigido`, `nao_corrigido`, `devolvido_n1`
  - terminal + N1: `reaberto` (→ `em_moderacao_n1`) — **N1 pode reabrir mesmo o que o N2 fechou** (decisão confirmada).
- **Fallback sem N2**: o gestor do grupo deveria ser N2; se o subgrupo **não tem nenhum** `nivel_2`, o botão "Enviar para N2" fica **desabilitado** com aviso ("Não existe um moderador N2 configurado para o subgrupo X"). Contagem via `usuario_subgrupo` count `funcao='nivel_2'`.
- Cada movimentação exige **observação obrigatória** + evidências opcionais (fotos/vídeos em `plano_acao_movimentacao_evidencias`).
- **Causa raiz é análise da MODERAÇÃO, não da abertura** (2026-07-05): o plano nasce automático (operador só reporta — sem campo de causa na abertura). Quem escolhe/cria a causa raiz é o moderador (N1/N2) **enquanto o plano está em moderação**. Depois de **concluído** (corrigido/nao_corrigido) o editor de causa raiz é **omitido** (só mostra a causa registrada, read-only) — `podeEditar` gateado por status em `gestao/planos-acao/[id]`. Corrigido também no texto da ajuda (`app/api/ajuda/route.ts`).
- **Notificações (WhatsApp/Email, respeita turno)**: abertura → **N1** do subgrupo; `enviado_n2` → **N2**; `devolvido_n1` → **N1**. Todos têm **template configurável** desde 2026-07-08 (`plano_devolvido_n1` adicionado; antes era hardcoded). Ver tabela de destinatários abaixo.

## Templates de Notificação

- Cada empresa tem **13 templates** padrão (2026-07-08): 6 tipos × 2 canais + `tarefa_publicada` só WhatsApp.
  - **Tipos**: `ticket_aberto`, `ticket_movimentado`, `plano_aberto`, `plano_enviado_n2`, `plano_devolvido_n1` (N2→N1), `reset_senha` — todos WhatsApp+email; **`tarefa_publicada`** (nova lista de tarefas) — **só WhatsApp** (sem canal email; a UI oculta o editor de email via `SO_WHATSAPP`).
- Seed automático ao criar nova empresa (trigger `trg_empresa_notif_seed` chama `seed_notificacao_templates` + `seed_notificacao_templates_extra`)
- Admin pode editar corpo, assunto (email), e desabilitar canal por tipo. Template **desativado não dispara** (nem plano nem tarefa).
- Interpolação com `{{variavel}}` — variáveis disponíveis por tipo documentadas na UI
- Fallback: se template não encontrado no banco → usa mensagem hardcoded na API
- Gerenciado em `/gestao/configuracoes/notificacoes`
- **Canal PUSH / Web Push (2026-07-17)**: além de WhatsApp/e-mail, os eventos de **ticket** (aberto/movimentado), **plano** (aberto/enviado_n2/devolvido_n1) e **tarefa** (publicada) disparam **push** para quem tem o PWA com notificação **ativada**. É canal **complementar** (não substitui), mesmos destinatários e mesma régua de **férias/turno**. Requer **aceite do usuário** (regra do navegador — 1 toque, uma vez por aparelho); ativado pelo card no login (`PushOptIn`), pelo sino no cabeçalho (`PushBell`) ou em Configurações→Notificações (`PushToggle`). A inscrição é por aparelho e **se reassocia ao usuário logado** ao abrir o app. Sem push ativo, a pessoa recebe pelos outros canais, como antes. Tabela `push_subscriptions` (ver `/db`); envio na API (`enviarPush`); envs VAPID (ver `/ops`). Detalhes: [[feature-web-push]].
- **Foto de evidência na abertura (2026-07-09)**: quando um **plano de ação** ou **ticket** é aberto com evidência fotográfica, a **1ª foto** vai **na própria mensagem** — WhatsApp via `enviarWhatsAppMidia` (já existia) e **email** via `buildEmailHtml` (agora inclui `<img>` no caminho com template — antes só o fallback tinha). O destinatário (N1/assignee) já tem contexto antes de abrir o link. Só na abertura (`aberto`); movimentações não reanexam.

### Regra de destinatários por evento
| Evento | Destinatários |
|--------|--------------|
| `ticket_aberto` | Todos do subgrupo destino |
| `ticket_movimentado` | Abridor + assignee |
| `plano_aberto` | **Apenas N1** do subgrupo |
| `plano_enviado_n2` | **Apenas N2** do subgrupo |
| `plano_devolvido_n1` | **Apenas N1** do subgrupo (N2 devolveu) |
| `tarefa_publicada` | Membros dos subgrupos (ou grupos) da lista — **só WhatsApp**, respeita turno |
| `reset_senha` | O próprio usuário (WA + email) |

## Provisionamento de Usuários (sem autocadastro)
- Não há cadastro livre — todo usuário é criado por um admin (sistema/empresa) ou gestor de grupo, individualmente, em lote (CSV) ou via sincronização API
- **Login é somente por CPF** (tela `/login` não tem mais opção de e-mail)
- `cpf` (11 dígitos) e `telefone` (DDD + número, WhatsApp) são **obrigatórios** em qualquer via de cadastro — validados em `UsuarioModal`, `ImportarUsuariosModal` e nas rotas `/api/usuarios/criar` e `/api/usuarios/importar`
- `email` é opcional; se não informado, gera-se um e-mail técnico não-entregável (`<cpf>@checkflow.local`) só para satisfazer `auth.users`
- Telefone é único no sistema (`usuarios_telefone_key`) — é o canal garantido para reset/recuperação de senha via WhatsApp
- Usuários legados sem cpf/telefone aparecem na view `usuarios_sem_contato` (ver `/queries`) — precisam ser completados antes de poder fazer login por CPF ou receber reset por WhatsApp

## Login por Código (OTP) — Recuperação, Reset Admin e Primeiro Acesso
Implementado em 2026-06-10 (Fases 2-6 da estratégia de login). Tudo baseado em `password_reset_tokens` (ver `/db`) + envio via `apps/api` `/whatsapp/enviar-codigo` (WhatsApp + e-mail, template `reset_senha` com `{{codigo}}`).

- **Primeiro acesso**: ao criar usuário (`/api/usuarios/criar`) ou importar (`/api/usuarios/importar`), gera-se automaticamente um código `primeiro_acesso` e dispara por WhatsApp (+ e-mail se houver). Usuário acessa `/primeiro-acesso`, informa CPF + código → recebe um token de sessão → `/nova-senha` define a senha (marca `primeiro_acesso = false`)
- **Self-service ("esqueci minha senha")**: `/recuperar-senha` (CPF → código → `/nova-senha`). Resposta sempre genérica (`/api/auth/solicitar-codigo`) para não revelar se o CPF existe. Limite: 3 solicitações/hora por usuário
- **Reset disparado por gestor** (revisado 2026-07-01): botão "Resetar senha" (ícone chave) em `/gestao/acessos/usuarios`, chama `/api/usuarios/resetar-senha`. Gera token `sessao_senha` (TTL 24h) e envia **link direto** `/nova-senha?t=TOKEN&uid=ID` por WhatsApp/e-mail — o usuário clica e define a nova senha sem precisar digitar CPF nem código OTP. A `/nova-senha` detecta `?t+uid` na URL e pula a etapa de verificação. ⚠️ Não confundir com self-service (que ainda usa CPF → OTP → nova senha).
- Fluxo de verificação: `/api/auth/definir-senha` aceita `{ uid, token }` (reset admin, direto) além de `{ cpf, token }` (self-service). Token de sessão único (`sessao_senha`) consumido em ambos os casos.
- Código OTP ainda existe apenas para **self-service** e **primeiro acesso** — reset pelo admin é exclusivamente magic link desde 2026-07-01.
- Código/link expiram em 15 min (OTP) / 24h (magic link); máx. 5 tentativas por código OTP.
- Pré-requisito: usuário precisa ter `telefone` cadastrado (ver provisionamento) — sem telefone, reset/primeiro acesso não funcionam

## Onboarding Contextual
- Cada tela de `/gestao` e `/sistema` tem um card de onboarding (registry em `apps/web/components/onboarding/registry.ts`), com atalho "?" no canto inferior direito (oculto em mobile)
- Conteúdo e visibilidade são controláveis pelo admin do sistema em `/sistema/onboarding` (tabela `onboarding_paginas`: `ativo`, `cards_override`)
- **Regra de evolução**: toda tela/funcionalidade nova precisa (1) entrada no `registry.ts`, (2) renderizar `<Onboarding pageId=... />`, (3) insert em `onboarding_paginas`, (4) entrada correspondente em `permissoes.ts` — ver `/uimap` e `/db`

## Programa de Parceiros (indicação)
- Toda `empresa` pode ter um `parceiro` vinculado (`empresas.parceiro_id`) + `parceiro_percentual` (% sobre `valor_mensalidade`)
- Um parceiro pode estar vinculado a várias empresas — busca por e-mail evita duplicar cadastro (`ParceiroModal`)
- **E-mail de boas-vindas**: disparado uma única vez, no primeiro vínculo do parceiro (idempotente via `parceiros.email_boasvindas_enviado_em` + `parceiro_emails_log`)
- **Resumo mensal** (último dia do mês, idempotente por `parceiro_id+'resumo_mensal'+'YYYY-MM'`): lista, por empresa vinculada, plano + valor da mensalidade + comissão estimada (`valor_mensalidade × percentual / 100`, só para empresas `status='ativo'`); soma o total estimado; e informa quais empresas ficaram `inativo` no mês (via `empresa_status_eventos`)
- Comissão é uma **projeção/estimativa** — reconciliação financeira real é fase futura (a implementar)
- Gestão: aba "Parceiro" em `/sistema/empresas/[id]` (vínculo + percentual) e listagem geral em `/sistema/parceiros`
- Disparo do resumo mensal depende de scheduler externo chamando `/cron/parceiros/resumo-mensal` (ver `/ops`) — ainda não configurado

## Planos & Cobrança (Billing) — em construção

Modelo: **freemium + usage-based híbrido**, padrão SaaS de mercado, com gateway **Asaas**.

**Catálogo (Fase 1 — ✅ implementado, migration 20260615140000 ⏳ aplicar):**
- `planos` (admin `/sistema/planos`): tipos `trial` (`dias_trial` **configurável**), `pago` (ciclo mensal/anual) e `cortesia` (beneficente — "pago que não paga", sempre ativo). ⚠️ **`gratuito` DESCONTINUADO (2026-07-13)** — some do editor (só aparece em plano legado desse tipo); não é mais fallback pós-trial. Limites: execuções/mês, armazenamento total (bytes), tokens IA/mês — **NULL = ilimitado** (⚠️ em branco no editor = ilimitado, não zero). Usuários sempre ilimitados (não é métrica de cobrança). Flags de visibilidade: `ativo` (existe no catálogo), `selecionavel_empresa` (auto-serviço), `padrao` (default de empresa nova, 1 só).
- `pacotes_adicionais` (admin `/sistema/pacotes`): compra avulsa de `execucoes`, `tokens_ia` (saldo do período, **use ou perde**) ou `armazenamento` (capacidade **permanente**).

**Assinatura & enforcement (Fase 2A — ✅ migration 20260615160000):**
- `empresa_assinaturas` (snapshot dos termos + contadores mensais). Admin do sistema atribui/troca plano na aba **"Plano"** de `/sistema/empresas/[id]` (componente `AssinaturaEmpresa`): snapshot imediato, reinício de trial confirmado, barras de uso via `billing_status`.
- Bloqueios ativos: nova execução na Operação (`billing_pode_executar`), Consulta IA → 402 (`billing_pode_consumir_ia`), upload por capacidade de storage (`billing_armazenamento_disponivel`). Execução agendada não é re-bloqueada.
- **Freio de storage — TODOS os caminhos de upload (2026-07-19)**: o bloqueio por capacidade passou a cobrir os 6 caminhos de mídia. Antes só **execução de checklist** e **tarefas** checavam antes de subir; **evidência de ticket** (abertura + ação, gestão e operação), **evidência de plano de ação** e **imagem de etapa de documento** apenas contabilizavam o consumo, deixando a empresa estourar o teto em silêncio. Helper único `armazenamentoDisponivel(sb, empresaId, bytes)` + `somaBytes(lote)` em `lib/uso.ts` (fail-open: sem empresa/bytes ou erro na RPC → libera; só `false` explícito bloqueia). Checa o **lote inteiro de uma vez, ANTES de criar o registro** (ticket/movimentação/etapa) — evita registro órfão sem a evidência. Mensagem única `MSG_ARMAZENAMENTO_CHEIO`. Coberto por `tests/unit/lib/uso.unit.test.ts`.
- Painel do admin da empresa (self-service de plano/uso) **deferido para a Fase 3** (junto com checkout Asaas).

**Regras de uso (Fases 2-4 — pendentes):**
- **Período** ancorado no aniversário da assinatura (não no calendário). Allowance reseta a cada período — **sem rollover**.
- **Enforcement** não é tempo real (contador por período; pequeno excedente tolerado). Limite excedido **bloqueia** a ação (nova execução / Consulta IA / upload), com upsell.
- **Consumo** base→pacote: usa o limite do plano primeiro, depois o saldo de pacote.
- **Armazenamento** = capacidade fixa (plano + pacotes permanentes); uso **sempre real** (a limpeza por tempo de guarda abate bytes via entrada negativa em `uso_armazenamento`). Tempo de guarda é a alavanca de espaço.
- **Fim do trial → SOMENTE-LEITURA PERMANENTE (2026-07-13, migration `20260713140000`)**: acabou o trial e a empresa não contratou pago/cortesia → fase `carencia` **para sempre** (não existe mais fallback "cai no gratuito" nem corte de acesso total "bloqueada"). Consulta e operação (executar o publicado, tratar ticket aberto) seguem; **bloqueia só a CRIAÇÃO** de itens operacionais: checklists, tarefa_listas, tickets, **agendamentos, workflows** (RESTRICTIVE insert via `empresa_pode_criar`; config como grupos/usuários/perfis/documentos **não** é bloqueada — admin regulariza). `empresa_fase_assinatura`: `pago`/`cortesia` sempre `ativa`; trial vencido → `carencia`. `AssinaturaGate` mostra banner de somente-leitura (sem tela cheia de bloqueio). `ja_usou_trial` evita re-trial. **UI de pré-bloqueio (2026-07-20)**: as telas de criação mostram o botão **desabilitado + `MSG_CRIACAO_BLOQUEADA`** na carência (padrão `!podeCriarConteudo(faseAssinatura)`) — cobre checklists/tarefas/agendamentos/workflows, o FAB de ticket na Operação, e (corrigido) **Gestão → Novo Ticket**, **Relatórios → +Novo** e **Home → Gerar relatório** (antes esses 3 mostravam botão ativo e batiam na RLS com erro genérico). A barreira real segue na RLS/rota; isto é só o aviso amigável. ⚠️ Corrigido junto: `avancar_periodo_assinatura` **zerava o `trial_fim`** ao expirar (devolvia p/ `ativa`, bloqueio nem valia) — agora preserva. ⏳ Pendente: alerta e-mail/WhatsApp ao admin 5d e 1d antes do fim do trial + disclaimer na Home com dias restantes (ver [[pendencia-avisos-fim-trial]]).
- **1ª contratação de pago → ATIVA SÓ NO PAGAMENTO (2026-07-20, migration `20260720180000`)**: ao "Assinar" um plano pago vindo de trial/carência, o `/billing/assinar` cria a assinatura+fatura no Asaas mas **NÃO ativa** — grava `empresa_assinaturas.pendente_plano_id` e a empresa **mantém o acesso atual** (trial/carência) até pagar. O **webhook** (`PAYMENT_CONFIRMED/RECEIVED`) aplica o snapshot do plano (limites + `status='ativo'`) e limpa `pendente_plano_id`. Evita "usar sem pagar". A UI (`/gestao/plano`) não marca "Plano atual" antes do pagamento; toast/confirm dizem "ativado após o pagamento". (Antes: ativava no ato.) ⚠️ Pagamento recorrente confirmado também garante `ativo` (recupera de `inadimplente`). Diagnóstico do ambiente Asaas: `GET /health` → `asaas_env`.
- **Estado "Aguardando pagamento" + trocar forma (2026-07-20):** enquanto `pendente_plano_id ≠ null`, a tela mostra banner *"Aguardando pagamento do plano X"* com **Reabrir fatura** + **"Cancelar / trocar forma de pagamento"**. O cancelar chama `POST /billing/cancelar-pendente` (cancela a assinatura no Asaas + apaga cobranças não pagas + limpa `pendente_plano_id`/`asaas_subscription_id`), e a empresa pode assinar de novo com outra forma. Resolve o "escolheu cartão, quer PIX". **Enquanto há pendência, os botões "Assinar" de TODOS os planos ficam DESABILITADOS** (rótulo "Aguardando pagamento…") — o cliente precisa pagar ou cancelar antes de assinar de novo. Formas de pagamento: **só PIX e Cartão** (boleto removido); o modal de confirmação mostra a forma escolhida.
- **Troca de plano** (✅ implementado): **toda troca entre planos pagos vale só no FIM do período vigente** (sem pro-rata) — grava `proximo_plano_id` + `troca_efetiva_em = periodo_fim`; `avancar_periodo_assinatura` aplica o snapshot na virada. No Asaas: pago→pago faz `PUT` na assinatura (`updatePendingPayments:false`, novo valor só na próxima cobrança); pago→gratuito cancela a assinatura (sem cobranças futuras, mantém limites até a virada). **1ª contratação de pago (vindo de trial/gratuito) é imediata.** Pacotes comprados sobrevivem à troca; downgrade de storage abaixo do ocupado bloqueia novos uploads (não apaga dado). ⚠️ Limitação conhecida: para ciclo anual, o snapshot troca na virada mensal de uso (revisar se planos anuais virarem comuns).
- **Cancelamento de assinatura ativa (2026-07-20, migration `20260720190000`)**: `POST /billing/cancelar` (link "Cancelar assinatura" no card do plano em `/gestao/plano`). Para as cobranças futuras no Asaas **na hora**, mas o acesso segue até o **fim do período já pago** (`empresa_assinaturas.cancelar_em = periodo_fim`). Na virada, `avancar_periodo_assinatura` efetiva → `status='cancelado'` e `empresa_fase_assinatura` passa a retornar **`carencia`** (somente leitura) para status cancelado. **Reversível** enquanto não virou: `POST /billing/reativar` recria a assinatura no Asaas com a 1ª cobrança só no `periodo_fim` (sem cobrar de novo agora) — banner "Assinatura cancelada — acesso até X" + botão "Reativar". Enquanto cancelamento agendado, os botões "Assinar" ficam desabilitados. Re-assinar depois de virar carência = 1ª contratação normal (pendente→pago).
- **Snapshot**: assinatura congela preço+limites do plano; editar o catálogo não afeta quem já assinou.
- **Split de parceiro** via subconta Asaas (criada automaticamente): trocar parceiro recalcula %; remover parceiro → 100% CheckFlow.
- Tiers fixos públicos (planos negociados/custom só para casos enterprise).

## Exclusão Definitiva de Empresa
- Apenas empresas com `status = 'inativo'` podem ser excluídas, e somente por `is_admin_sistema()` — validado na RPC `excluir_empresa_cascata`
- Apaga em cascata: unidades, grupos, usuários vinculados, checklists, execuções, planos de ação, tickets, workflows
- **Inativar antes**: a "Zona de perigo" só aparece com `status='inativo'`. O status muda em Configurações → seletor → **Salvar configurações**. Fix 2026-07-18: o salvar agora **reflete na UI na hora** (selo + Zona de perigo) e usa `.select()` para detectar **update barrado por RLS (0 linhas, que o Supabase NÃO sinaliza como erro)** — antes "salvava" sem mudar nada.
- Ação **proposital não-trivial**: na tela `/sistema/empresas/[id]` (aba Configurações), exige digitar o nome exato da empresa + marcar checkbox de ciência antes de habilitar o botão — evita exclusão acidental.
- ✅ **Apaga também os ARQUIVOS do storage**: rota service-role `POST /api/empresas/[id]/excluir` (só admin de sistema, empresa inativa) — enumera os IDs via unidade→empresa e remove os objetos dos buckets `execucoes` (`{exec}/`, **`pdfs/{exec}.pdf`** (2026-07-18), `tarefas/`, `tickets/`, `planos/`) e `empresas` (`etapas/`, `documentos/`, `catalogos/`, logo) **antes** do cascade; depois chama a RPC `excluir_empresa_cascata` (via JWT do admin). Best-effort (falha de arquivo não aborta o delete). `ExcluirEmpresaModal` chama a rota. Migration do cascade: `20260610040000_excluir_empresa_cascata.sql` (**está no repo**).
- 🔎 **Verificação (dry-run, 2026-07-18)**: a rota aceita `?dryRun=1` — enumera e devolve `arquivos_a_remover` + contagem de linhas por tabela, **sem apagar nada nem rodar o cascade**. No modal, botão **"Verificar (ver o que será apagado)"** mostra a prévia. Leve (contagens + `list()` do storage, sob demanda, só admin).
- Irreversível — sem soft delete/recuperação. Testar sempre numa empresa descartável (NUNCA a QA Smoke).

## Regras de Negócio Críticas
- RLS obrigatório em todas as tabelas de dados de usuário
- Checklist publicado não pode ter sua estrutura mutada
- Operação não tem sidebar — layout separado em `operacao/layout.tsx`
- Executor não pode digitar localização — apenas GPS automático
- Vídeo da galeria com >1h recebe alerta visível (anti-fraude)
- QR scanner (BarcodeDetector API) só funciona no Chrome Android — exibe erro claro em outros browsers

## Evolution Rule
When a new product rule is consolidated, append it as a short bullet under the relevant section.
