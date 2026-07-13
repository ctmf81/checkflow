# CheckFlow — Plano de Teste Guiado (tela a tela)

> Construído **incrementalmente**: uma tela por vez, à medida que cada teste é finalizado.
> Cada tela traz: **Funcionalidade · Usuários necessários · Pré-condições · Casos (passos → resposta esperada) · Riscos / pontos de atenção · Exceções**.
> Base de cenários: [CENARIOS_DE_TESTE_MANUAL.md](CENARIOS_DE_TESTE_MANUAL.md). Regras: `/biz` · Telas: `/uimap` · RLS: `/security`.
>
> Legenda de status por caso: ⬜ a testar · ✅ passou · ❌ falhou (anotar bug) · ⏭️ pulado.

---

## Matriz de usuários de teste (criar 1 vez, reaproveita em todas as telas)

Crie estes usuários para cobrir papéis e isolamento multi-tenant. Use CPFs de teste e senha conhecida.

| Apelido | Empresa | Perfil / Função | Para testar |
|---|---|---|---|
| **ADM_SIS** | — | Admin de **sistema** | `/sistema`, criar empresa, impersonar |
| **ADM_A** | Empresa A | Admin da **empresa** | gestão completa da A, plano/cobrança |
| **GEST_A** | Empresa A | Perfil gestor (permissões parciais) | telas de gestão por permissão |
| **OP_A** | Empresa A | Operação (`funcao=operacao` num subgrupo) | executar checklist |
| **N1_A** | Empresa A | N1 (`funcao=nivel_1`) | executar + moderar plano N1 |
| **N2_A** | Empresa A | N2 (`funcao=nivel_2`) | escalar/moderar plano N2 |
| **ADM_B** | Empresa B | Admin da empresa | provar isolamento (A não vê B) |
| **OP_B** | Empresa B | Operação | isolamento na operação |

> Dica: deixe **OP_A inativado** num momento para o caso "usuário inativado não loga" (ou crie um **INATIVO_A** dedicado).

---

## Tela 1 — Login (`/login`)

**Funcionalidade:** autenticação por **CPF + senha**; ao entrar, redireciona para o último ambiente usado (operação/gestão/sistema). Sessão persiste no aparelho.

**Usuários necessários:**
- 1 usuário **ativo** com senha conhecida → use o **seu admin de sistema** (cobre casos 1, 2, 4).
- 1 usuário **inativado** → **já criado** (abaixo).

**Dados de teste prontos:**
- 🔴 **Inativo:** CPF `807.554.326-22` · senha `CheckFlow@2026` (tel. 82988912651, e-mail ctmf81+inativo@gmail.com). status=inativo.
- Senha-padrão dos usuários de teste que eu criar: `CheckFlow@2026`.

**Pré-condições:** estar **deslogado**.

> ⚠️ **Pré-achados (do código), confirmar no teste:**
> - **Caso 3:** o login responde **"CPF não encontrado"** p/ CPF inexistente → **revela** que o CPF não existe (vaza enumeração). Tende a **FALHAR** o "não revela". Anote.
> - **Caso 6:** `buscar_email_por_cpf` **não** filtra status, então o inativo é encontrado e o `signInWithPassword` deve **suceder no auth** — o bloqueio (se houver) acontece **depois**. Confirmar se a app realmente barra o inativo (se entrar, é bug).

### Casos

| # | Cenário | Passos | Resposta esperada | Status |
|---|---|---|---|---|
| 1 | Login válido | CPF + senha corretos → Entrar | Entra e vai pro **último ambiente** (1ª vez: operação ou gestão conforme o perfil) | ⬜ |
| 2 | Sessão persiste | Logado, **recarregar** a página (F5) | **Não** pede login de novo; continua na mesma tela | ⬜ |
| 3 | CPF inexistente | CPF que não existe + qualquer senha | Erro **genérico** ("CPF ou senha inválidos") — **não** revela que o CPF não existe | ⬜ |
| 4 | Senha errada | CPF válido + senha errada | Erro genérico, sem detalhar qual campo | ⬜ |
| 5 | Campos vazios | Deixar CPF e/ou senha vazios → Entrar | Submit **bloqueado** (validação), sem chamada ao servidor | ⬜ |
| 6 | Usuário inativado | CPF do **INATIVO_A** + senha correta | **Não** loga (bloqueado/avisa) | ⬜ |
| 7 | Rota protegida sem sessão | Deslogado, abrir `/gestao` ou `/operacao` pela URL | Redireciona para **`/login`** | ⬜ |

**Riscos / pontos de atenção:**
- **Anti-enumeração:** casos 3 e 4 devem dar a **mesma** mensagem (não dá pra descobrir se um CPF existe).
- **Redirecionamento:** o destino pós-login depende do "último ambiente" salvo — na 1ª vez cai no ambiente padrão do perfil (operador → `/operacao`; gestor/admin → `/gestao`).
- **Persistência de sessão** (caso 2) é o que sustenta o PWA offline — se quebrar aqui, o offline também quebra.
- **Guarda de rota** (caso 7): o middleware deve mandar pro login **sem** vazar a tela protegida.

**Exceções já cobertas acima:** casos 3–7. (Recuperação de senha e primeiro acesso são **telas separadas** — viram Tela 2 e 3 quando chegarmos nelas.)

### ✅ Resultado (testado 2026-06-28)
| # | Resultado | Ação |
|---|---|---|
| 1, 2, 4, 5 | ✅ passou | — |
| 3 | ❌ vazava "CPF não encontrado" | **Corrigido** → mensagem genérica "CPF ou senha incorretos" |
| 6 | ❌ **inativo logava** (só pedia aceitar Termo) | **Corrigido** → login lê `status` e barra inativo com aviso |
| 7 | ⚠️ redireciona, mas **flash** da página antes | **Limitação conhecida** (auth via localStorage → guarda no cliente; dados protegidos por RLS, não carregam) |

**Pendência de segurança (defesa em profundidade):** o fix do caso 6 barra o inativo **na tela de login**. Um atacante chamando `signInWithPassword` direto (fora da página) ainda obtém sessão válida. Enforcement real do "inativo não acessa nada" = checar `status` no middleware/RLS → **candidato a pen test / hardening** (`/security`). Anotado.

---

## Tela 2 — Recuperar senha (`/recuperar-senha` → código → `/nova-senha`)

**Funcionalidade:** "Esqueci minha senha" por **CPF → código de 6 dígitos** (WhatsApp + e-mail) → define nova senha → loga com ela. Anti-abuso: máx. tentativas e limite de envios.

**Usuários necessários:**
- 1 usuário **ativo com telefone** → **já criado** (abaixo).
- *(opcional, p/ caso 5)* 1 usuário **sem telefone**.

**Dados de teste prontos:**
- 🟢 **Recuperar:** CPF `352.063.334-50` · telefone `82988912651` (seu WhatsApp recebe o código) · e-mail ctmf81+recuperar@gmail.com. Senha atual `CheckFlow@2026` (você vai trocá-la).

**Pré-condições:** WhatsApp conectado (✅ verificado); estar deslogado.

### Casos

| # | Cenário | Passos | Resposta esperada | Status |
|---|---|---|---|---|
| 1 | Recuperação feliz | "Esqueceu a senha?" → CPF `352.063.334-50` → enviar → **recebe código no WhatsApp** → digita → define nova senha → loga com ela | Loga com a **nova** senha | ⬜ |
| 2 | Código errado | Pedir código → digitar **errado** | Conta tentativa; após **5**, bloqueia | ✅ provado (1–5 "incorreto", 6º "máximo excedido") — invisível na UI, mas funciona |
| 3 | Código expirado | Pedir código, esperar **>15 min**, usar | Recusa, pede novo | ✅ |
| 4 | Limite de envios | Pedir **vários** códigos seguidos | Bloqueia após **3/hora** | ✅ provado (4º pedido não cria token) — invisível (resposta genérica), mas bloqueia |
| 5 | CPF sem telefone | CPF de usuário sem telefone | Resposta **genérica** (não revela) | ⬜ |
| 6 | CPF inexistente | CPF aleatório | Resposta **genérica** (anti-enumeração) | ✅ avança p/ "Verificar código" igual a um CPF real — anti-enumeração correto (testado 2026-06-28) |

**Riscos / pontos de atenção:**
- **Anti-enumeração:** casos 5 e 6 devem dar a **mesma** resposta de "se existir, enviamos o código" — não revelar se o CPF existe ou tem telefone.
- **Uso único / expiração** do código (15 min); tentativas limitadas (5); envios limitados (3/h) — todos já têm teste unitário (`passwordReset.unit.test.ts`), aqui validamos o **fluxo real** (WhatsApp chegando).
- **Canal:** código vai por WhatsApp **e** e-mail — confirme que chega em pelo menos um.

### 🐞 Bug encontrado e corrigido (2026-06-28)
**Caso 1 falhou de cara:** o código **não chegou em lugar nenhum** (nem WhatsApp nem e-mail). Causa: o CPF é gravado **com máscara** (`352.063.334-50`), mas as 3 rotas do fluxo de código (`solicitar-codigo`, `verificar-codigo`, `definir-senha`) **tiravam a máscara** antes de buscar (`.eq('cpf', cpfDigits)`) → não achavam o usuário → silenciavam (resposta genérica anti-enumeração). Afetava **TODOS os 8 usuários reais** → recuperação de senha **e** primeiro acesso estavam quebrados pra eles. **Corrigido** com `cpfVariantes()` (busca tolerante a CPF com/sem máscara) nas 3 rotas. **Re-testar o caso 1 após o deploy.**
> ⚠️ **Follow-up (não-bloqueador):** dados de CPF inconsistentes (8 com máscara, 13 sem). `usuarios/criar` e `usuarios/importar` dedupam por CPF stripped → risco de **duplicar** um usuário salvo com máscara. Candidato a **normalização de CPF** (migration + padronizar storage/lookup em tudo, incl. login).

**🐞 2º bug (mesmo caso 1):** depois do fix do CPF, o código passou a **chegar**, mas o passo 2 dava sempre "Código inválido ou expirado". Causa raiz: a tabela **`password_reset_tokens` não existe no banco** (migration `20260610060000` nunca aplicada) → `criarCodigoOtp` inseria o token, falhava (tabela ausente) e **engolia o erro** → o código era enviado mesmo assim, mas nunca validava. Recuperação de senha e primeiro acesso **nunca funcionaram em produção**. **Ações:**
> - **Aplicar a migration faltante:** `20260610060000_password_reset_tokens` (🔴 única realmente ausente — `onboarding_paginas` e `termos_uso` já existem; foram falso-positivo do sweep por nome de tabela errado).
> - **Hardening:** `criarCodigoOtp` agora **falha alto** se o token não persistir (não envia código morto). Assim, esse tipo de migration-faltante aparece na hora.

**🐞 3º bug (E1 — WhatsApp do OTP nunca entregava):** o e-mail chegava mas o WhatsApp não. Diagnóstico chamando o endpoint **real de prod**: `{"whatsapp":{"ok":false,"erro":"...exists:false...82988912651..."}}`. Causa: `enviarWhatsApp` mandava o telefone **sem o DDI 55** (`82988912651`); a Evolution responde `exists:false` e descarta. Só a rota de planos-de-ação adicionava o 55 (por isso avisos ao N1 funcionavam). **Corrigido** (`fd7883e`): normalização `+55` (idempotente) centralizada em `enviarWhatsApp`/`enviarWhatsAppMidia`. Afeta toda a base (qualquer telefone salvo sem 55). WhatsApp em si está saudável (envios diretos com 55 entregam).

> 💡 **Aprendizado:** vários casos (E2, E4, E6) "funcionam mas são invisíveis" por causa da resposta genérica anti-enumeração — no teste manual, confirmar pelo **efeito** (token criado? senha trocada?), não pela tela.

---

## Tela 3 — Primeiro acesso (`/primeiro-acesso` → `/nova-senha`)

**Funcionalidade:** usuário recém-criado define a 1ª senha com **CPF + código de boas-vindas** (token `primeiro_acesso`). Mesmas rotas do esqueci-a-senha (`verificar-codigo` → `definir-senha`), então já herda os fixes (tabela de tokens, CPF com máscara, DDI 55).

**Usuários necessários:** 1 usuário em estado de **primeiro acesso** (`primeiro_acesso=true`, com telefone) → **já criado** (abaixo).

**Dados de teste prontos:**
- 🟢 **Primeiro acesso:** CPF `167.497.728-03` · código `621234` (válido 2h, código conhecido — não precisa esperar WhatsApp).

**Pré-condições:** estar deslogado.

### Casos

| # | Cenário | Passos | Resposta esperada | Status |
|---|---|---|---|---|
| 1 | Primeiro acesso feliz | `/primeiro-acesso` → CPF `167.497.728-03` + código `621234` → Continuar → define senha (≥8) → loga | Loga com a senha nova; `primeiro_acesso` vira false | ⬜ |
| 2 | Código errado | CPF certo + código **errado** | "Código incorreto" (conta tentativa, bloqueia em 5) | ⬜ |
| 3 | Código expirado | token expirado | Recusa, pede novo *(me peça um token expirado p/ testar)* | ⬜ |
| 4 | Senha curta | na tela de nova senha, senha **< 8** | Bloqueia ("mínimo 8 caracteres") | ⬜ |
| 5 | Senhas não conferem | confirmar diferente da senha | Bloqueia ("não coincidem") | ⬜ |

**Riscos / pontos de atenção:**
- O código é de **uso único** — depois do caso 1, o token é consumido e `primeiro_acesso` vira false. Pra re-testar, me peça um **código novo** (eu regenero).
- A **entrega** do código de boas-vindas (WhatsApp/e-mail ao criar o usuário) é a mesma do E1 (já validada) e pertence à tela de **Usuários** (Tela 4).

### ✅ Resultado (testado 2026-06-29)
**P1–P5 todos ✅** — primeiro acesso feliz, código errado, **código expirado**, senha curta, senhas não conferem. **Nenhum bug novo** (reusa `verificar-codigo`/`definir-senha`, já corrigidas nas Telas 1–2). Tela 3 validada.

---

## Tela 4 — Pré-cadastro por QR (`/pre-cadastro/[empresaId]` + moderação)

**Funcionalidade:** página **pública** (acessada por QR) onde a pessoa se pré-cadastra → vira registro **pendente** na empresa-alvo → admin **modera** (aprova/rejeita) na tela de Usuários. Aprovar reusa `/api/usuarios/criar` (dispara código de 1º acesso).

**Usuários/dados necessários:**
- A página pública é **anônima** (deslogado).
- Empresa de teste: **QA Smoke 2026-06-24** (`6f1f2f09-5fe0-46aa-b760-20cf7abb938b`).
- Pra moderar: **Admin da empresa** da QA Smoke → CPF `716.212.012-10` · senha `CheckFlow@2026` (loga e cai direto no `/gestao` dela, sem impersonar). *(Alternativa: admin de sistema via "Acessar empresa".)*

**URLs:**
- Válida: `https://app.checkflow.digital/pre-cadastro/6f1f2f09-5fe0-46aa-b760-20cf7abb938b`
- Inválida: `https://app.checkflow.digital/pre-cadastro/00000000-0000-0000-0000-000000000000`

### Casos — página pública

| # | Cenário | Passos | Resposta esperada | Status |
|---|---|---|---|---|
| 1 | Pré-cadastro feliz | Abrir URL válida (deslogado) → vê "QA Smoke 2026-06-24" + form → nome/CPF/telefone (e-mail opcional) → Enviar | Tela "Pré-cadastro enviado!" | ⬜ |
| 2 | Nome vazio | deixar nome vazio → Enviar | "Informe seu nome." | ⬜ |
| 3 | CPF < 11 dígitos | CPF incompleto → Enviar | "CPF deve ter 11 dígitos." | ⬜ |
| 4 | Telefone sem DDD | telefone < 10 dígitos → Enviar | "Informe um telefone com DDD." | ⬜ |
| 5 | Empresa inválida | abrir a URL inválida | "Link de pré-cadastro inválido ou indisponível." | ⬜ |

### Casos — moderação (gestão)

| # | Cenário | Passos | Resposta esperada | Status |
|---|---|---|---|---|
| 6 | Ver + aprovar | (admin) Acessar empresa QA Smoke → `/gestao/acessos/usuarios` → "Pré-cadastros" (contador) → abrir → **Aprovar** (perfil + unidade) | Cria usuário + envia código de 1º acesso → some da fila, aparece nos usuários | ⬜ |
| 7 | Rejeitar | outro pendente → **Rejeitar** | some da fila (status rejeitado) | ⬜ |

**Riscos / pontos de atenção:**
- **Anti-enumeração/RLS:** anônimo só consegue **inserir** pendente (não lê/edita); admin da empresa B **não vê** pré-cadastros da QA Smoke.
- Aprovar **sem perfil** → bloqueia. CPF que já é usuário → "já cadastrada"/vínculo.
- `empresa_publica` filtra empresa inativa → URL de empresa inativa cai no mesmo "Link inválido".

### ✅ Resultado (testado 2026-06-29)
- **Parte A (pública):** caminho feliz ✅ + validações (nome / CPF curto / telefone sem DDD / link inválido) ✅.
- **Parte B (moderação):** **aprovar ✅ e rejeitar ✅**.
- **Bugs encontrados e corrigidos no caminho:**
  1. **Login do admin da empresa caía em "Nenhuma empresa selecionada"** (stale state no SessionContext) → corrigido (`4059383`).
  2. **Admin da empresa sem as permissões de Acessos** → não aprovava ("Você não tem permissão") → migration `20260629000000` (+ aplicado em prod).
  3. **"Admin de sistema" aparecia como opção de perfil** (moderação + criar/editar usuário) → removido (anti-escalada, `bcb4b3d`).
- **Re-cadastro após rejeição:** quem foi **rejeitado PODE** se pré-cadastrar de novo (cria novo pendente; rejeição não bloqueia — a moderação é a barreira a cada vez). Possível melhoria futura: bloquear/limitar re-envio após rejeição (anti-spam) — hoje aceita.
- **Pendente:** eyeball do isolamento multi-tenant (admin da QA Smoke não vê Pointer/Amadê). RLS já coberta no pentest.

---

## Tela 5 — Operação · lista de checklists (`/operacao`, aba Checklists)

**Funcionalidade:** área do operador. A aba **Checklists** mostra, de cima p/ baixo: **Não finalizados** (execuções que o próprio usuário iniciou e não concluiu), **Agendados pendentes** (execuções criadas por agendamento, sem operador, do subgrupo), **Workflows em andamento** (itens liberados do subgrupo), uma **busca**, e os **checklists publicados da unidade ativa** agrupados por **grupo → subgrupo**. Regra central: o operador vê **só os checklists dos seus subgrupos**; **admin (sistema/empresa) vê todos**. As abas (Checklists/Tarefas/Histórico/Documentos) só aparecem quando têm conteúdo.

**Usuários/dados prontos** (senha `CheckFlow@2026`, tel `82988912651`):
- 🟢 **OP_A (Linha 1):** CPF `390.485.712-60` · ctmf81+opl1@gmail.com — operador do subgrupo **Linha 1**, que tem o checklist publicado **"Teste Execuçãoção"** → deve **ver** esse checklist.
- 🟢 **OP_A2 (Linha 2):** CPF `512.983.460-70` · ctmf81+opl2@gmail.com — operador do subgrupo **Linha 2**, **sem** checklist publicado → **não** vê "Teste Execuçãoção" (lista vazia). Prova o isolamento por subgrupo.
- 🔵 **Admin da empresa** QA Smoke: CPF `716.212.012-10` — vê **todos** os checklists (todos os subgrupos).

**Estrutura de teste:** QA Smoke → **Unidade padrão** → grupo **Produção** → subgrupos **Linha 1** (1 checklist publicado) e **Linha 2** (vazio).

**Pré-condições:** estar deslogado. (Checklist "Teste Execuçãoção" já publicado em Linha 1 ✅.)

### Casos

| # | Cenário | Usuário | Passos | Resposta esperada | Status |
|---|---|---|---|---|---|
| 1 | Operador vê só o seu subgrupo | OP_A (L1) | logar → cai em `/operacao` (aba Checklists) | Vê **Produção › Linha 1** com **"Teste Execuçãoção"** | ⬜ |
| 2 | Isolamento por subgrupo | OP_A2 (L2) | logar → `/operacao` | **Não** vê "Teste Execuçãoção"; lista **vazia** (abas sem conteúdo somem → tela só com a busca) | ⬜ |
| 3 | Admin vê todos | Admin empresa (716) | acessar QA Smoke → ambiente Operação | Vê **todos** os checklists da unidade (qualquer subgrupo) | ⬜ |
| 4 | Busca | OP_A | digitar parte do nome; depois um texto sem match | Filtra pelo nome; sem match → "Nenhum resultado para..." | ⬜ |
| 5 | Abrir checklist | OP_A | tocar no card | Navega p/ `/operacao/[id]` (execução — Tela 6) | ⬜ |
| 6 | "Não finalizados" | OP_A | abrir o checklist, sair **sem** finalizar, voltar à lista | Aparece a seção **Não finalizados** no topo, com **Continuar** e **Não executar** (motivo obrigatório) | ⬜ |

**Riscos / pontos de atenção:**
- **Visibilidade ≠ segurança:** o filtro por subgrupo é **client-side** (espelho da regra de exibição). A barreira real é o **RLS por unidade** — OP_A2 até **lê** o checklist por RLS (mesma unidade), mas a UI o esconde por subgrupo. Isolamento entre **empresas** (A×B) é RLS, coberto no pentest.
- **"Porta dupla":** checklist liberado por **workflow** **não** aparece na lista avulsa (só no card "Workflows em andamento") — evita execução solta que não vincula/avança o fluxo.
- **Abas dinâmicas:** se a aba ativa fica sem conteúdo, pula p/ a primeira com conteúdo; operador sem nada vê tela "vazia" (só a busca).
- **Sem unidade ativa** → "Nenhuma unidade selecionada" (o stale-state que travava o admin foi corrigido em `4059383`; reconfirmar que **operador** entra direto na unidade).

**Exceções:**
- Operador de subgrupo **sem checklist** publicado → lista vazia (caso 2). (Idêntico visualmente a "operador sem subgrupo".)
- Checklist em **rascunho/inativo** → não aparece (só `status='publicado'`).
- Checklist de **outro subgrupo** → não aparece (caso 2).
- **Offline (Tela 7):** a lista offline mostra **só** checklists marcados "Disponível offline". Hoje "Teste Execuçãoção" está `permite_offline=false` → não apareceria offline; marcar offline é teste da gestão/Tela 7.

### ✅ Resultado (testado 2026-06-30)
**Casos 1–7 todos ✅** (operador vê só seu subgrupo, isolamento OP_A2, admin vê todos, busca, abrir card, "Não finalizados", logout). **3 bugs/decisões no caminho:**
1. 🔴→✅ **Operador travava em "Nenhuma unidade selecionada"** (todo não-admin, não só o admin do `4059383`): faltava self-select RLS em `usuario_empresa`/`usuario_grupo` → `SessionContext` recebia `minhasEmpresas=[]`. **Migration `20260630000000`** (aplicada em prod; verificada sob RLS: lê só a própria linha, escrita segue admin-only). Ver `/db` e `/security`.
2. 🔴→✅ **Operador puro sem logout** no header da Operação (só tinha Instalar + Gestão-admin) → menu de usuário com **Sair** (commit `8427336`).
3. 🟡 **Persistência da execução** (caso 6): observado que sair pelo "Voltar" do navegador não joga na lista "Não finalizados" (isso é registro no servidor, só via "Continuar depois"). **Decisão de produto:** abrir = **sempre execução nova e limpa**; o **rascunho local foi removido** (autosave/restauração), commit `e016ebb`. Quem não usa "Continuar depois"/Finalizar perde o progresso (intencional). Retomada legítima (`?exec=`) segue carregando do servidor. Plano de ação só vira registro no finalizar (nunca órfão). Ver `/biz`.

---

## Tela 6 — Execução de checklist (`/operacao/[id]`)

**Funcionalidade:** preencher e finalizar um checklist. Tipos com **validação automática** (sim/não, número, múltipla escolha) ou sem (texto, foto…); **atividades dependentes** (aparecem conforme a resposta do pai); o **progresso conta só as visíveis**; **Finalizar** → resultado **aprovado** (tudo conforme) ou **reprovado** (qualquer não conformidade) → **PDF sob demanda**. Reprovar atividade marcada **"gera plano de ação"** abre o plano. **"Continuar depois"** (se pausável) e **"Não executar"** (com motivo).

**Usuário:** **OP_A** (`390.485.712-60` · `CheckFlow@2026`).

**Checklist de teste:** **"QA Execução (Tela 6)"** (criado em Linha 1, id `4af9d9c4-…`):
- **Seção "Inspeção":** `EPI em uso?` (sim/não, esperado **SIM**) · `Temperatura (°C)` (número **2–8**) · `Nº do lote` (texto) · `Itens verificados` (múltipla: Higiene OK / Temperatura OK / **Embalagem danificada = inválida**).
- **Seção "Plano de ação e foto":** `Há vazamento?` (sim/não, esperado **NÃO**, **gera plano de ação**, SLA 24h) · `Descreva o vazamento` (texto, **só aparece se vazamento = SIM**) · `Foto da área` (obrigatória).
- **Motivos de não execução:** "Área interditada" (checklist) · "Sensor com falha" (atividade).

**Pré-condições:** OP_A logado, na Operação. ⚠️ Ao finalizar **com plano** (caso 5), o **N1 da Linha 1 é o Admin (716) = seu número** → você **vai receber** o WhatsApp/e-mail de aviso (esperado).

### Casos

| # | Cenário | Passos | Esperado | Status |
|---|---|---|---|---|
| 1 | Caminho feliz → **Aprovado** | EPI=Sim, Temp=5, Lote=ABC, marcar só Higiene+Temperatura, Vazamento=Não, anexar foto → **Finalizar** | Resultado **Aprovado** → tela de conclusão + botão **Gerar PDF** | ⬜ |
| 2 | Validação numérica | Temp=**12** (fora de 2–8) | Campo sinaliza **não conforme** | ⬜ |
| 3 | **Reprovado** | EPI=**Não** (ou marcar "Embalagem danificada") → preencher o resto → Finalizar | Resultado **Reprovado** | ⬜ |
| 4 | Atividade **dependente** | Responder `Há vazamento?` = **Sim** | aparece **"Descreva o vazamento"**; mudar p/ Não → **some** | ⬜ |
| 5 | **Plano de ação** | Vazamento=**Sim** → na atividade reprovada, botão **"Abrir plano de ação"** → observação (+ foto opcional) → Finalizar | Plano criado **junto** da execução; no **Histórico**: "Reprovado · Aguarda N1"; chega aviso N1 | ⬜ |
| 6 | Obrigatória **bloqueia** | deixar a **Foto** (ou EPI) sem responder → Finalizar | **Bloqueia** com a lista de pendentes | ⬜ |
| 7 | Progresso conta visíveis | observar o contador com vazamento Não vs Sim | progresso considera **só as atividades visíveis** | ⬜ |
| 8 | **Continuar depois** | preencher parte → **Continuar depois** → voltar | volta à lista; aparece em **"Não finalizados"**; "Continuar" **restaura** (do servidor) | ⬜ |
| 9 | **Não executar** (checklist) | em "Não finalizados" → **Não executar** → motivo **"Área interditada"** | execução vira **não executado**; sai da pendência | ⬜ |
| 10 | Não executar **atividade** | numa obrigatória → "Não consigo executar esta atividade" → **"Sensor com falha"** | atividade marcada não-executada (conta como respondida) | ⬜ |

**Riscos / pontos de atenção:**
- **Reprovado = QUALQUER** atividade não conforme (sim/não ≠ esperado, número fora da faixa, múltipla com opção inválida). Texto/foto não validam.
- O **plano de ação** só vira registro **ao Finalizar** (atrelado à execução) — sair antes **não** persiste (decisão da Tela 5). **Não há rascunho local**: sair sem "Continuar depois"/Finalizar **perde** o progresso.
- **PDF é sob demanda** (botão), não automático.
- **Foto** = 1 por atividade (comprimida ~300–500 KB); evidência de plano aceita até **5**.

**Exceções:**
- Obrigatória sem resposta → bloqueia finalização (caso 6).
- "Não executar" **exige motivo** (casos 9/10).
- Dependente só conta no progresso quando **visível** (caso 7).
- **Fora deste checklist** (precisam de aparelho/câmera ou config): **catálogo, localização (GPS), vídeo, assinatura, QR/barcode** → ficam para um teste no **celular** (junto da Tela 7 PWA).

### ✅ Resultado (testado 2026-06-30)
**Casos 1–10 todos ✅.** **2 bugs encontrados e corrigidos** (commit `ae73ff6`):
1. 🔴→✅ **Plano de ação deixava finalizar SEM preencher** (caso 5): item reprovado com `gera_plano_acao` não exigia o plano — a validação só checava obrigatórias. Agora o Finalizar **bloqueia** ("Abra o plano de ação para: …") até o plano ser preenchido (observação obrigatória no modal).
2. 🔴→✅ **Campo pendente em seção colapsada inalcançável** (caso 6): seções são acordeão; o erro citava um campo de outra seção e o operador não chegava nele. Agora o Finalizar **abre a seção do 1º pendente e rola até ela** (`irParaAtividade`).

**Edge case mapeado (decisão: deixar como está):** responder → criar plano → "Continuar depois" → "Não executar checklist". O "Continuar depois" salva só as **respostas** (servidor), **não** o plano (finalize-only) → o plano digitado se perde ali. A não-execução então descarta as respostas e fecha como `não executado` — **sem plano órfão, sem inconsistência**. Na retomada, a regra do fix #1 força recriar o plano antes de finalizar. Ver `/biz`.

**Tipos não cobertos aqui** (exigem câmera/aparelho/config): catálogo, GPS, vídeo, assinatura, QR → **Tela 7 (celular)**.

---

## Tela 7 — PWA / Execução **offline** (📱 celular)

**Funcionalidade:** o app é um **PWA instalável**; **offline vale só para a Operação**. Checklists marcados **"Disponível offline"** (`permite_offline`) ficam executáveis sem rede; ao finalizar offline, vão p/ uma **fila local** e **sincronizam sozinhos** ao reconectar (o **plano de ação é replayado junto**).

**Usuário:** **OP_A** (`390.485.712-60` · `CheckFlow@2026`) — no **celular**.
**Checklist offline:** **"QA Execução (Tela 6)"** (já marcado `permite_offline=true`).

**Preparação (com internet, ANTES de cortar a rede):**
1. Logar como OP_A no **navegador do celular** (login é **online-única**).
2. Tocar **"Instalar"** → instalar o PWA (ícone na tela inicial).
3. Abrir o **app instalado** → **Operação** → **aguardar ~20s** (pré-baixa a definição + cacheia a rota). *Sem esse passo, o checklist pode não abrir offline.*

### Casos

| # | Cenário | Passos | Esperado | Status |
|---|---|---|---|---|
| 1 | Instalar | no navegador, botão **"Instalar"** | instala; abre em **tela cheia**; no app instalado o "Instalar" **some** | ⬜ |
| 2 | Lista offline | **modo avião** → abrir Operação | mostra **só** os checklists offline ("QA Execução…") + **aviso de sem conexão** | ⬜ |
| 3 | Abrir offline | tocar no checklist offline | abre e **renderiza** o formulário sem rede | ⬜ |
| 4 | Executar + foto offline | preencher tudo (EPI, temp, lote, múltipla, **foto**) → **Finalizar** | tela **"salvo no aparelho"** (fila local) | ⬜ |
| 5 | Reprovar + plano offline | Vazamento=**Sim** → abrir plano (observação + foto) → Finalizar | finaliza offline com o **plano na fila** | ⬜ |
| 6 | **Sincronizar** | **voltar a internet** | indicador **"Enviando…"**; execução **e** plano aparecem no **Histórico/Gestão**; chega aviso N1 (seu nº) | ⬜ |
| 7 | Recarregar offline | preencher parte → **recarregar a página** offline | **começa do zero** (decisão 2026-06-30: **sem rascunho local**) | ⬜ |
| 8 | Login offline | deslogar → tentar logar offline | **não loga** (login exige internet) | ⬜ |
| 9 | Idempotência | sincronizar com conexão **instável** | **não duplica** execução nem plano | ⬜ |

**Riscos / pontos de atenção:**
- Só os `permite_offline=true` aparecem offline; o resto **some** no modo avião.
- **Sem rascunho local** (decisão da Tela 6): recarregar/sair offline **sem finalizar** perde o progresso → o jeito de salvar offline é **Finalizar** (enfileira).
- **Foto** offline é capturada e guardada na fila (blob) → enviada na sincronização.
- **Workflow / execução agendada** NÃO finalizam offline (bloqueiam, orientam "Continuar depois") — não testável com este checklist (sem workflow); fica anotado.
- Catálogo offline = valores cacheados sem imagem — este checklist não tem catálogo (n/a aqui).

**Exceções:**
- Sem o pré-cache (não esperou os ~20s online) → pode não abrir offline. Refazer a preparação.
- Sincronização parcial (rede caiu no meio) → a fila reenvia; **não duplica** (caso 9).

### ✅ Resultado (testado 2026-06-30, no celular)
**Casos 1–9 OK.** **2 fixes** (commit `c4857b1`):
1. 🔴→✅ **Lista offline sem aviso de conexão** (caso 2): adicionado banner **"Sem conexão — exibindo só os checklists disponíveis offline"** (`useOnlineStatus`).
2. 🔴→✅ **"Continuar depois" falhava em silêncio offline** (`getUser` volta null → return sem feedback): agora **desabilitado offline** com a dica "finalize para salvar no aparelho" + guard que avisa. ("Continuar depois" exige servidor — cria `em_andamento`.)
- **Caso 9 (idempotência):** confirmado **pelo código** (header por upsert do id do cliente; respostas/planos "criar só se não existem") — não testado à mão. Sem duplicação em reenvio.
- **Pendência mapeada (deixar como está):** a **fila de sync é presa ao aparelho/navegador** (IndexedDB). Deslogar **não perde** (sobrevive ao `signOut`; sincroniza quando um operador abre a Operação **nesse mesmo device** online — `PendingSync` roda só na Operação, ao carregar/voltar a rede/30s, atribuindo ao operador original). Risco: se aquele device nunca mais for usado online, os pendentes ficam parados ali. Não é bug (natureza do PWA offline). Possível melhoria futura: indicador "pendências neste aparelho" / alerta antes de deslogar com fila.

---

---

## Tela 8 — Gestão › Checklists (`/gestao/checklists` + montador)

**✅ Concluída — 2026-07-01 (14 casos, 8.1–8.4)**

Bug 16: reativação de checklist inativo era impossível (nenhum botão) → implementado toggle "Mostrar inativos" + botão "Reativar". Commit `a843ede`.

---

## Tela 9 — Gestão › Acessos

### 9.1 Usuários (`/gestao/acessos/usuarios`) — ✅ 9.1.1–9.1.4 OK (2026-07-01)

Bug 17: perfil "Gestão do Grupo" aparecia N vezes no dropdown (uma por empresa). Fix: filtro por `empresa_id` em `UsuarioModal.tsx` (`d9c5412`).
Bug 18+19: mensagens WhatsApp/email sem link (1º acesso + reset admin). Fix: links embutidos nos templates.
Bug 20: reset_admin enviava código + link redundante. Fix: só link.
Bug 21: admin 716 não aparecia na própria lista. Fix: migration `20260701000000` (RLS policy) + "Minha conta" no header.

**9.1.5 (guard último admin) ✅ — Bug 24 corrigido (2026-07-02):** trigger e UI guard contavam admins inativos. Fix: `JOIN usuarios WHERE status = 'ativo'` no trigger + UI guard. Migration `20260702010000`, commit `634ddbd`.

### 9.2 Pré-cadastro / Moderação (`/gestao/acessos/usuarios` → aba Pré-cadastros) — ✅ 9.2.1–9.2.6 OK (2026-07-13)

**Usuários necessários:** ADM_A (admin ativo da empresa), link de pré-cadastro gerado via QR code da empresa.

| # | Cenário | Passos | Esperado | Status |
|---|---------|--------|----------|--------|
| 9.2.1 | Pré-cadastro via QR | Acessa link de pré-cadastro → preenche dados → envia | Aparece como "pendente" na aba moderação | ✅ 2026-07-13 |
| 9.2.2 | Aprovar pré-cadastro | Admin abre moderação → escolhe perfil + unidade → Aprovar | Usuário criado, recebe acesso, some da fila | ✅ 2026-07-13 |
| 9.2.3 | Rejeitar pré-cadastro | Admin clica Rejeitar | Some da fila, usuário não é criado | ✅ 2026-07-13 |
| 9.2.4 | Campos obrigatórios | Envia pré-cadastro sem nome/CPF/telefone | Validação impede envio | ✅ 2026-07-13 |
| 9.2.5 | CPF duplicado | Envia pré-cadastro com CPF já cadastrado na empresa | Mensagem de erro adequada | ✅ 2026-07-13 |
| 9.2.6 | Isolamento multi-tenant | Pré-cadastro da Empresa A não aparece na Empresa B | Listas separadas por empresa | ✅ 2026-07-13 |

**Bug 51 (2026-07-13)** — 9.2.2 revelou: a moderação aprovava com **unidade opcional** → usuário nascia sem escopo para operar. Fix: exige ao menos 1 unidade (quando a empresa tem unidade ativa) na moderação (`ModeracaoPreCadastroModal`), no cadastro direto (`UsuarioModal`) e no backstop de servidor (`/api/usuarios/criar`). Commits `a508466`/`35b5e55`/`2e0df97`.

### 9.3 Perfis (`/gestao/acessos/perfis`) — ⏳ roteiro pronto (a rodar)

**Usuários necessários:** ADM_A (admin da empresa) + um GESTOR de grupo (perfil não-admin, p/ 9.3.5) + um usuário comum p/ atribuir o perfil novo (9.3.8).
**Regras (ver `/biz`):** lista mostra perfis da empresa **+ perfis de sistema** (badge "sistema", somente leitura). Recursos **core** `home/usuarios/perfis` sempre aparecem no construtor. Se o plano tiver serviços, o construtor mostra só os recursos liberados (+ core). Perfil **público** pode ser atribuído por gestor de grupo; não-público só admin.

| # | Cenário | Passos | Esperado | Status |
|---|---------|--------|----------|--------|
| 9.3.1 | Criar perfil | "Novo" → nome + marcar permissões (recurso×ação) → salvar | Aparece na lista da empresa | ⬜ |
| 9.3.2 | Editar permissões | Abrir o perfil → alterar marcações → salvar → reabrir | Permissões persistem | ⬜ |
| 9.3.3 | Perfil de sistema é read-only | Abrir um perfil com badge "sistema" | Campos bloqueados; sem botão excluir | ⬜ |
| 9.3.4 | Excluir perfil (não-sistema) | Ícone lixeira → confirmar | Some da lista (bloqueia/erro coerente se houver usuários no perfil) | ⬜ |
| 9.3.5 | Público × não-público | Marcar "público"; logar como gestor de grupo e tentar atribuir | Gestor só atribui perfis **públicos** (+ o atual do usuário) | ⬜ |
| 9.3.6 | Recursos core sempre presentes | Abrir o construtor | `home/usuarios/perfis` sempre aparecem | ⬜ |
| 9.3.7 | Gating por plano (se aplicável) | Empresa com plano que exclui um módulo | Recurso do módulo não aparece no construtor | ⬜ |
| 9.3.8 | Menu por permissão | Atribuir o perfil a um usuário → logar com ele | Sidebar mostra só o que o perfil libera | ⬜ |
| 9.3.9 | Isolamento multi-tenant | Perfil criado na Empresa A | Não aparece na Empresa B (só os de sistema são comuns) | ⬜ |

### 9.4 Turnos (`/gestao/acessos/turnos`) — ✅ 9.4.1–9.4.11 OK (2026-07-02)

| # | Cenário | Status |
|---|---------|--------|
| 9.4.1–9.4.3 | CRUD básico (criar/editar/excluir turno) | ✅ |
| 9.4.4–9.4.6 | Períodos de escala (criar, nomear, proteção ao reduzir) | ✅ |
| 9.4.7 | Banner "fora do turno" (modo aviso) | ✅ |
| 9.4.8 | Bloqueio no login (modo login) | ✅ |
| 9.4.9 | Notificação bloqueada para fora do turno (SQL) | ✅ |
| 9.4.10 | Sem restrição (modo desativado) | ✅ |
| 9.4.11 | Escala: `usuario_esta_no_turno()` correto fora do ciclo | ✅ |

**Bug 22 (2026-07-02):** turno `12x36` da QA Smoke tinha `ativo = false` → `usuario_esta_no_turno()` retornava `true` por NOT FOUND (sem turno = sem restrição). Fix: ativado via SQL. **Regra:** ao inativar turno, desvinculá-lo dos usuários.

**Aprendizado timezone:** função e SQL Editor rodam em UTC. `hora_inicio` dos turnos é interpretada em UTC. Admins que configuram em BRT precisam somar +3h.

### 9.5 Empresa/Unidades (`/gestao/acessos/empresa`) — ⏳ roteiro pronto (a rodar)

**Usuários necessários:** ADM_A (admin da empresa). Para 9.5.7, uma 2ª empresa.
**Regras (ver `/biz`, `/db`):** unidade é **soft-delete** (`status='inativo'`), **nunca hard delete** (cascade apagaria grupos/checklists/tickets/... da unidade). Reativar é pela **edição**. Guard: a empresa deve ter **ao menos 1 unidade ativa** (não dá pra inativar a última). Unidade inativa **some do seletor global** do header e do modal de usuário. Toda listagem é escopada pela **unidade ativa** do header.

| # | Cenário | Passos | Esperado | Status |
|---|---------|--------|----------|--------|
| 9.5.1 | Criar unidade | "Nova" → nome → salvar | Aparece na lista e no **seletor de unidade** do header | ⬜ |
| 9.5.2 | Editar unidade | Ícone lápis → mudar nome → salvar | Nome atualizado | ⬜ |
| 9.5.3 | Inativar unidade | Ícone PowerOff → confirmar | Vira "Inativa"; **some do seletor** do header e do modal de usuário; dados preservados | ⬜ |
| 9.5.4 | Reativar unidade | Editar a inativa → status ativo → salvar | Volta como "Ativa" e ao seletor | ⬜ |
| 9.5.5 | Guard última unidade ativa | Tentar inativar a única unidade ativa | Bloqueia: "a empresa deve ter ao menos uma unidade ativa" | ⬜ |
| 9.5.6 | Editar dados da empresa | Alterar dados da empresa (nome/etc) → salvar | Persistem | ⬜ |
| 9.5.7 | Isolamento multi-tenant | Unidade da Empresa A | Não aparece na Empresa B | ⬜ |
| 9.5.8 | Escopo por unidade ativa | Trocar a unidade no seletor do header | Listagens (checklists, grupos, indicadores...) refletem a unidade escolhida | ⬜ |

---

> **Próximas telas (a adicionar conforme formos testando):** as demais seguem a ordem do `CENARIOS_DE_TESTE_MANUAL.md`. **Já validadas nesta bateria:** Telas 1–8, 9 (9.1/9.2/9.4 ✅; 9.3/9.5 roteiro pronto), 10 (Grupos), 11 (Tickets), 12 (Planos de Ação). **Próximo planejado:** fechar 9.3/9.5 → Tela 13 (§8 Tarefas).
