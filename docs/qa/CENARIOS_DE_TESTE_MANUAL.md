# CheckFlow — Cenários de Teste Manual (por tela)

> Guia para teste manual: **caminho feliz** + **exceções / casos de borda**, tela a tela.
> Marque `[x]` ao validar. Última atualização: 2026-06-27.
> Referências: `/biz` (regras), `/uimap` (telas), `/security` (RLS), `/qa` (testes automatizados).

**Pré-requisitos para testar bem:**
- Ter 2 empresas (A e B) com unidades, p/ validar isolamento multi-tenant.
- Usuários com papéis diferentes: Admin de sistema, Admin da empresa, Operação, N1, N2.
- Um celular Android (ex: Galaxy A26) para PWA/offline e responsividade.

---

## 1. Autenticação

### 1.1 Login (`/login`)
**Caminho feliz**
- [ ] Login com **CPF + senha** corretos → redireciona para o último ambiente (operação/gestão/sistema).
- [ ] Sessão persiste ao recarregar a página (não pede login de novo).

**Exceções**
- [ ] CPF inexistente → erro genérico (não revela se o CPF existe).
- [ ] Senha errada → erro, sem detalhar.
- [ ] Campos vazios → bloqueia o submit.
- [ ] Usuário **inativado** → não consegue logar.
- [ ] Abrir `/gestao` ou `/operacao` **sem sessão** → redireciona para `/login`.

### 1.2 Recuperar senha (`/recuperar-senha` → código → `/nova-senha`)
**Caminho feliz**
- [ ] Informar CPF → recebe **código por WhatsApp** → digita o código → define nova senha → loga com ela.

**Exceções**
- [ ] CPF sem telefone cadastrado → resposta genérica (anti-enumeração), não revela.
- [ ] Código **errado** → conta tentativa; após 5 tentativas, bloqueia.
- [ ] Código **expirado** (>15 min) → recusa, pede novo.
- [ ] Pedir vários códigos seguidos → limite de 3/hora.

### 1.3 Primeiro acesso (`/primeiro-acesso`)
**Caminho feliz**
- [ ] Usuário recém-criado recebe código de boas-vindas → informa CPF + código → define senha.

**Exceções**
- [ ] Código inválido/expirado → recusa.

### 1.4 Pré-cadastro público (`/pre-cadastro/[empresaId]`) — NOVO
**Caminho feliz**
- [ ] Abrir o link (deslogado/anônimo) → vê **nome/logo da empresa** + formulário.
- [ ] Preencher nome, CPF, telefone (e e-mail/observação opcionais) → enviar → mensagem de sucesso.
- [ ] O envio aparece como **pendente** na moderação (gestão).

**Exceções**
- [ ] CPF com menos de 11 dígitos → erro de validação.
- [ ] Telefone sem DDD → erro.
- [ ] Nome vazio → erro.
- [ ] `empresaId` inválido/empresa inativa → tela "Link inválido ou indisponível".
- [ ] Enviar 2x o mesmo CPF → ambos viram pendentes (a deduplicação ocorre na aprovação, não no envio).

---

## 2. Operação (`/operacao`) — área do operador

### 2.1 Lista de checklists (aba Checklists)
**Caminho feliz**
- [ ] Operador vê **só os checklists publicados dos seus subgrupos** (admin vê todos).
- [ ] Seções no topo: "Não finalizados", "Agendados pendentes", "Workflows em andamento" (quando há).
- [ ] Tocar num checklist abre a execução.

**Exceções**
- [ ] Operador **sem subgrupo** → lista vazia.
- [ ] Checklist em **rascunho/inativo** → não aparece.
- [ ] Checklist liberado via **workflow** → não aparece na lista avulsa (evita porta dupla).
- [ ] Empresa atingiu **limite do plano** → ao finalizar, bloqueia (ver 2.3).

### 2.2 Execução de checklist (`/operacao/[id]`)
**Caminho feliz**
- [ ] Responder atividades dos vários tipos: sim/não, número, texto, múltipla escolha, **catálogo**, foto, vídeo, data/hora, localização, assinatura, padrão.
- [ ] Atividade **dependente** aparece só quando o gatilho é satisfeito (sim/não ou múltipla escolha).
- [ ] Progresso conta só atividades visíveis.
- [ ] Finalizar → resultado **aprovado** (tudo conforme) ou **reprovado** (qualquer não-conforme) → gera PDF sob demanda.

**Exceções**
- [ ] Deixar **atividade obrigatória** sem resposta → bloqueia finalização com a lista de pendentes.
- [ ] Foto/vídeo acima do limite (foto MAX_FOTO_MB, vídeo 10s) → bloqueia com aviso.
- [ ] Reprovar item com **gera_plano_acao** → exige/permite abrir plano de ação.
- [ ] "Continuar depois" (se pausável) → salva parcial e volta; retomar via "Não finalizados" restaura as respostas.
- [ ] Checklist **não pausável** → sem atalho de sair; só "Não executar" com motivo.
- [ ] "Não executar" → exige motivo obrigatório (nem admin descarta livre).
- [ ] Falha de upload de **evidência obrigatória** → aborta finalização sem deixar execução fantasma.
- [ ] Catálogo sem valores configurados → mensagem "catálogo não configurado".

### 2.3 PWA / Execução OFFLINE — NOVO (testar no celular)
**Preparação (com internet):** instalar o PWA (botão "Instalar"), marcar um checklist como "Disponível offline" na gestão, abrir a Operação online e **aguardar ~20s** (pré-carregamento).

**Caminho feliz**
- [ ] Botão "Instalar" aparece **no navegador** e some quando aberto pelo **app instalado**.
- [ ] Instalar → app na tela inicial, abre em tela cheia.
- [ ] Modo avião → a lista mostra **só os checklists offline** + aviso de conexão.
- [ ] Abrir um checklist offline → renderiza (inclusive **catálogo** com valores, sem imagem).
- [ ] Preencher (com foto) e **Finalizar** offline → tela "salva no aparelho".
- [ ] Reprovar + abrir **plano de ação** offline → finaliza mesmo assim.
- [ ] Voltar a internet → indicador "Enviando…" → execução **e plano** aparecem no histórico/gestão.

**Exceções**
- [ ] Tentar finalizar offline um checklist de **workflow** ou **execução agendada** → bloqueia, orienta "Continuar depois".
- [ ] Respostas em andamento + recarregar a página (online ou offline) → **começa do zero** (decisão 2026-06-30: NÃO há rascunho local; só "Continuar depois"/Finalizar persiste). Ver `/biz`.
- [ ] Login: estando offline e sem sessão salva → não consegue logar (login exige internet — logar antes de ir a campo).
- [ ] Sincronizar com conexão instável → não duplica execução nem plano (idempotente).
- [ ] Imagem de catálogo offline → não aparece (esperado: só texto).

### 2.4 Histórico (aba Histórico)
**Caminho feliz**
- [ ] Lista as execuções **do próprio usuário** nesta unidade, com status e badge.
- [ ] Expandir mostra planos de ação; baixar/gerar PDF.
- [ ] **Mobile/PWA**: nome do checklist legível, badges quebram abaixo (responsivo).

**Exceções**
- [ ] Sem execuções → estado vazio.
- [ ] Execução sem PDF ainda → botão "gerar PDF".

### 2.5 Documentos (aba Documentos) + Consulta Inteligente
**Caminho feliz**
- [ ] Vê documentos (POP/IT) com etapas (texto, imagens em carrossel, vídeo YouTube/Drive).
- [ ] Consulta Inteligente → pergunta em linguagem natural → resposta da IA.

**Exceções**
- [ ] Sem tokens de IA no plano → Consulta bloqueada/avisa.
- [ ] Vídeo com link inválido → não quebra a etapa.

### 2.6 Tarefas (aba Tarefas)
**Caminho feliz**
- [ ] Vê listas dos seus subgrupos; abre sua instância; marca tarefas, observação/evidência, check-in.
- [ ] Mostra prazo até o bloqueio de edição.

**Exceções**
- [ ] GPS indisponível no check-in → conclui como "sem localização".
- [ ] Janela de edição expirada → não edita mais.
- [ ] Lista encerrada (data/qtd) → não abre nova instância.

### 2.7 Abrir Ticket (FAB)
- [ ] Abre chamado avulso para um grupo/subgrupo, com prioridade, categoria, evidências.
- [ ] Exceção: campos obrigatórios (grupo+subgrupo) → bloqueia.

---

## 3. Gestão — Checklists

### 3.1 Listagem (`/gestao/checklists`)
**Caminho feliz**
- [ ] Lista os checklists da **unidade ativa**; criar novo; usar modelo; duplicar; inativar.
**Exceções**
- [ ] Inativar checklist **em uso por workflow publicado** → bloqueia, lista os nomes.
- [ ] Duplicar cross-unidade → recria catálogos no destino, com aviso/confirmação.

### 3.2 Montador (`/gestao/checklists/[id]/montar`, `ChecklistMontador`)
**Caminho feliz**
- [ ] Criar seções e atividades (todos os tipos); definir obrigatória/crítica/gera plano; tempo de guarda; modo de execução; **"Disponível offline"** (NOVO).
- [ ] Associar subgrupo (obrigatório ao publicar) e motivos de não execução.
- [ ] Publicar → aparece na operação.
**Exceções**
- [ ] Publicar **sem subgrupo** → bloqueia.
- [ ] Editar publicado → exige "Liberar edição" + republicar (gera versão).
- [ ] Atividade de catálogo sem catálogo escolhido → avisa.
- [ ] Toggle offline gravado mesmo se a migration não estiver aplicada (best-effort — não quebra o save).

---

## 4. Gestão — Acessos

### 4.1 Usuários (`/gestao/acessos/usuarios`)
**Caminho feliz**
- [ ] Listar usuários da empresa; criar (CPF, telefone, perfil, unidades) → dispara código de 1º acesso (WhatsApp/email).
- [ ] Editar perfil/unidades; resetar senha; inativar; importar (CSV/API).
- [ ] (admin sistema) "Entrar como" (impersonar).
**Exceções**
- [ ] CPF já existente em outra empresa → **vincula** a esta empresa (não recria).
- [ ] CPF já vinculado a esta empresa → erro "já cadastrada".
- [ ] Remover perfil de Admin do **último admin** → bloqueado (guard).
- [ ] Telefone duplicado → erro.

### 4.2 Pré-cadastro: QR + Moderação — NOVO
**Caminho feliz**
- [ ] Botão "QR pré-cadastro" → mostra QR + link; copiar funciona.
- [ ] Botão "Pré-cadastros" mostra **contador** de pendentes.
- [ ] Abrir moderação → lista pendentes → **Aprovar** (escolher perfil + unidades) → cria usuário + envia código → some da fila e aparece nos usuários.
- [ ] **Rejeitar** → confirma → some da fila (status rejeitado).
**Exceções**
- [ ] Aprovar **sem escolher perfil** → bloqueia.
- [ ] Aprovar CPF que já é usuário da empresa → mensagem de "já cadastrada"/vinculação.
- [ ] Admin da empresa A **não vê** pré-cadastros da empresa B (RLS).
- [ ] Anônimo tentar **ler/editar** pré-cadastros (fora do form) → negado (RLS).
- [ ] Tela funciona mesmo antes de aplicar a migration (contador = 0, sem erro).

### 4.3 Perfis (`/gestao/acessos/perfis`)
**Caminho feliz**
- [ ] Criar/editar perfil marcando recursos/ações (árvore tri-state).
**Exceções**
- [ ] Editar perfil **não apaga** as permissões existentes (bug histórico — validar).
- [ ] Tri-state: marcar recurso inteiro marca todas as ações; desmarcar limpa.

### 4.4 Empresa/Unidades (`/gestao/acessos/empresa`)
- [ ] Editar dados da empresa; criar/editar unidades; labels (grupo/subgrupo).
- [ ] Exceção: campos obrigatórios; responsividade mobile do form.

### 4.5 Turnos (`/gestao/acessos/turnos`, `TurnoModal`)
**Caminho feliz**
- [ ] Criar turno administrativo (dias/horários) ou escala (12x36 etc.); definir modo "fora do turno".
**Exceções**
- [ ] Escala com data de referência no passado → cálculo correto do ciclo.
- [ ] Modo "bloquear" fora do turno → usuário não acessa fora; admin isento no login.
- [ ] Modo "aviso" → banner, mas acessa.

---

## 5. Gestão — Grupos / Subgrupos
- [ ] Criar grupo/subgrupo; adicionar usuário ao subgrupo com **função** (—/Operação/N1/N2).
- [ ] Exceção: usuário precisa estar na empresa antes de entrar no grupo; reenviar senha usa código WhatsApp.

---

## 6. Gestão — Tickets

### 6.1 Listagem (`/gestao/tickets`)
- [ ] Filtra por subgrupo do usuário (+ os que abriu; admin vê todos); abas abertos/fechados/todos; cards de resumo (responsivos no mobile).
### 6.2 Detalhe (`/gestao/tickets/[id]`)
**Caminho feliz**
- [ ] Assumir (só do subgrupo de destino); responder/concluir (corrigido/parcial/não corrigido); transferir; reabrir (abridor).
**Exceções**
- [ ] Ticket já assumido → some para os demais.
- [ ] Ação bloqueada por RLS → **não** grava evento na timeline (sem falha silenciosa).
- [ ] Improcedência → só com permissão `ticket.cancelar`.
### 6.3 Categorias / SLA
- [ ] CRUD de categorias; SLA por prioridade + override por categoria.
- [ ] Exceção (mobile): tabela de SLA com scroll horizontal; inputs não quebram.

---

## 7. Gestão — Planos de Ação (`/gestao/planos-acao`)
**Caminho feliz**
- [ ] Lista planos abertos; moderação N1 → N2; causa raiz + recorrência; anexos.
- [ ] "Ver execução completa" abre o PDF da execução.
**Exceções**
- [ ] N1/N2 são **níveis** (não pessoas): a moderação depende da função no subgrupo; admin = N2.
- [ ] Operador comum **não** modera.
- [ ] Plano criado offline (ver 2.3) aparece aqui após sincronizar.

---

## 8. Gestão — Tarefas (`/gestao/tarefas`)
- [ ] Criar lista (itens com flags obs/evidência/checkin), janela de abertura (data/qtd) e de edição; publicar; avisar WhatsApp.
- [ ] Indicadores de execução (modal): progresso, quem respondeu.
- [ ] Exceção: "o que vier primeiro" encerra a abertura; admin vê todas.

---

## 9. Gestão — Agendamentos (`/gestao/agendamentos`)
- [ ] Criar agendamento recorrente (checklist/workflow) com referência e recorrência; editar.
- [ ] Dispara via pg_cron → pendência aparece na Operação (subgrupo do checklist; admin vê todas).
- [ ] Exceção: sem catch-up (próximo slot futuro).

---

## 10. Gestão — Indicadores / Home (`/gestao` e `/gestao/indicadores`)
**Caminho feliz**
- [ ] Funil de execuções por período; planos de ação; tickets; tarefas — **da unidade ativa**.
- [ ] Filtros de período; cliques levam às telas filtradas.
**Exceções**
- [ ] **Mobile**: grids de KPI em 2 colunas, números não estouram, labels truncam (validar todos os cards).
- [ ] Filtro de período no mobile mostra só 1h/12h/24h; "Execuções" usa dropdown.
- [ ] Trocar de unidade no header recarrega os números.

---

## 11. Gestão — Padrões / Variáveis (`/gestao/padrao/*`)
- [ ] Criar variáveis (atributos+valores); criar padrão (variáveis + instâncias combinação→faixa min/max).
- [ ] Exceção: nome obrigatório; ≥1 variável; combinação completa por instância; sem duplicadas; faixa exige ≥1 limite; min≤max.

---

## 12. Gestão — Configurações
- [ ] **Catálogos**: criar catálogo (campo-chave + até 4 atributos + imagem); valores; sync por API.
- [ ] **Documentos**: POP/IT com etapas (texto/imagens/vídeo); Consulta Inteligente.
- [ ] **Não-execução**: motivos por tipo (checklist/atividade); guard ≥1 por tipo.
- [ ] **Causa raiz**: cadastro; abertura na execução; moderação.
- [ ] **Formatação**: labels (grupo/subgrupo).
- [ ] **Notificações**: templates por tipo/canal; variáveis disponíveis.
- [ ] Exceção (mobile): forms em 1 coluna; sync de catálogo com URL inválida → trata erro.

---

## 13. Gestão — Plano & Cobrança (`/gestao/plano`)
**Caminho feliz**
- [ ] Admin da empresa vê plano/uso; assinar/trocar plano; comprar pacote; ver cobranças.
**Exceções**
- [ ] Empresa sem CNPJ válido → não cria cliente Asaas.
- [ ] Troca entre pagos → vale no fim do período (banner "troca agendada").
- [ ] Não-admin abre a página → restrita (apesar de o item aparecer no menu).
- [ ] Limite de execuções atingido → bloqueia novas execuções na operação.

---

## 14. Sistema (super-admin)
- [ ] **Empresas**: criar/editar; abas Administrador/Pagamento/Parceiro; **excluir empresa inativa** (exige digitar nome + checkbox; cascata).
- [ ] **Planos/Pacotes**: CRUD do catálogo.
- [ ] **Parceiros**: vínculo, percentual, comissão estimada.
- [ ] **Integrações IA**: ordem/chave/modelo por provedor (chave mascarada); failover.
- [ ] **WhatsApp**: QR/conexão Evolution; trocar número/desconectar.
- [ ] **Templates**: curadoria + "Gerar com IA" (rascunho).
- [ ] **Onboarding**: liga/desliga e edita conteúdo por tela.
- [ ] **Termos**: editar (gera nova versão).
- [ ] **Health/Alertas**: métricas em tempo real; alertas.
- [ ] Exceção: excluir empresa **ativa** → bloqueado; nome digitado errado → não exclui.

---

## 15. Transversais (testar em todas as telas)

### 15.1 Multi-tenant / Segurança (RLS)
- [ ] Usuário da empresa A **nunca** vê dados de B (checklists, execuções, tickets, usuários, pré-cadastros, catálogos, documentos).
- [ ] Tentar abrir um registro de outra unidade por URL/ID → bloqueado (não encontrado).
- [ ] Admin da empresa gerencia toda a empresa cross-unidade, mas não outra empresa, e não vira admin de sistema.

### 15.2 Responsividade mobile / PWA
- [ ] Header no mobile: seletor de unidade trunca; perfil oculto; só ícone de troca de módulo.
- [ ] Dashboards/indicadores: grids 2 colunas, sem overflow.
- [ ] Modais (instalar app, formulários): sem barra de rolagem horizontal; campos não cortados.
- [ ] Histórico da operação: nome legível, badges abaixo.

### 15.3 Feedback / robustez
- [ ] Ações destrutivas pedem confirmação (não usam `confirm()` nativo).
- [ ] Salvar/erro mostram toast; falha de RLS não exibe "sucesso" falso.
- [ ] Sair (logout) limpa a sessão e volta ao login.

### 15.4 Billing (enforcement)
- [ ] Atingir limite de execuções → bloqueia (online); offline registra e o admin acerta depois.
- [ ] Capacidade de armazenamento esgotada → bloqueia upload de mídia (online).

---

## Como reportar um bug encontrado
Para cada falha, anote: **tela**, **passos**, **resultado esperado vs. obtido**, **dispositivo/navegador** (e se era PWA/offline). Bugs de lógica pura → vira teste unitário (`/qa`); falha de RLS → rodar/ampliar o pentest (`/security`).
