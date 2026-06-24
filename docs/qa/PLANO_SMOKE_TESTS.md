# Plano de Smoke Tests — CheckFlow

Roteiro de testes de fumaça **end-to-end**: segue a ordem real de uso, desde a criação
da empresa até a execução de checklist, moderação de plano de ação, tickets e cobrança.
Marque ✅/❌ e anote o que falhar. Reexecutar sempre que mexer no código das áreas tocadas.

**Legenda de papel:** AS = Admin de Sistema · AE = Admin da Empresa · N1/N2 = moderador
do subgrupo (também executam) · OP = operador comum.

> ⚠️ **Pré-requisitos de ambiente**
> - `INTERNAL_API_SECRET` idêntico nos serviços **api** e **web** do Railway (sem isso reset de senha/primeiro acesso quebra).
> - WhatsApp (Evolution API) conectado em `/sistema/whatsapp` (sem isso, OTP só chega por e-mail — testar os dois canais).
> - Pelo menos 1 provedor de IA ativo em `/sistema/integracoes-ia` (para testar Consulta Inteligente/Assistente).

---

## 0. Automatizado (reexecutar sempre antes do smoke manual)
- [ ] `cd apps/web && npm run build` → compila todas as rotas sem erro.
- [ ] `cd apps/web && npx vitest run` → todos os testes verdes (ver contagem atual no CI).
- [ ] `node pentest/causa-raiz-rls.mjs` (creds dos `.env`).
- [ ] `node pentest/billing-templates-rls.mjs`.
- [ ] `node pentest/test-ia.mjs`.
- [ ] `node pentest/admin-empresa-rls.mjs` (se existir — isolamento entre empresas).

---

## 🔴 Bugs encontrados na execução (2026-06-24, produção, empresa "QA Smoke 2026-06-24")

1. **Dropdown "Perfil" nunca carrega opções, em NENHUM modal de criação de usuário.**
   - Reproduzido em `/sistema/empresas/[id]` (aba Administrador → "Cadastrar novo usuário") e em `/gestao/acessos/usuarios` → "Adicionar usuário" (`UsuarioModal`).
   - Confirmado via rede: nenhuma das duas telas dispara request à tabela `perfis` ao abrir o modal — só mostra a opção "Selecione".
   - Validado que `perfis` existe e é consultável: `/gestao/acessos/perfis` lista os 3 perfis de sistema normalmente para a mesma empresa.
   - **Impacto:** bloqueia toda criação de usuário com perfil pela UI — não há caminho funcional para A7 sem ir direto no banco.
2. **Isolamento de tenant quebrado no dropdown "Selecione um usuário" (`/sistema/empresas/[id]` → Administrador).**
   - O combobox usado para atribuir o Administrador da empresa lista usuários de **todas as empresas do sistema**, não só da empresa selecionada — expõe nome+e-mail de usuários de empresas não relacionadas (ex. `ctmf81@gmail.com`, `Lucio_Hettinger@annie.ca`, etc.).
   - **Impacto:** vazamento de dados entre tenants nessa tela administrativa de sistema.
3. **🔴 Tabela `turnos` em produção está com schema desatualizado — colunas `tipo` e `config` não existem; toda criação de turno falha ("Erro ao criar.").**
   - Reprodução: `/gestao/acessos/turnos` → "Novo Turno" → preencher nome, deixar tipo padrão "Administrativo" → "Criar" → modal mostra só "Erro ao criar.", sem detalhe, sem erro no console.
   - Diagnóstico via REST direto (`GET .../rest/v1/turnos?select=tipo`) → `400 42703 column turnos.tipo does not exist` (erro do Postgres, não cache do PostgREST — descarta engano de nome de coluna).
   - Confirmado o schema atual de produção coluna a coluna: existem `id, empresa_id, nome, ativo, criado_em, atualizado_em, modo_fora_turno` — **faltam `tipo` e `config`** (também testado `tipo_turno`/`categoria`, nenhuma existe).
   - Migração `supabase/migrations/20260607000002_turnos.sql` (cria a tabela com `tipo`/`config`) aparentemente **nunca foi aplicada por completo em produção**, enquanto a migração posterior `20260622120000_turno_modo_fora.sql` (`modo_fora_turno`, que é só um `alter table ... add column if not exists`) foi aplicada normalmente — sugere que a tabela em produção foi criada por um caminho diferente do arquivo de migração atual (ou a migração original rodou parcialmente).
   - **Impacto:** bloqueia 100% a criação de turnos pela UI → bloqueia A3 inteiro, a vinculação de turno em A7/A8, e os 3 testes de `modo_fora_turno` da Parte B §4. Não há workaround via API (a própria tabela não tem a coluna) — só corrigindo o schema de produção (aplicar a migração faltante/reconciliar) resolve.

Workaround usado para não travar o smoke test: bugs #1/#2 contornados criando o usuário admin via `POST /api/usuarios/criar` direto (token da própria sessão). Bug #3 **não tem workaround possível** (gap de schema) — A3 e os itens dependentes ficam marcados como bloqueados e o smoke test segue para A4 em diante.

---

## PARTE A — Jornada completa do zero (E2E sequencial)

Faça **nesta ordem**, numa empresa nova de teste. Cada etapa depende da anterior.

### A1. (AS) Criar empresa
- [x] `/sistema/empresas` → criar empresa nova (nome, CNPJ). Aparece na listagem. ✅ "QA Smoke 2026-06-24" criada (`6f1f2f09-5fe0-46aa-b760-20cf7abb938b`).
- [ ] Aba **Pagamento**: definir plano inicial (ex.: `trial` ou `gratuito`) em `AssinaturaEmpresa` → snapshot grava em `empresa_assinaturas`; barra de uso aparece zerada.
- [ ] Aba **Parceiro** (opcional): vincular parceiro existente por e-mail ou cadastrar novo → e-mail de boas-vindas dispara só na 1ª vinculação.
- [ ] Aba **Configurações**: confirmar que "Zona de perigo" (excluir empresa) está **bloqueada** (empresa ativa).
- [ ] Confirmar seed automático: 10 templates de notificação (5 tipos × 2 canais) já existem em `/gestao/configuracoes/notificacoes` para a empresa nova.
- [x] Administrador da empresa atribuído ✅ — confirmado: atribuir o perfil de sistema "Admin da empresa" a um usuário via `usuario_empresa.perfil_id` **é** a atribuição de administrador (não há campo separado em `empresas`). Feito via `POST /api/usuarios/criar` (ver bug #1 acima sobre o dropdown de Perfil quebrado na UI).

### A2. (AE/AS) Criar unidade(s)
- [x] `/gestao/acessos/empresa` → criar 1ª unidade (nome, endereço). Aparece no seletor de unidade do header. ✅ "Unidade padrão" (seed automático na criação da empresa).
- [x] Criar 2ª unidade (para testar depois trocar de unidade ativa e isolamento de dados). ✅ "Unidade Filial" criada sem erros.
- [ ] Editar nome/CNPJ da empresa → salva com toast.

### A3. (AE) Turnos (opcional mas recomendado antes de criar usuários)
- [ ] ❌ **BLOQUEADO (Bug #3)** `/gestao/acessos/turnos` → criar turno **Administrativo** (horário por dia da semana, ex. seg-sex 08-17h). — "Erro ao criar." por falta das colunas `tipo`/`config` em produção, ver bug #3 acima. Seguindo para A4 sem turno criado.
- [ ] Criar turno **Escala** (ciclo rotativo, ex. 12x36, a partir de uma data de referência). — não testável enquanto bug #3 persistir.
- [ ] Para cada turno, escolher `modo_fora_turno`: testar os 3 modos depois de vincular a um usuário (ver A6/seção 4). — não testável (depende de criar turno).
- [ ] Editar um turno → dados mantidos. — não testável.

### A4. (AE) Grupos / Subgrupos (estrutura organizacional)
- [x] `/gestao/grupos` → criar 1 grupo (ex. "Produção"). ✅ grupo "Produção" criado sem erros (`7a6a1e02-ecbb-4b85-ab62-6c4c85120601`). (Não testada a customização de label em `/gestao/configuracoes/formatacao` — fica para Parte B §7.)
- [x] Dentro do grupo, `/gestao/grupos/[id]/subgrupos` → criar 2 subgrupos (ex. "Linha 1", "Linha 2"). ✅ ambos criados sem erros.
- [ ] Confirmar que sem usuários vinculados ainda, telas operacionais (Operação, Tickets) não têm nada para mostrar — comportamento esperado, não erro.

### A5. (AE) Pré-requisitos de checklist (cadastros base)
Fazer **antes** de montar o checklist, na ordem que o checklist vai consumir:

- [x] **Catálogo** (`/gestao/configuracoes/catalogos`): criar 1 catálogo com campo-chave + 2 atributos + ao menos 3 valores. ✅ catálogo "Equipamentos" (chave "Código do Equipamento" + atributos "Nome do Equipamento"/"Setor") com 3 valores (EQ-001/002/003) criados sem erros. ⚠️ bug cosmético: badge "0 valores cadastrados" não atualiza após adicionar valores (lista abaixo mostra os 3 corretamente) — não bloqueia, só visual. Aba "API" não testada (sem URL de teste disponível).
- [x] **Variáveis** (`/gestao/padrao/variaveis`): criar 1 variável com 2+ valores (ex. "Formato" → quadrado/redondo). ✅ "Formato" com valores "Quadrado"/"Redondo" criada sem erros.
- [x] **Padrão** (`/gestao/padrao/criar`): criar padrão combinando a variável criada + 1+ instância com faixa min/max. ✅ "Densidade" (grupo Produção/Linha 1) com instância Formato=Quadrado, min 1.40/max 1.50, salvo sem erros. Combinação duplicada **não testada** (não tentei criar 2ª instância igual).
- [x] **Motivos de não execução** (`/gestao/configuracoes/nao-execucao`): motivo padrão "Não disponível" é criado lazily no 1º checklist da unidade (trigger), não no seed empresa. Criados 2 customizados: ✅ "Área interditada" (tipo checklist, grupo Produção) e "Sensor com falha" (tipo atividade, grupo Todos) sem erros.
- [ ] **Causa Raiz** (`/gestao/configuracoes/causa-raiz`): cadastrar cascata Grupo→Subgrupo→Checklist→Campo (o campo só lista atividades com validação — criar depois de montar o checklist, ou voltar aqui após A7). Nome obrigatório.
- [🟡] **Documentos** (`/gestao/configuracoes/documentos`): modal abre e aceita nome/descrição/tipo (POP selecionado), mas "Continuar" não avança para etapa de adicionar conteúdo — validação bloqueando ou UI não intuitiva. Não completado nesta sessão. Link YouTube e Consulta Inteligente não testados.

### A6. (AE) Perfis de acesso
- [ ] `/gestao/acessos/perfis` → criar 1 perfil **público** com permissões básicas (ver/criar checklist, executar, ver tickets) — testar que `publico=true` é selecionável por gestor de grupo depois.
- [ ] Criar 1 perfil **não-público** (ex. perfil de N1/N2 com permissão de moderar) — só Admin da empresa deve conseguir atribuí-lo.
- [ ] Confirmar que as permissões cobrem: checklists, usuários, catálogos, documentos, agendamentos, tickets (`categorias_gerir`, `cancelar`), causa-raiz.
- [ ] **(AE) Editar perfil existente e salvar** → reabrir e conferir que as **permissões NÃO zeraram** e o "público" continua certo.
- [ ] Nome de perfil duplicado é bloqueado.

### A7. (AE) Criar usuário e vincular tudo
- [x] `/gestao/acessos/usuarios` → "Novo usuário": nome, **CPF**, **telefone** (obrigatórios), e-mail (opcional), perfil público criado em A6, turno de A3, unidade(s) de A2. ✅ "QA Admin Empresa" criado com perfil "Admin da empresa" e unidade padrão (via API direta — UI bloqueada pelo bug #1).
- [ ] Salvar → usuário recebe **código de 1º acesso** por WhatsApp (+ e-mail se houver). — a verificar (testar OTP em A8).
- [ ] **(AE) Adicionar usuário com CPF já existente** (de outra empresa, se houver massa de teste) → entra em **"modo vínculo"** (dados pessoais read-only, botão "Vincular à empresa"); não reenvia OTP nem recria auth user.
- [ ] No grupo (`/gestao/grupos/[id]` → "Gerenciar usuários" / `AdicionarUsuarioModal`): adicionar o usuário criado a 1 subgrupo, com **função** = `Operação` (depois testar `Nível 1`/`Nível 2` com outro usuário).
- [ ] Criar um **2º usuário** com função `Nível 1` e um **3º** com função `Nível 2` no mesmo subgrupo (necessários para a Parte C — Planos de Ação).
- [ ] **(AE) Inativar** um usuário de teste → some da lista; perde acesso ao tentar logar.
- [ ] **(sem permissão) chamar** `/api/usuarios/inativar` direto sem token → **401**.

### A8. Primeiro acesso (usuário recém-criado)
- [ ] Abrir `/primeiro-acesso` → informar CPF + código recebido (WhatsApp/e-mail) → token de sessão → `/nova-senha` define senha. `primeiro_acesso` vira `false`.
- [ ] Tentar usar o mesmo código de novo → deve falhar (uso único / expirado).
- [ ] Logar com CPF + nova senha em `/login` → entra na Operação (perfil de operação) ou Gestão (se perfil tiver acesso).

### A9. (AE) Montar e publicar o checklist
- [ ] `/gestao/checklists` → "Novo checklist" na unidade/grupo/subgrupo da Parte A. Vincular os motivos de não-execução criados em A5 (tipo checklist + tipo atividade).
- [ ] No montador, criar **1 seção** com **1 atividade de cada tipo** (no mínimo): `sim_nao`, `numero` (min/max), `multipla_escolha` (com opção inválida), `catalogo` (referenciando catálogo de A5), `texto` (com máscara), `foto`, `video`, `localizacao`, `data_hora`, `padrao` (referenciando padrão de A5).
- [ ] Criar **1 atividade dependente** (pai `sim_nao` ou `multipla_escolha` + `valor_gatilho`) → confirmar que só pai desses tipos é aceito.
- [ ] Definir **tempo de guarda de mídia** (testar valor baixo, ex. 1 mês) e **modo de execução** (`permite_continuar_depois` = true).
- [ ] **Publicar** → cria snapshot em `checklist_versoes`; checklist aparece na Operação para o subgrupo vinculado.
- [ ] Tentar **inativar** um checklist vinculado a workflow publicado (se workflows estiver habilitado) → deve bloquear listando o(s) workflow(s).
- [ ] **Duplicar** o checklist para a 2ª unidade (A2) → catálogo é recriado lá com aviso de confirmação; `catalogo_id` remapeado.
- [ ] Voltar em **Causa Raiz** (A5) e cadastrar o campo agora que a atividade com validação existe.

### A10. (OP) Executar o checklist — todos os tipos de atividade
- [ ] Logar como o usuário de função `Operação` (A7) → `/operacao` → ver o checklist publicado no subgrupo correto.
- [ ] Abrir e responder **cada tipo de atividade**: sim/não, número (validar faixa), múltipla escolha (validar opção inválida = não conforme), catálogo (buscar/selecionar item), texto (testar máscara + QR só funciona em mobile Chrome), foto (1 foto, comprimida), vídeo (auto-stop 10s, alerta se vídeo de galeria >1h), localização (GPS automático, sem digitação manual), data/hora (pré-preenchida), padrão (escolher variáveis → validação por instância; testar combinação sem instância → aviso âmbar).
- [ ] Testar a atividade **dependente**: só aparece quando o pai recebe o `valor_gatilho`.
- [ ] **"Continuar depois"**: salvar parcial, saminar, reabrir via "Continuar" na seção "Não finalizados" → respostas restauradas (incl. fotos/vídeos como preview).
- [ ] **"Não consigo executar esta atividade"** (atividade obrigatória com motivo tipo `atividade`) → seleciona motivo, marca como não executada, pode desfazer.
- [ ] **"Não foi possível executar este checklist"** (motivo tipo `checklist`) → cria execução `nao_executado` direto, sem respostas.
- [ ] Finalizar checklist com **pelo menos 1 atividade não conforme** (proposital, para testar Plano de Ação na Parte C) e **1 execução 100% conforme** (separada, para confirmar `resultado='aprovado'`).
- [ ] No fim, clicar **"Gerar PDF"** → aparece "Baixar" quando pronto (Histórico e tela de conclusão).
- [ ] Conferir no **Histórico** (aba 2): execuções do usuário, status, link de plano se houver.

---

## PARTE B — Telas administrativas (cobertura por área)

## 1. Acessos → Perfis
- [ ] (revisado em A6) — reexecutar se mexer no construtor de perfis.
- [ ] **(AE) Excluir perfil** sem usuários → some. Com usuários atribuídos → bloqueia com aviso.

## 2. Acessos → Usuários
- [ ] **(AS) "Logar como"** um usuário → cai logado no ambiente dele.
- [ ] Demais itens cobertos em A7/A8.

## 3. Acessos → Empresa
- [ ] **(AE) Inativar uma unidade** (ícone ⏻) → vira inativa (NÃO apaga a árvore de dados). Não há mais hard-delete.

## 4. Acessos → Turnos — Modo fora do turno (os 3 modos)
- [ ] **(AE) Criar turno "Bloquear login"** (`modo_fora_turno='login'`) e vincular a um OP → fora do horário o OP **não loga** (RPC `usuario_pode_acessar` após `signInWithPassword`); sessão já aberta **não cai**. AS/AE são **isentos** e entram normalmente.
- [ ] Turno `'aviso'` → fora do horário aparece **banner** dispensável (`AvisoTurno.tsx`), dispensa fica em sessionStorage.
- [ ] Turno `'notificacao'` (default) → fora do horário não recebe WhatsApp de moderação (e-mail continua); acesso normal.
- [ ] **Editar** turno mantém os dados. Usuário sem turno (ou turno inativo) nunca é restringido.

## 5. Padrão (Variáveis / Padrões)
- [ ] (cobertos em A5/A9/A10) — checar especificamente que editar variável/padrão **não perde** valores/instâncias (edição apaga-e-recria internamente).
- [ ] ⚠️ Conferir manualmente no banco se um save com erro de RLS em `variavel_valores`/`padrao_instancias` mostra **toast de sucesso indevido** (bug conhecido, não corrigido ainda) — reportar se reproduzir.

## 6. Causa Raiz
- [ ] (cadastro cobrir em A5/A9). Execução:
- [ ] **(N1/N2) Execução**: reprovar atividade que gera plano → no "Abrir Plano de Ação" aparece a **seção Causa raiz** (dropdown + "+ Nova" + observação + últimas ocorrências).
- [ ] **(OP) Execução**: a seção de causa raiz **NÃO** aparece.
- [ ] **(N1/N2) Moderação** (`/gestao/planos-acao/[id]`): bloco Causa raiz mostra a causa do plano, permite registrar, e lista **"Recorrência neste campo"**.

## 7. Configurações (itens não cobertos em A5)
- [ ] **Formatação**: mudar rótulo de grupo/subgrupo → salvar mostra toast e o rótulo muda no app.
- [ ] **Notificações**: editar template (corpo/assunto) e salvar → toast. Desabilitar 1 canal de 1 tipo → confirmar que não dispara mais (testar via ação real, ex. abrir ticket). Sem empresa selecionada → "Nenhuma empresa selecionada" (não trava).
- [ ] **Documentos**: duplicar para outra unidade/grupo/subgrupo → copia etapas+imagens sem re-upload. Excluir (soft-delete direto, sem guard).
- [ ] **Catálogos**: excluir catálogo usado por checklist ativo → **bloqueia** listando os checklists. `test-api` (import) exige usuário logado.

## 8. Tarefas (Listas)
- [ ] `/gestao/tarefas` → criar lista (título + 3 itens), flags por item (observação/evidência/checkin), atribuir a 1 grupo + 1 subgrupo, definir janela de abertura (data limite ou nº respostas) e janela de edição.
- [ ] Toggle `notificar_whatsapp` → ao publicar, dispara WhatsApp aos membros do subgrupo respeitando turno (fire-and-forget).
- [ ] **(OP) Execução** (aba "Tarefas" na Operação): marca item realizado, adiciona observação/evidência onde permitido, checkin (testar GPS negado → conclui como "sem localização" em vez de bloquear).
- [ ] Confirmar **1 instância por pessoa por lista** (`unique(lista_id,usuario_id)`) — tentar abrir 2ª instância deve impedir/reaproveitar a existente.
- [ ] Indicadores na listagem (Gestão): progresso respostas/alvo, quem respondeu, evidências.

## 9. Agendamentos
- [ ] `/gestao/agendamentos` → criar agendamento de checklist publicado (recorrência X horas/dias/meses a partir de uma referência).
- [ ] Criar agendamento de workflow (se habilitado — ver seção 13).
- [ ] Confirmar pendência agendada aparece na Operação **só para o subgrupo do checklist** quando vence.
- [ ] Ativar/pausar, editar (recalcula `proxima_execucao`) e excluir.
- [ ] Gestor não-admin vê só agendamentos dos seus subgrupos; admin vê todos.

## 10. Plano (billing) — self-service do AE
- [ ] **(AE)** `/gestao/plano` abre e mostra uso/planos/pacotes/cobranças (via `billing_status`).
- [ ] Sem empresa selecionada → **"Nenhuma empresa selecionada"** (não trava em "Carregando…").
- [ ] Ao assinar/comprar pacote → abre a fatura (Asaas); se o popup for bloqueado, aparece o banner **"abra a fatura aqui"**.
- [ ] Banner de **troca agendada** aparece quando há `proximo_plano_id` pendente.
- [ ] **(OP)** → "Acesso restrito".
- [ ] Forçar limite de execuções/armazenamento/tokens IA do plano de teste bem baixo → confirmar bloqueio real: nova execução na Operação (`billing_pode_executar`), Consulta IA → 402, upload bloqueado por `billing_armazenamento_disponivel`. Execução **agendada** não deve ser re-bloqueada.

## 11. Tickets / Chamados
- [ ] **Abertura**: FAB na Operação (avulso) e listagem da Gestão. Grupo+subgrupo obrigatórios; **categoria obrigatória** (validação no modal).
- [ ] **Listagem**: cards de resumo (Em aberto = só não-aceitos / Em tratamento / Críticos / Finalizados), filtros, busca, semáforo SLA. Sem unidade → "Nenhuma unidade selecionada".
- [ ] **Visibilidade**: sem assignee, visível a toda a unidade; com assignee, só assignee+abridor+admin.
- [ ] **Detalhe**: assumir (só membro do subgrupo destino) → tratar → (opcional: devolver p/ informação, sem deadline) → responsável **conclui direto** (corrigido/parcial/não corrigido/cancelado/improcedente) → abridor pode **reabrir** se discordar.
- [ ] **Transferir** para outro grupo/subgrupo da mesma unidade → assignee volta a null, status volta a `aberto`, evento registra origem/destino.
- [ ] Observação obrigatória + evidências (até 5 fotos) em cada transição. Timeline imutável.
- [ ] Ação sem permissão → mensagem clara (sem expor erro técnico).
- [ ] **Categorias** (`/gestao/tickets/categorias`): árvore 2 níveis, categoria padrão "Não informada" não editável/excluível.
- [ ] **Config. SLA** (`/gestao/tickets/sla`): prazo aceite/resolução por prioridade (padrão unidade + override categoria); semáforo verde/amarelo/vermelho; pausa em aguardando_informacao.

## 12. Indicadores e Home
- [ ] `/gestao` (Home): funil de execuções por período (1h/6h/12h/24h/15d/30d) escopado pela **unidade ativa**; indicador de moderação por nível (N1/N2); "Últimas Execuções" com filtros; "Primeiros Passos".
- [ ] `/gestao/indicadores`: Top 5 checklists reprovados, Top 5 atividades não conformes, contadores de tickets, planos de ação por estado, tarefas (listas ativas/respostas/%concluído). Tudo escopado por unidade ativa + período.
- [ ] Trocar a **unidade ativa** no header e confirmar que Home/Indicadores mudam para os dados da outra unidade (sem misturar).

## 13. Workflows — ⏳ flag desabilitada (`WORKFLOWS_HABILITADO=false`)
- [ ] Confirmar que `/gestao/workflows/*`, a seção "Workflows em andamento" na Operação, a opção em Agendamentos e a opção no construtor de Perfis mostram **"indisponível"**/somem do menu.
- [ ] **NÃO revisar a fundo esta tela enquanto a flag estiver off** — só confirmar que está corretamente oculta em todos os pontos de entrada listados.
- [ ] Se a flag for religada para teste: criar workflow com 2+ estágios sequenciais, cada item com subgrupo obrigatório; condição de avanço (`todos_aprovados`/`todos_concluidos`/`qualquer_aprovado`); confirmar que executar o checklist avulso **não** conta para o workflow, só via `?wf_item=`.

## 14. Múltiplas empresas / vínculo por CPF
- [ ] Usar um CPF já cadastrado numa empresa para criar usuário em outra empresa → modo vínculo (A7); perfil/unidades **independentes por empresa** (`usuario_empresa`).
- [ ] Logar com esse CPF → trocar de empresa (se a UI expõe isso) ou confirmar que o contexto certo carrega.
- [ ] Tentar vincular o mesmo CPF de novo na mesma empresa → **409** "já está cadastrada nesta empresa".

## 15. Admin da empresa — escopo
- [ ] Logar como AE → confirmar que vê/gerencia **todas as unidades da própria empresa** ao trocar no seletor do header (estrutura, acessos, telas operacionais).
- [ ] Confirmar que AE **não** aparece em listagens/RLS de outra empresa (rodar `pentest/admin-empresa-rls.mjs` se existir).
- [ ] AE **não pode** se atribuir nem atribuir a outro o perfil "Admin de sistema" (guard de trigger).
- [ ] AE **não pode** editar catálogo de planos/preços, parceiros/provedores de IA, nem colunas financeiras.

## 16. Sistema (área AS)
- [ ] `/sistema/planos` e `/sistema/pacotes`: CRUD do catálogo (limites NULL = ilimitado).
- [ ] `/sistema/templates`: criar template manual (reusa `ChecklistMontador` modoTemplate) e via **"Gerar com IA"** → vira rascunho para revisão, nunca publica direto.
- [ ] `/sistema/integracoes-ia`: ativar/desativar provedor, ordem de failover, chave mascarada após salvar.
- [ ] `/sistema/termos`: editar termo → nova versão criada; usuários com versão antiga são questionados de novo no próximo acesso.
- [ ] `/sistema/onboarding`: ativar/desativar e editar (JSON) conteúdo de onboarding de uma tela; confirmar reflexo na tela de destino.
- [ ] `/sistema/parceiros`: listagem mostra empresas vinculadas, plano, valor, comissão estimada; resumo mensal (se simulável).
- [ ] **Exclusão definitiva de empresa**: só com `status='inativo'`; exige digitar nome exato + checkbox; cascata apaga unidades/grupos/usuários/checklists/execuções/planos/tickets/workflows; irreversível (testar só em empresa de descarte).

---

## 17. 🔴 Segurança (crítico)
- [ ] **Reset de senha** (`/recuperar-senha`): informar CPF → **código chega por WhatsApp/e-mail**; resposta sempre genérica (não revela se CPF existe); limite 3/hora.
- [ ] **Primeiro acesso** (cobrir em A8).
- [ ] **Reset disparado por gestor** (ícone chave em `/gestao/acessos/usuarios`) → limite 5/hora; gated por permissão.
- [ ] Código expira em 15min, máx. 5 tentativas; reuso de código já consumido falha.
- [ ] Notificações de ticket/plano disparam (WhatsApp/e-mail) respeitando turno.
- [ ] **(AS) WhatsApp** (`/sistema/whatsapp`): status/conectar funciona; "Trocar número/Desconectar" exige confirmação e para os disparos até novo QR.
- [ ] Rota interna sem credencial (ex.: `POST /catalogos/test-api`, `POST /catalogos/sync-all` sem `x-cron-secret`, `/api/usuarios/inativar` sem token) → **401**.
- [ ] Termo de Uso bloqueia uso até aceite (rolar até o fim para habilitar botão).

---

### Itens de backlog (não são smoke)
- Causa raiz nos **indicadores** (top causas / recorrência por área).
- Revisão completa tela-a-tela da tela **Plano** (só bugs corrigidos até agora).
- Funcionalidades modulares por empresa (habilitar/desabilitar telas por contrato) — ainda não implementado.
- Failover de WhatsApp com 2 números — não suportado hoje.
- Reconciliação financeira real da comissão de parceiro (hoje é só estimativa).
