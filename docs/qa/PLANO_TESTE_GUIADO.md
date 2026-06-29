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

> **Próximas telas (a adicionar conforme formos testando):** 2. Recuperar senha · 3. Primeiro acesso · 4. Pré-cadastro QR · 5. Operação (lista) · 6. Execução de checklist · 7. PWA offline · … (segue a ordem do CENARIOS_DE_TESTE_MANUAL.md).
