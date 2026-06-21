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
**Decisões fechadas na implementação**: janela de edição = `edicao_janela_horas` a partir da abertura da instância (null = até encerrar), com countdown na execução; 1 instância por pessoa por lista (`unique(lista_id,usuario_id)`); flags **por tarefa** (observação/evidência/checkin); mídia no bucket `execucoes` sob `tarefas/{execId}/` (conta na cota: `registrarUsoArmazenamento(..., 'tarefa', ...)` + bloqueio por `billing_armazenamento_disponivel` antes do upload — migration `20260618160000`); **check-in tolerante** (se GPS indisponível/negado, conclui mesmo assim como "sem localização", lat/lng null); notificar WhatsApp = flag `notificar_whatsapp` (toggle, default off) — **wired 2026-06-18**: ao publicar com a flag, o web chama `POST /tarefas/notificar` (apps/api, `routes/tarefas.ts`) que envia WhatsApp aos membros dos subgrupos atribuídos (ou dos grupos, se não houver subgrupo), respeitando o turno (`usuario_esta_no_turno`). Fire-and-forget, não bloqueia a publicação. Quota de armazenamento das mídias de tarefa **ainda não contabilizada** (pendência).
Espec original abaixo (mantida como referência):
- **Conceito**: existe um **modelo de lista** (título + N tarefas/itens "to-do") distribuído a **1+ grupos e 1+ subgrupos**. Enquanto o modelo está liberado, **vários usuários executam** — **cada um gera sua própria instância** de resposta.
- **DUAS janelas de tempo distintas** (parte da configuração da lista):
  1. **Janela de abertura de novas instâncias**: até quando se pode **abrir** uma nova execução da lista — encerra por **data limite** OU **nº de respostas** (o que vier primeiro). Enquanto aberta, o usuário pode iniciar uma nova instância.
  2. **Janela de edição da instância**: depois de aberta, por quanto tempo ele pode **continuar respondendo/editando** (marcar/desmarcar tarefa, adicionar/editar observação, adicionar/editar evidências). Pode ser "ao longo do dia" ou o período definido. Na execução, **mostrar o tempo restante até o bloqueio da edição** daquela instância.
- **Montagem** (quem tem perfil que permite criar): título + tarefas; flags **por tarefa** — cada tarefa define se aceita **observação**, **evidência** (foto/vídeo) e se **exige checkin** (localização).
- **Execução** (Operação): aparece numa **nova aba "Tarefas"** (4ª aba, junto de Checklists/Histórico/Documentos), para quem está nos subgrupos atribuídos. Para cada tarefa: marca se realizou + (se a tarefa permitir) texto/evidência + (se exigir) checkin.
- **Menu/permissão**: pelo menu o usuário executa as listas dos seus grupos/subgrupos; com permissão (perfil), também **cria modelos** de lista.
- **Acompanhamento (Gestão)**: na listagem, por lista, abrir **modal/tela de indicadores de execução** (progresso respostas/alvo, quem respondeu, evidências).
- **Notificação ao publicar (RECOMENDAÇÃO a confirmar)**: canal garantido = aba Tarefas na Operação. WhatsApp **individual por pessoa** do subgrupo deve ser **opcional por lista** (toggle "avisar por WhatsApp"), **respeitando o turno** de cada um; default **desligado** (evita custo/spam de disparo automático p/ subgrupo inteiro).
- **Pontos a confirmar**: se mídias contam na cota de armazenamento (como no checklist); se há limite de 1 instância por pessoa por janela de abertura, ou várias.

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
| `texto` | Sem validação — máscara (9=digit, A=upper, *=any), opcional QR scan |
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

## Home / Visão Geral (`/gestao`) — revisado 2026-06-20
- **A Home é, por enquanto, dashboard de CHECKLIST** — só reflete informações de checklist. Dashboard da **unidade ativa** (escopado por `unidadeAtiva.id`; antes agregava todas as unidades).
- **Funil de Execuções** (período 1h/6h/12h/24h/15d/30d): tudo em **EXECUÇÕES concluídas** → Executados / Aprovados / Reprovados / **Em moderação** (execuções com ≥1 plano em moderação). Abaixo, **indicador de moderação por nível** (contagem de PLANOS): Aguardando N1 (em_moderacao_n1 + reaberto) / Aguardando N2 (em_moderacao_n2). **Últimas Execuções** (filtros Todos/Reprovados/Com PA, link PDF/planos) + Primeiros Passos.
- **Bloco "Planos com SLA crítico" REMOVIDO da Home (2026-06-20)** — Home é só checklist; SLA segue arquivado na UI. O campo `plano_acao_sla_horas` (SLA por atividade no montador) permanece no banco; `sla_prazo` do plano continua sendo calculado na abertura (`abertura + horas`), apenas não é exibido.

## Operação — tela principal (`/operacao`)
- Acesso restrito a usuários com **perfil de Operação** (ou perfil que permita a tela). Sem seletor de unidade na tela (unidade vem da sessão).
- **Visibilidade**: o operador vê só os checklists publicados dos **subgrupos aos quais está associado** (`usuario_subgrupo`). Associação feita em **Gestão → Grupos** (UsuariosGrupoModal/AdicionarUsuarioModal nas telas de grupos/subgrupos).
- Tocar num checklist = escolher um **modelo publicado** → cria uma **instância** de execução.
- **3 abas**: (1) **Checklists** (lista por grupo/subgrupo + Não finalizados / Agendados / Workflows em andamento — workflows só dos subgrupos do usuário); (2) **Histórico** (execuções do usuário: status, planos abertos, PDF); (3) **Documentos** (docs da unidade/subgrupos + Consulta Inteligente).
- **Abrir Ticket** (FAB): chamado avulso para não conformidades **fora do roteiro** dos checklists (ex: máquina quebrou → ticket p/ Manutenção). Checklist = roteiro fixo; ticket = a qualquer momento.
- **Não funciona offline** — requer conexão.

## Documentos (suporte de conhecimento da Operação) — revisado 2026-06-20
- Cadastrados em **Gestão → Configurações → Documentos**; consultados na aba **Documentos** da Operação. **Por unidade**. Três tipos:
  - **POP** (Procedimento Operacional Padrão) e **IT** (Instrução de Trabalho): organizados em **etapas**, cada uma com texto, imagens e **vídeo** (`documento_etapas`/`etapa_imagens`).
  - **Consulta Inteligente**: documento sobre o qual o operador faz perguntas em linguagem natural; resposta por **IA** (rota `/api/documentos/consultar`). ⚠️ Consome os **tokens de IA do plano** (enforcement `billing_pode_consumir_ia`); só Gemini/Claude leem PDF.
- **IA: dois mecanismos distintos** — o **Assistente de Ajuda** (`/api/ajuda`) usa a IA da **plataforma CheckFlow** (`ia_provedores`) e **NÃO** debita a cota do cliente; a **Consulta Inteligente** debita os **tokens do plano do cliente**.
- **Visibilidade na operação**: por subgrupo/grupo do documento, ou **geral** (sem vínculo). Admin/admin-empresa vê tudo.
- **Quem gerencia** (revisado 2026-06-20): quem tem a **permissão `documentos`** (criar/excluir) + admin de sistema/empresa. RLS de escrita por permissão em `documentos`/`documento_etapas`/`etapa_imagens` + **storage** das imagens (bucket `empresas`, prefixo `etapas/`) — migration `20260620160000`. Antes era só `is_admin_sistema` (gestor tomava erro).
- **Vídeo da etapa**: link do **YouTube OU Google Drive público** (helper `lib/videoEmbed.ts` resolve a URL de embed; Drive → `/preview`; aceita ID legado de 11 chars do YT). Sem upload de vídeo — só link.
- **Imagens de etapa contam na cota** de armazenamento (`registrarUsoArmazenamento(..., 'documento', ...)`; origem `'documento'` adicionada ao CHECK). Documento é permanente (a limpeza por tempo de guarda NÃO apaga imagens de documento).
- **Excluir**: soft-delete (`status='inativo'`) **direto** (documento é consulta livre, não referenciado por checklist) — sem guard.
- **Duplicar**: copia documento + **etapas + imagens** (reusa as URLs das imagens; não re-faz upload). Pode duplicar p/ outra unidade/grupo/subgrupo.

## Execução de Checklist
- **PDF sob demanda** (2026-06-17): não é mais gerado automaticamente ao concluir. Botão "Gerar PDF" na tela de conclusão e no Histórico → chama `/api/execucoes/[id]/pdf` e mostra "Baixar" quando pronto.
- **Plano de ação na Operação**: do Histórico, o link abre `/operacao/plano/[id]` (visão **somente-leitura**: status, atividade, evidências, andamento N1/N2) — mantém o operador na Operação (antes ia para `/gestao/planos-acao`, sem acesso). Moderação segue na Gestão. RLS de `planos_acao` já permite leitura pelo executor (`checklist_execucao_id` executado por ele) + tabelas filhas via `plano_acao_id in (select id from planos_acao)`.
- Ao finalizar, salva em `checklist_execucoes` com `status = 'concluido'`
- `resultado` = `'aprovado'` se todas as atividades conformes; `'reprovado'` se qualquer `calcularValidacao() === false`
- `data_expiracao` = `data_execucao + tempo_guarda_meses` meses (calculado pela aplicação)
- `tempo_guarda_meses` padrão: 12. Opções: 1, 3, 6, 12, 24, 36, 48, 64 meses
- Execuções são isoladas por `unidade_id` via RLS
- Quando vem de workflow (`?wf_item=<id>`): insert com `status='em_andamento'` → linka `workflow_item_execucoes` → update para `'concluido'` → trigger avança o pipeline

## Estrutura do Checklist
- Um checklist tem **1 ou mais seções**; cada seção tem **1 ou mais atividades**.

## Gestão → Checklists (listagem + montador) — revisado 2026-06-17
**Listagem** (`/gestao/checklists`):
- Lista os checklists publicados/rascunho **dos subgrupos a que o usuário tem acesso**, da unidade ativa; inativos nunca aparecem (nem no filtro). Filtros: busca + Todos/Rascunho/Publicado.
- **"Usar um modelo"** → galeria `/gestao/checklists/modelos`. O modelo é genérico (criado pela CheckFlow/admin do sistema); usar = **copiar** para a unidade. **A cópia é independente**: adicionar atividade no modelo de origem **não** reflete na cópia (sem vínculo).
- **"Novo checklist"** → cria do zero numa unidade/grupo/subgrupo. A empresa contratante pode criar o próprio e **duplicar para outra unidade/grupo/subgrupo**.
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
- **"Gerenciar usuários"** (`UsuariosGrupoModal`) — por usuário do grupo: editar **nome/telefone/perfil**; gerenciar **subgrupos** de acesso; **reenviar senha** (envia código por WhatsApp via `/api/usuarios/resetar-senha` — fluxo CPF+OTP, exige telefone); **remover do grupo** (apaga `usuario_grupo` **e** os `usuario_subgrupo` daquele grupo, sem acesso órfão — não exclui o usuário do sistema). Editar perfil respeita o guard do último admin (trigger). Corrigido 2026-06-17.
- **Funções por subgrupo** (`usuario_subgrupo.funcao`): definem o papel do usuário sobre os checklists daquela área.
  - **— (null)**: só visualiza.
  - **Operação**: executa checklists.
  - **Nível 1**: executa + **modera** os planos de ação abertos por não conformidade → ações: **corrigir, não corrigir, escalar para N2**.
  - **Nível 2**: recebe a moderação **escalada pelo N1** → ações: **corrigir, não corrigir, devolver para N1**; também pode atuar como N1 e executar checklist.
  - **Notificações por nível**: cada nível só recebe alerta (WhatsApp + e-mail) quando a ação é **compatível com o seu nível** (N1 recebe o que é de N1; N2 recebe o escalado para N2).

## Acessos → Usuários — revisado/corrigido 2026-06-17
- Lista usuários ativos da empresa (`usuario_empresa`). Login por CPF; telefone obrigatório (OTP WhatsApp); e-mail opcional (→ `cpf@checkflow.local`).
- **Cadastro (modal `UsuarioModal`)**: nome, CPF, telefone, e-mail, **perfil** (obrigatório; só públicos p/ não-admin), **turno**, **unidades**. 
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
- **Status**: aberto → em_tratamento → (opcional: aguardando_informacao = responsável pediu algo ao abridor, SLA pausa) → o **responsável conclui direto**: corrigido / corrigido_parcialmente / nao_corrigido (ou cancelado / improcedente). O **abridor é avisado e pode REABRIR** se discordar (volta a 'aberto' sem responsável). **Mudança 2026-06-18**: removida a etapa "Propor conclusão"/`aguardando_validacao` — o responsável fecha e o abridor contesta via reabertura. (O bloco de `aguardando_validacao` permanece no código só para tickets legados que já estavam nesse estado.) Evento novo `conclusao` notifica o abridor.
- **SLA**: cadastrado em `/gestao/tickets/sla` — prazo por **prioridade** (padrão da unidade + override por categoria). Semáforo verde/amarelo/vermelho; pausa em aguardando_informacao.
- **Visibilidade (2026-06-18)**: a listagem mostra só os tickets dos **subgrupos do usuário** (+ os que ele abriu); admin vê todos. Contadores idem.
- **Assumir**: só quem é do **subgrupo de destino** (ou admin). Demais ações por papel: responsável trata; abridor responde/valida/reabre; comentar sempre; cancelar = abridor ou permissão `ticket.cancelar`; improcedente = responsável com `ticket.cancelar`.
- **Decisão 2026-06-18: NÃO usar perfil em tickets** — o controle de acesso é por **subgrupo** (visibilidade por subgrupo + assumir só por membro) + papel (abridor/responsável). As permissões `ticket.*` do catálogo ficam sem enforcement (exceto `ticket.cancelar`, que já gateia improcedente/cancelar). Não enforçar `ticket.ver/criar/tratar`.

## Assistente de IA — sugestões por tela (2026-06-18)
- O botão flutuante (`components/ajuda/AssistenteAjuda.tsx`) detecta a rota atual (`usePathname`) e mostra **perguntas sugeridas pertinentes àquela tela** (mapa `SUGESTOES_POR_TELA`, casa pelo prefixo mais específico; fallback `SUGESTOES_PADRAO`). Clicar no chip envia a pergunta. 100% frontend — **não muda a chamada à IA nem adiciona tokens** (tende a reduzir, por evitar tentativa-e-erro). Campo livre continua permitindo perguntar sobre qualquer parte do sistema.
- ⏳ Evolução p/ cortar tokens de verdade (quando o MANUAL crescer): enviar só a seção da tela com fallback, ou RAG (pgvector) — ver `/status`. Ao criar telas novas, adicionar entrada no `SUGESTOES_POR_TELA`.

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

## WhatsApp (Evolution API)
- Integração via Evolution API **v2.3.7** (imagem `evoapicloud/evolution-api:v2.3.7` no Railway — atualizada em 2026-06-11; a org `atendai` no Docker Hub está desatualizada)
- Instância única: `checkflow` (Baileys)
- Config armazenada em localStorage (`checkflow_evo_config`), não no DB
- Status verificado a cada 5s via `POST /whatsapp/status`
- QR gerado via `POST /whatsapp/conectar` (proxy no Fastify)
- ⚠️ Histórico: v2.2.3 tinha bug de loop infinito de reconexão que impedia o QR de ser gerado (issue #2430 do EvolutionAPI, corrigido na v2.3.7) — NÃO fazer downgrade da imagem
- Env vars relevantes no serviço Evolution: `CONFIG_SESSION_PHONE_VERSION`, `CACHE_REDIS_ENABLED=false`, `CACHE_LOCAL_ENABLED=true`
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

## Agendamentos (recorrência) — revisado 2026-06-18
- Tela `/gestao/agendamentos`: cria disparos recorrentes de workflows ou checklists publicados (workflows da empresa; checklists da unidade ativa)
- Recorrência personalizada: a cada X horas/dias/meses, a partir de uma data/hora de referência (`referencia_inicio`)
- `proxima_execucao` calculada automaticamente em Postgres (trigger `agendamento_set_proxima`); processamento via `agendamentos_processar()` chamada periodicamente por `pg_cron`
- **Sem catch-up**: se a referência está no passado, o sistema calcula o **próximo slot futuro** (não recupera disparos perdidos); dispara 1× quando vence e empurra a próxima pra frente.
- **Disparo**: workflow → `workflow_iniciar` (inicia o workflow, libera estágio 1). Checklist → cria `checklist_execucoes` como pendência da unidade (`executado_por` null + `agendamento_id`).
- **Visibilidade do agendado (2026-06-18)**: a pendência agendada de checklist aparece na Operação **só para operadores do subgrupo do checklist** (admin vê todas) — não mais para qualquer operador da unidade.
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

### Visibilidade (✅ 20260614060000)
- Ticket **sem assignee**: visível para todos os membros da unidade (`usuario_unidade`)
- Ticket **com assignee**: visível apenas para `assignee_id`, `aberto_por_id` e `is_admin_sistema()` — some da lista dos demais
- Policy `tickets_leitura` reflete essa regra

### Devolução
- Assignee solicita informação ao abridor (`aguardando_informacao`)
- Sem deadline — tempo por participante é rastreado via eventos
- Abridor responde → volta para `em_tratamento`

### Transferência (✅ 20260614060000)
- Assignee em `em_tratamento` pode transferir o ticket para outro grupo/setor da MESMA unidade
- Ao transferir: `grupo_id`/`subgrupo_id` mudam, `assignee_id` volta a `null`, `status` volta a `aberto` (alguém do novo destino precisa assumir de novo)
- Evento `transferencia` registra `meta: {de: {grupo,subgrupo}, para: {grupo,subgrupo}}` + observação obrigatória
- Modal em `gestao/tickets/[id]/page.tsx` lista grupos/subgrupos da unidade via policies `grupos_unidade_membro`/`subgrupos_unidade_membro` (novas — antes só existia "meu grupo")

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

## Planos de Ação — moderação N1/N2 (revisado 2026-06-20)
- **Origem**: PA é aberto **automaticamente** quando uma execução tem atividade **não conforme** marcada para gerar plano. Nasce em `em_moderacao_n1`. **Por enquanto NÃO há abertura manual** (sem não-conformidade não há PA).
- **Visibilidade da listagem**: só vê o plano quem **o abriu** (`criado_por`) **OU** quem **pertence ao grupo/subgrupo de resolução** (`planos_acao.subgrupo_id` = subgrupo do checklist). Admin vê todos. Filtro client-side via `visivelPorSubgrupo` + `criado_por === user.id` (`lib/visibilidade.ts`). Antes só filtrava por status (confiava só no RLS) — **corrigido**.
- **Ordenação da lista**: seletor "Mais antigos primeiro" (default) / "Mais recentes primeiro" (por `created_at`).
- **SLA arquivado por enquanto** (decisão 2026-06-20): removidas as tags de SLA da lista e do detalhe. `sla_prazo` ainda existe no banco mas não é exibido. Retomar quando o tema de SLA for definido.
- Funções do usuário no plano: `operacao` | `nivel_1` (N1) | `nivel_2` (N2). **admin = N2**. N1/N2 são camadas de moderação, não pessoas fixas — **N1 e N2 também executam checklist**, além de moderar.
- Estados: `em_moderacao_n1` → `em_moderacao_n2` (se escalado) → `corrigido` | `nao_corrigido` (terminais).
- Ações por papel/estado (`gestao/planos-acao/[id]/page.tsx` → `botoesDisponiveis`):
  - `em_moderacao_n1` + (N1/N2/admin): `corrigido`, `nao_corrigido`, `enviado_n2` (escala)
  - `em_moderacao_n2` + (N2/admin): `corrigido`, `nao_corrigido`, `devolvido_n1`
  - terminal + N1: `reaberto` (→ `em_moderacao_n1`) — **N1 pode reabrir mesmo o que o N2 fechou** (decisão confirmada).
- **Fallback sem N2**: o gestor do grupo deveria ser N2; se o subgrupo **não tem nenhum** `nivel_2`, o botão "Enviar para N2" fica **desabilitado** com aviso ("Não existe um moderador N2 configurado para o subgrupo X"). Contagem via `usuario_subgrupo` count `funcao='nivel_2'`.
- Cada movimentação exige **observação obrigatória** + evidências opcionais (fotos/vídeos em `plano_acao_movimentacao_evidencias`).
- **Notificações (WhatsApp/Email, respeita turno)**: abertura → **N1** do subgrupo; `enviado_n2` → **N2**; `devolvido_n1` → **N1** (devolução adicionada 2026-06-20; usa mensagem hardcoded, sem template dedicado). Ver tabela de destinatários abaixo.

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
- **Reset disparado por gestor**: botão "Resetar senha" (ícone chave) em `/gestao/acessos/usuarios`, chama `/api/usuarios/resetar-senha` (gated por `is_admin_sistema()` ou `usuario_tem_permissao('usuarios','editar')`). Envia código `reset_admin` por WhatsApp ao usuário. Limite: 5/hora por usuário
- Fluxo de verificação é unificado: `/api/auth/verificar-codigo` aceita código de qualquer um dos 3 tipos (`primeiro_acesso`/`reset_admin`/`self_service`), retorna um token de sessão de uso único (`sessao_senha`, 10min) consumido por `/api/auth/definir-senha`
- Código expira em 15 minutos, máx. 5 tentativas
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
- `planos` (admin `/sistema/planos`): tipos `gratuito` (permanente), `trial` (`dias_trial` **configurável** — começa generoso, reduz com o tempo) e `pago` (ciclo mensal/anual). Limites: execuções/mês, armazenamento total (bytes), tokens IA/mês — **NULL = ilimitado**. Usuários sempre ilimitados (não é métrica de cobrança).
- `pacotes_adicionais` (admin `/sistema/pacotes`): compra avulsa de `execucoes`, `tokens_ia` (saldo do período, **use ou perde**) ou `armazenamento` (capacidade **permanente**).

**Assinatura & enforcement (Fase 2A — ✅ migration 20260615160000):**
- `empresa_assinaturas` (snapshot dos termos + contadores mensais). Admin do sistema atribui/troca plano na aba **"Plano"** de `/sistema/empresas/[id]` (componente `AssinaturaEmpresa`): snapshot imediato, reinício de trial confirmado, barras de uso via `billing_status`.
- Bloqueios ativos: nova execução na Operação (`billing_pode_executar`), Consulta IA → 402 (`billing_pode_consumir_ia`), upload por capacidade de storage (`billing_armazenamento_disponivel`). Execução agendada não é re-bloqueada.
- Painel do admin da empresa (self-service de plano/uso) **deferido para a Fase 3** (junto com checkout Asaas).

**Regras de uso (Fases 2-4 — pendentes):**
- **Período** ancorado no aniversário da assinatura (não no calendário). Allowance reseta a cada período — **sem rollover**.
- **Enforcement** não é tempo real (contador por período; pequeno excedente tolerado). Limite excedido **bloqueia** a ação (nova execução / Consulta IA / upload), com upsell.
- **Consumo** base→pacote: usa o limite do plano primeiro, depois o saldo de pacote.
- **Armazenamento** = capacidade fixa (plano + pacotes permanentes); uso **sempre real** (a limpeza por tempo de guarda abate bytes via entrada negativa em `uso_armazenamento`). Tempo de guarda é a alavanca de espaço.
- **Trial expira → cai no plano gratuito** (não bloqueia acesso). `ja_usou_trial` evita re-trial.
- **Troca de plano** (✅ implementado): **toda troca entre planos pagos vale só no FIM do período vigente** (sem pro-rata) — grava `proximo_plano_id` + `troca_efetiva_em = periodo_fim`; `avancar_periodo_assinatura` aplica o snapshot na virada. No Asaas: pago→pago faz `PUT` na assinatura (`updatePendingPayments:false`, novo valor só na próxima cobrança); pago→gratuito cancela a assinatura (sem cobranças futuras, mantém limites até a virada). **1ª contratação de pago (vindo de trial/gratuito) é imediata.** Pacotes comprados sobrevivem à troca; downgrade de storage abaixo do ocupado bloqueia novos uploads (não apaga dado). ⚠️ Limitação conhecida: para ciclo anual, o snapshot troca na virada mensal de uso (revisar se planos anuais virarem comuns).
- **Snapshot**: assinatura congela preço+limites do plano; editar o catálogo não afeta quem já assinou.
- **Split de parceiro** via subconta Asaas (criada automaticamente): trocar parceiro recalcula %; remover parceiro → 100% CheckFlow.
- Tiers fixos públicos (planos negociados/custom só para casos enterprise).

## Exclusão Definitiva de Empresa
- Apenas empresas com `status = 'inativo'` podem ser excluídas, e somente por `is_admin_sistema()` — validado na RPC `excluir_empresa_cascata`
- Apaga em cascata: unidades, grupos, usuários vinculados, checklists, execuções, planos de ação, tickets, workflows
- Ação **proposital não-trivial**: na tela `/sistema/empresas/[id]` (aba Configurações, "Zona de perigo"), exige digitar o nome exato da empresa + marcar checkbox de ciência antes de habilitar o botão — evita exclusão acidental de uma operação tão pesada
- Irreversível — sem soft delete/recuperação

## Regras de Negócio Críticas
- RLS obrigatório em todas as tabelas de dados de usuário
- Checklist publicado não pode ter sua estrutura mutada
- Operação não tem sidebar — layout separado em `operacao/layout.tsx`
- Executor não pode digitar localização — apenas GPS automático
- Vídeo da galeria com >1h recebe alerta visível (anti-fraude)
- QR scanner (BarcodeDetector API) só funciona no Chrome Android — exibe erro claro em outros browsers

## Evolution Rule
When a new product rule is consolidated, append it as a short bullet under the relevant section.
