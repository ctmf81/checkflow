# Plano de Testes — CheckFlow (manual, página por página)

Convenção: ✅ Caminho feliz | ⚠️ Exceção/erro | 🔒 Permissão/RLS
Marque [ ] ao executar. Anote bugs encontrados com print + passos.

---

## 1. Autenticação (`(auth)/`)

### `/login`
- ✅ Login com e-mail/senha válidos → redireciona conforme perfil (gestão/operação/sistema)
- ✅ Usuário vinculado a 1 empresa só → entra direto
- ✅ Usuário vinculado a 2+ empresas → `EscolherEmpresaModal` aparece SEMPRE (testar logout/login de novo — não pode persistir)
- ⚠️ E-mail/senha inválidos → mensagem de erro clara
- ⚠️ Usuário sem nenhuma `unidade`/`empresa` vinculada → o que acontece? (tela vazia ou erro tratado?)
- ⚠️ Conta desativada (se existir flag) → bloqueia login

### `/recuperar-senha` → `/nova-senha`
- ✅ Solicitar recuperação com e-mail existente → recebe e-mail
- ⚠️ E-mail inexistente → mensagem genérica (não vaza se existe ou não)
- ✅ Definir nova senha com link válido → loga com a nova
- ⚠️ Link expirado/usado de novo → erro tratado

---

## 2. Gate de Termos de Uso (`TermosGate`)

- ✅ Primeiro acesso → modal bloqueante aparece, impede uso do sistema
- ✅ Botão "aceitar" fica desabilitado até rolar o texto até o fim
- ✅ Aceitar grava `termos_aceitos_em` + `termos_versao_aceita`; modal não aparece de novo
- ✅ Admin publica nova versão em `/sistema/termos` → usuários com versão antiga veem o modal de novo no próximo acesso
- ⚠️ Fechar/recarregar a página com o modal aberto → continua bloqueando
- 🔒 Vale para gestão, operação E sistema (testar nas 3 áreas)

---

## 3. Modal "Escolher Empresa" (`EscolherEmpresaModal`)

- ✅ Usuário multi-empresa: lista todas as empresas vinculadas
- ✅ Selecionar uma → carrega unidades/dados daquela empresa
- ✅ Trocar de empresa numa nova sessão → pode escolher outra (não fica preso na última)
- ⚠️ Empresa fica inativa/sem unidades → o que aparece?
- ⚠️ Fechar o modal sem escolher → deve continuar bloqueando (não deixar passar sem empresa)

---

## 4. Gestão — Dashboard (`/gestao`)
- ✅ Indicadores carregam corretamente para a empresa/unidade ativa
- ⚠️ Empresa sem dados (nova) → estado vazio tratado, sem erro

---

## 5. Checklists (`/gestao/checklists`)

### Listagem
- ✅ Lista filtra por unidade/empresa ativa
- ✅ Busca/filtro por status (rascunho/publicado/inativo) funciona
- ⚠️ Lista vazia → estado vazio

### Criar (`/novo` → `/novo/montar`)
- ✅ Criar checklist rascunho → salvar metadados → montar seções/atividades
- ✅ Adicionar cada tipo de atividade (sim_nao, número, texto, múltipla escolha, catálogo, foto, vídeo, localização, assinatura, data_hora) e configurar
- ✅ Atividade dependente: configurar `atividade_pai_id` + `valor_gatilho`, inclusive múltipla escolha (array)
- ✅ Configurar `tempo_guarda_meses`
- ✅ Publicar → cria snapshot em `checklist_versoes`, aparece em Operação
- ⚠️ Tentar publicar sem nenhuma seção/atividade → deve bloquear com mensagem
- ⚠️ Tentar publicar atividade obrigatória sem configuração mínima (ex: número sem min/max) → validação

### Editar existente (`/[id]`, `/[id]/montar`)
- ✅ Editar metadados de checklist publicado
- 🔒 **Checklist publicado não pode ter estrutura mutada** → tentar editar seções/atividades de um publicado: deve forçar nova versão, não mutar a existente
- ⚠️ Inativar checklist em uso por workflow publicado → trigger `trg_checklist_bloquear_inativacao` deve bloquear com mensagem clara (contagem de workflows)
- ✅ Inativar checklist sem workflow vinculado → some da Operação, continua na lista de gestão

### Motivo de Não Execução
- ✅ Configurar motivo tipo `checklist` e tipo `atividade` na criação
- ✅ Verificar reflexo na Operação (ver seção 11)

---

## 6. Grupos / Subgrupos (`/gestao/grupos`, `/[id]/subgrupos`)
- ✅ Criar/editar/excluir grupo e subgrupo
- ⚠️ Excluir grupo/subgrupo em uso (por checklist, usuário, workflow item) → deve bloquear ou avisar dependências
- ✅ Subgrupo aparece corretamente nos seletores (checklist, workflow, usuário)

---

## 7. Acessos (`/gestao/acessos/`)

### Usuários (`/usuarios`)
- ✅ Criar usuário → vincular a unidade(s), perfil, **turno** (novo campo)
- ✅ Editar usuário existente → trocar turno, trocar perfil
- ✅ Usuário sem turno → nunca restringido (validar via teste de notificação, seção 13)
- ⚠️ Criar usuário com e-mail/CPF duplicado → erro tratado
- ⚠️ Remover vínculo de unidade de um usuário com execuções pendentes → o que acontece?
- 🔒 Vincular usuário a empresas diferentes → testar fluxo multi-empresa (seção 3)

### Perfis (`/perfis`)
- ✅ Criar perfil customizado → marcar permissões por recurso/ação (incluindo as novas: `agendamentos.ver/criar/editar/deletar`)
- ✅ Perfis `is_system = true` (Administrador) já têm as permissões de agendamentos (migração concedeu automaticamente) — conferir
- 🔒 Criar perfil SEM permissão de `agendamentos.criar` → vincular usuário → confirmar que ele NÃO consegue criar agendamento (nem na UI nem via API/RLS direto)
- 🔒 Perfil só com `agendamentos.ver` → consegue visualizar mas não editar/excluir
- ⚠️ Editar perfil removendo permissão de usuário já logado → próxima ação dele deve respeitar a nova regra (sem precisar recriar sessão? testar)

### Empresa/Unidades (`/empresa`)
- ✅ Criar/editar unidade, `grupo_label`/`subgrupo_label`
- ⚠️ Excluir unidade com checklists/usuários/execuções vinculados → deve bloquear ou em cascade controlado

---

## 8. Configurações (`/gestao/configuracoes/`)

### Documentos
- ✅ Upload, listagem, exclusão de documentos
- ⚠️ Upload de arquivo muito grande / tipo não suportado

### Não-execução (`/nao-execucao`) e Causa-raiz (`/causa-raiz`)
- ✅ CRUD de motivos/causas
- ⚠️ Excluir motivo em uso por checklist/execução → bloquear ou tratar

### Turnos (`/turnos`) — **NOVO**
- ✅ Criar turno **administrativo**: configurar dias da semana com janelas distintas (ex: seg-sex 08-17h, sáb 08-11h, dom sem janela)
- ✅ Criar turno **escala**: configurar `data_referencia`, `hora_inicio`, `horas_trabalho`, `horas_folga` (testar 12x36 e 24x48)
- ✅ Editar turno existente (trocar tipo, horários)
- ✅ Ativar/desativar turno (`ativo`)
- ⚠️ Criar turno administrativo sem nenhum dia configurado → usuário fica sempre fora do turno — confirmar que isso é o esperado e visível na UI
- ⚠️ Criar turno escala sem `data_referencia` → função trata como "sempre dentro" (`return true`) — validar se isso é desejável ou se a UI deve exigir o campo
- 🔒 Excluir turno vinculado a usuários → `on delete set null` deve desvincular sem erro

**Teste funcional crítico — `usuario_esta_no_turno()`:**
- ✅ Administrativo: usuário dentro da janela → `true`; fora → `false`; em dia sem config → `false`
- ✅ Administrativo: janela que cruza meia-noite (ex: 22h-06h) → testar `v_inicio > v_fim`
- ✅ Escala 12x36: calcular manualmente 3-4 pontos no tempo (início do turno, meio, início da folga, meio da folga, virada de ciclo) e comparar com retorno da função
- ✅ Usuário sem `turno_id` → sempre `true`
- ⚠️ Turno com `ativo = false` → tratado como "sem turno" (sempre `true`)? Confirmar comportamento esperado

### Catálogos (`/catalogos`)
- ✅ Criar catálogo com atributos, popular valores, upload de imagem
- ✅ Buscar valor na execução (ver seção 11)
- ⚠️ Excluir catálogo em uso por atividade → bloquear/tratar

### Formatação (`/formatacao`)
- ✅ Alterar labels → refletem nas telas correspondentes

---

## 9. Agendamentos (`/gestao/agendamentos`) — **permissões novas**

- ✅ Criar agendamento (workflow ou checklist), configurar recorrência (a cada X horas/dias/meses) e `referencia_inicio`
- ✅ `proxima_execucao` calculada corretamente pelo trigger
- ✅ Pausar/ativar/excluir pela tela
- 🔒 Usuário SEM permissão `agendamentos.criar` → botão "novo agendamento" oculto ou ação bloqueada com erro RLS tratado
- 🔒 Usuário SEM permissão `agendamentos.editar`/`deletar` → não consegue pausar/excluir
- 🔒 Usuário só com `agendamentos.ver` → vê a lista mas ações de escrita ficam indisponíveis
- ⚠️ Tentar acessar a tela sem permissão `agendamentos.ver` → lista vazia (RLS) ou tela bloqueada?
- ✅ **pg_cron**: confirmar `cron.job` ativo, rodando a cada 10min, e `agendamentos_processar()` disparando workflows/checklists no horário esperado
- ⚠️ Agendamento com `referencia_inicio` no passado → dispara imediatamente na próxima execução do cron?
- ⚠️ Dois agendamentos vencendo ao mesmo tempo → `for update skip locked` evita duplicidade/concorrência

---

## 10. Workflows (`/gestao/workflows/[id]`)

- ✅ Criar workflow → adicionar estágios sequenciais → adicionar itens paralelos com checklist + subgrupo
- ✅ Configurar `condicao_avanco` (todos_aprovados / todos_concluidos / qualquer_aprovado) por estágio
- ✅ Publicar workflow → iniciar execução (`workflow_iniciar`) → validar liberação do primeiro estágio
- ✅ Completar checklists do estágio → trigger avança automaticamente conforme condição
- ⚠️ Estágio sem nenhum checklist → bloquear ao salvar/publicar
- ⚠️ Reprovação que não satisfaz condição de avanço → execução fica `bloqueado`
- ✅ Cancelar execução → status `cancelado`
- 🔒 Tentar inativar checklist usado por workflow publicado → trigger bloqueia (já listado em checklists, reforçar aqui)
- ✅ Picker com seletor de Grupo+Subgrupo, pré-selecionado corretamente

---

## 11. Operação (`/operacao`, `/operacao/[id]`)

### Listagem (`/operacao`)
- ✅ Mostra checklists publicados da unidade ativa, agrupados por grupo/subgrupo
- ✅ Itens de workflow "liberados" aparecem antes dos avulsos, na seção própria
- ⚠️ Unidade sem checklists publicados → estado vazio
- ✅ Seletor de unidade no header funciona e recarrega a lista

### Execução (`/operacao/[id]`)
Para CADA tipo de atividade, testar caminho feliz + exceção:
- ✅ `sim_nao`: marcar conforme/não conforme → validação compara com `esperado`
- ✅ `numero`: dentro do range = conforme; ⚠️ fora do range = não conforme; ⚠️ valor não numérico bloqueado pelo input
- ✅ `multipla_escolha`: seleção válida = conforme; ⚠️ qualquer opção `e_valido=false` selecionada = não conforme; testar single e múltipla seleção
- ✅ `catalogo`: busca, seleção, exibição de atributos + imagem
- ✅ `texto`: máscara aplicada corretamente (9, A, *); ✅ QR scan no Chrome Android; ⚠️ QR scan em outro browser → erro claro
- ✅ `foto`: captura obrigatória bloqueia avanço se `obrigatoria=true`; ⚠️ permissão de câmera negada
- ✅ `video`: captura/seleção da galeria; ⚠️ vídeo com `lastModified` >1h → alerta visível
- ✅ `localizacao`: GPS automático preenche; ⚠️ permissão de localização negada → mensagem clara; sem input manual possível
- ✅ `assinatura`: comportamento atual (reservado para app nativo) — confirmar que não quebra no navegador
- ✅ `data_hora`: input datetime-local funciona, `automatico` preenche

### Atividades dependentes
- ✅ Atividade só aparece quando resposta do pai bate com `valor_gatilho` (single e múltipla escolha)
- ⚠️ Mudar resposta do pai depois de responder o dependente → dependente some/zera corretamente

### Motivo de não execução
- ✅ Atividade obrigatória com motivos `atividade`: link "não consigo executar" → seleciona motivo → marca como não executado → conta como respondida → pode desfazer
- ✅ Checklist com motivos `checklist`: link "não foi possível executar" → modal motivo+observação → cria execução `nao_executado`
- ⚠️ Tentar finalizar checklist com atividade obrigatória pendente (sem resposta nem motivo) → bloqueia com mensagem

### Finalização
- ✅ `resultado = aprovado` quando tudo conforme; `reprovado` quando qualquer não conforme
- ✅ `data_expiracao` calculada certo conforme `tempo_guarda_meses`
- ✅ Execução vinda de workflow (`?wf_item=`): cria com `em_andamento` → linka → conclui → trigger avança pipeline
- ⚠️ Perda de conexão durante execução → dados não se perdem / app trata erro de salvamento

---

## 12. Sistema — Super-admin (`/sistema/`)

### `/sistema` (overview) e `/sistema/empresas/[id]`
- ✅ Lista empresas, abrir detalhes
- 🔒 Acesso restrito a `is_admin_sistema()` — usuário comum não acessa

### `/sistema/whatsapp`
- ✅ Gerar QR, conectar instância Evolution API, status atualiza a cada 5s
- ⚠️ `connectionStatus: close` (Redis indisponível) → mensagem de erro reconhecível

### `/sistema/termos` — **NOVO**
- ✅ Editar texto, publicar nova versão → grava novo registro (não sobrescreve), aparece no histórico
- ✅ Após publicar, usuários com versão antiga são questionados de novo (testar com 2 contas)
- ⚠️ Tentar publicar com texto vazio → bloqueia com mensagem
- 🔒 Usuário não-admin-sistema não acessa/edita (RLS `termos_uso_admin`)
- ✅ Histórico mostra versão vigente marcada e ordenado por data desc

---

## 13. WhatsApp / Notificações de Moderação (cross-feature)

Cenário ponta a ponta — combina turnos + permissões + workflows:
- ✅ Gerar não conformidade numa atividade → todos N1 da área recebem mensagem (e-mail sempre; WhatsApp só quem está DENTRO do turno)
- ✅ Usuário fora do turno: NÃO recebe WhatsApp, recebe e-mail, e CONSEGUE moderar pelo sistema normalmente
- ✅ Usuário sem turno cadastrado: sempre recebe WhatsApp (não restringido)
- ✅ Mesma regra vale para N2
- ⚠️ Momento exatamente na borda da janela do turno (ex: 17:00:00) → comportamento consistente com `< v_fim`
- ⚠️ Falha no envio (Evolution API fora do ar) → log de erro tratado, não trava o fluxo de moderação

---

## 14. Segurança / RLS (cross-cutting)

- 🔒 Usuário de Empresa A não enxerga dados de Empresa B (checklists, execuções, agendamentos, turnos, usuários)
- 🔒 Usuário de Unidade X não enxerga execuções/checklists de Unidade Y na mesma empresa
- 🔒 Tentar editar `agendamentos` via chamada direta ao Supabase (sem permissão de perfil) → RLS rejeita
- 🔒 Tentar ler/escrever `termos_uso` como não-admin-sistema → RLS permite leitura, bloqueia escrita
- 🔒 Tentar ler `turnos` de outra empresa → RLS bloqueia
- ✅ Rodar suíte `pentest/run.mjs` (29 testes) e confirmar 29/29 passando após todas as mudanças desta sessão

---

## 15. Regressão geral (smoke test pós-deploy)

- ✅ Login em cada um dos 3 ambientes (gestão/operação/sistema) com pelo menos 1 conta de cada perfil
- ✅ Criar → publicar → executar 1 checklist simples ponta a ponta
- ✅ Criar → publicar → iniciar 1 workflow simples ponta a ponta
- ✅ Confirmar que o build no Railway subiu sem erro (logs limpos)
- ✅ Confirmar `cron.job_run_details` sem falhas recentes

---

## Priorização sugerida

1. 🔴 **Alta**: seções 9, 13, 14 (permissões/turnos/RLS — features novas desta sessão, maior risco de regressão e segurança)
2. 🔴 **Alta**: seção 11 (Operação — caminho mais usado, todos os tipos de atividade)
3. 🟡 **Média**: seções 5, 7, 10 (checklists, acessos, workflows — fluxos centrais já estáveis, mas afetados indiretamente)
4. 🟢 **Baixa**: seções 4, 6, 8 (telas auxiliares, menor risco)
