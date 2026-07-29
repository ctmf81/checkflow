# Ambientes: DEV e PRODUÇÃO

Guia de como o CheckFlow passa a ter um ambiente de testes separado, e como
promover uma funcionalidade para produção quando você decidir.

> **Antes disso, tudo era produção.** Cada `git push` publicava direto para os
> clientes e as migrations eram coladas à mão no banco de produção. Este
> documento existe para acabar com as duas coisas.

---

## 1. O desenho

| | DEV | PRODUÇÃO |
|---|---|---|
| Branch | `develop` | `main` |
| Banco | projeto Supabase de dev | projeto Supabase de prod |
| App | serviços `*-dev` no Railway | serviços atuais no Railway |
| Asaas | `ASAAS_ENV=sandbox` | `ASAAS_ENV=production` |
| Deploy | automático a cada push em `develop` | **só quando você mandar** |
| Dados | massa de teste | dados reais de clientes |

Fluxo: `feature/xyz` → `develop` (você testa) → `main` (produção).

---

## 2. Setup inicial — o que **você** faz (uma vez)

Estas etapas exigem os painéis, aos quais o Claude não tem acesso.

### 2.1 Criar o projeto Supabase de dev
1. supabase.com → **New project** → nome `checkflow-dev`, mesma região do prod.
2. Guarde a senha do banco (aparece só uma vez).
3. **Project Settings → Database → Connection string (URI)**: copie.
4. **Project Settings → API**: copie a *Project URL* e a *anon/publishable key*.

### 2.2 Criar `.env.migrations` na raiz do repo
Arquivo **gitignorado** — nunca vai para o Git.

> ⚠️ **Use o Session pooler, NÃO a conexão direta.** O host direto
> (`db.<ref>.supabase.co`) só resolve por **IPv6** — em rede IPv4 dá
> `no such host` e o `db push` falha. Pegue a string em **Connect → Direct →
> "Session pooler"** (host `aws-N-<região>.pooler.supabase.com`, porta **5432**,
> user `postgres.<ref>`). A porta 6543 (Transaction pooler) NÃO serve p/ migrations.

```
# formato Session pooler (troque SENHA, ref e região pelos do seu projeto)
SUPABASE_DB_URL_DEV=postgresql://postgres.<ref-dev>:SENHA@aws-1-us-east-2.pooler.supabase.com:5432/postgres
SUPABASE_DB_URL_PROD=postgresql://postgres.<ref-prod>:SENHA@aws-N-<regiao>.pooler.supabase.com:5432/postgres
```

Ambiente já montado (2026-07-24): dev = ref `yidewiphflurzqgczrxh`, região `us-east-2`.

### 2.3 Baseline do banco de PRODUÇÃO (uma vez, obrigatório)
As 172 migrations existentes já foram aplicadas à mão, mas o banco não registra
isso. Sem este passo, o CLI tentaria reaplicar todas.

No **SQL Editor do Supabase de produção**, cole e rode `supabase/BASELINE_PROD.sql`.
Ele só registra o histórico — não executa migration nem toca em dado.

Conferir: `npm run db:status:prod` — tudo deve aparecer como aplicado.

### 2.4 Montar o schema no banco de DEV
```bash
npm run db:status:dev   # mostra o que falta (não altera nada)
npm run db:push:dev     # aplica as 172 migrations no banco novo
```

> ⚠️ **Aqui pode dar trabalho.** É a primeira vez que esse histórico é replicado
> do zero; alguma migration antiga pode depender de um passo manual que nunca foi
> versionado. Se travar, o plano B é copiar o schema do prod:
> `npx supabase db dump --db-url "$SUPABASE_DB_URL_PROD" -f schema.sql --schema-only`
> e aplicar no dev. Descobrir isso **agora**, no dev, é justamente o objetivo.

### 2.5 Secrets do GitHub (anti-pausa do Supabase)
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|---|---|
| `SUPABASE_PROD_URL` | `https://pswdjdlirylxgscohcfi.supabase.co` |
| `SUPABASE_PROD_ANON_KEY` | anon key de produção |
| `SUPABASE_DEV_URL` | Project URL do dev |
| `SUPABASE_DEV_ANON_KEY` | anon key do dev |

O workflow `.github/workflows/keep-alive-supabase.yml` consulta os dois projetos
a cada 3 dias, evitando a pausa por inatividade (~7 dias no plano free). Alvo sem
secret é pulado — dá para começar só com produção.

Para testar na hora: aba **Actions → Keep-alive Supabase → Run workflow**.

### 2.6 Serviços de DEV no Railway (etapa 2 — a que custa)

Plano do usuário: **Hobby**, ~US$ 6/mês. Regra combinada: **ligar só para
testar** — deixar os serviços de dev **parados** o resto do tempo (o Railway cobra
por recurso consumido enquanto rodam). Assim o custo extra fica em centavos a
poucos dólares.

1. No projeto do Railway: **New → GitHub Repo** → mesmo repo, **branch `develop`**.
2. Crie dois serviços, cada um com **Root Directory** apontando para a pasta do
   app (o Dockerfile de cada um é detectado ali):
   - `web-dev` → root `apps/web`
   - `api-dev` → root `apps/api`

3. **Variáveis do `api-dev`** (lidas em RUNTIME — basta setar no painel):
   - `SUPABASE_URL` / `SUPABASE_SECRET_KEY` → do projeto **dev**
   - `ASAAS_ENV=sandbox` + `ASAAS_API_KEY_SANDBOX`
   - `APP_URL` → URL pública do `web-dev`
   - copie o resto do `api` de produção (CRON_SECRET, INTERNAL_API_SECRET,
     ASAAS_WEBHOOK_TOKEN, VAPID_*, etc.) — pode reusar os mesmos em dev.

4. **Variáveis do `web-dev`** — aqui está o pulo do gato. As `NEXT_PUBLIC_*` são
   assadas no BUILD. O `apps/web/Dockerfile` já declara os `ARG`s
   correspondentes, e **o Railway injeta as variáveis do serviço como build args
   automaticamente**. Então basta setá-las no painel do `web-dev`:
   - `NEXT_PUBLIC_SUPABASE_URL` → Project URL do **dev**
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon key do **dev**
   - `NEXT_PUBLIC_API_URL` → URL pública do `api-dev`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → a mesma de produção (ou a chave dev)
   - `SUPABASE_URL` / `SUPABASE_SECRET_KEY` do **dev** (as rotas server-side do
     web usam em runtime)

   > ✅ Correto por construção: se você **esquecer** de setar alguma `NEXT_PUBLIC_*`,
   > o Dockerfile remove a vazia do ambiente e o build cai no fallback de
   > `lib/supabase.ts` (produção) em vez de assar `""`. Ou seja, esquecer no dev
   > = dev aponta pra prod (chato, mas visível); nunca gera build quebrada. Por
   > isso confira as URLs no dev antes de confiar nos testes. Ver `/ops`.

5. **Desligar quando terminar**: no serviço → **Settings** → parar/remover a
   réplica ativa, ou usar o botão de stop. Religa em segundos quando for testar.

### 2.7 Desligar o auto-deploy de produção
No Railway, nos serviços de **produção**: **Settings → Deploy** → desative o
deploy automático (ou fixe o branch em `main` e use "Deploy" manual).
É isto que garante que nada chega ao cliente sem sua ação.

---

## 3. O dia a dia

### Desenvolvendo
1. Trabalho sai em `feature/...` e é mergeado em **`develop`**.
2. Migration nova → `npm run db:push:dev` (só o banco de dev).
3. Você testa: se subiu os serviços do Railway, pela URL do `web-dev`.

### Promovendo para produção
Você diz **"sobe para produção"**. O `main` é **protegido**: não aceita push direto
(nem de admin) e só mergeia via **Pull Request com o CI verde** (check
"Testes + typecheck"). Fluxo:

```bash
# 1. banco PRIMEIRO (se houver migration nova) — evita o front pedir coluna
#    que ainda não existe (já quebrou a tela de plano em prod fazendo o inverso)
npm run db:status:prod            # o que falta aplicar
npm run db:push:prod --sim        # aplica

# 2. código via PR (o merge direto está BLOQUEADO pela proteção do branch)
gh pr create --base main --head develop --title "Promoção: <resumo>" --fill
#   → o CI roda no PR. Só quando ficar VERDE:
gh pr merge --merge --delete-branch=false

# 3. re-sincroniza o develop com o merge commit criado em main
git checkout develop && git merge origin/main && git push origin develop
```

4. **Deploy manual no Railway**: nos serviços `web` e `api` de produção, clicar
   **Deploy/Redeploy** (auto-deploy está desligado — nada vai pro ar sem esse clique).

> **Trava de segurança**: se algum dos 581 testes ou o typecheck falhar, o PR fica
> vermelho e **não deixa mergear** — impossível promover código quebrado.

### Antes de promover, sempre
```bash
npm test        # 581 testes (API + web)
npm run build --workspace=apps/web   # pega erro que só aparece no build
```

---

## 4. Comandos de referência

| Comando | O que faz |
|---|---|
| `npm run db:status:dev` | lista migrations pendentes no dev (não altera) |
| `npm run db:push:dev` | aplica as pendentes no dev |
| `npm run db:status:prod` | lista pendentes em produção (não altera) |
| `npm run db:push:prod --sim` | aplica em produção (exige o `--sim`) |
| `npm test` | roda as duas suítes |

`scripts/db.mjs` lê as connection strings de `.env.migrations` e exige `--sim`
para escrever em produção — proteção contra rodar no banco errado por engano.

---

## 5. Limitações conhecidas

- **Migration não tem rollback automático.** Escreva-as idempotentes
  (`if not exists`, `create or replace`), como o histórico atual já faz.
- **O dev não reproduz 100% do prod**: volume de dados, latência real e
  integrações externas (Evolution/WhatsApp, Asaas) diferem.
- **Deploy do Railway continua sendo por serviço**: promover código não aplica
  migration — são dois passos, de propósito.

---

## 6. O que já está montado (referência — 2026-07-24)

- **DEV Supabase**: ref `yidewiphflurzqgczrxh` (região us-east-2, org cauvieira FREE).
  Schema = réplica completa de produção (172 migrations aplicadas via `db push`).
- **Railway** (no environment `production`, branch `develop`, com **App Sleeping**
  ligado → dormem sozinhos, acordam ao abrir a URL):
  - `api-dev` → https://api-dev-production-5724.up.railway.app (root `apps/api`)
  - `web-dev` → https://web-dev-production-f3dd.up.railway.app (root `apps/web`)
  - Vars de dev (Supabase dev, ASAAS sandbox); `api-dev` tem `CORS_EXTRA_ORIGINS`
    + `APP_URL` = URL do web-dev. **Sem** WhatsApp/e-mail/Asaas-prod (dev não
    dispara pra ninguém real).
- **Login de teste** (admin_sistema) no banco dev: CPF **000.000.000-00** (a senha
  foi definida no setup — não fica versionada). Recriar/trocar: Auth Admin API do
  Supabase dev + linha em `usuarios` (id = auth uid, `cpf` no formato `000.000.000-00`
  pois o RPC `buscar_email_por_cpf` casa exato).
- **Produção**: auto-deploy DESLIGADO em `web` e `api` → só publica no clique manual.

### Dois fixes que a 1ª replicação exigiu (já commitados em `develop`)
O histórico não era 100% reproduzível do zero; corrigido em
`fix(db): torna o histórico de migrations reproduzível do zero`:
- `20260624000000_usuario_subgrupo_funcao` recriava coluna já existente → **no-op**.
- `20260714120000_servico_ia_renomear` tinha timestamp duplicado → renomeado p/
  `...120001`.
