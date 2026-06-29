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

> **Próximas telas (a adicionar conforme formos testando):** 3. Primeiro acesso · 4. Pré-cadastro QR · 5. Operação (lista) · 6. Execução de checklist · 7. PWA offline · … (segue a ordem do CENARIOS_DE_TESTE_MANUAL.md).
