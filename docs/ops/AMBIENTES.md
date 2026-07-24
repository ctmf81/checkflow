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

```
SUPABASE_DB_URL_DEV=postgresql://postgres:SENHA@db.<ref-dev>.supabase.co:5432/postgres
SUPABASE_DB_URL_PROD=postgresql://postgres:SENHA@db.pswdjdlirylxgscohcfi.supabase.co:5432/postgres
```

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
1. No projeto do Railway: **New → GitHub Repo** → mesmo repo, **branch `develop`**.
2. Crie dois serviços, apontando para os Dockerfiles existentes:
   - `web-dev` → `apps/web/Dockerfile`
   - `api-dev` → `apps/api/Dockerfile`
3. Variáveis: copie as do serviço de produção equivalente e **troque**:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` → do projeto dev
   - `SUPABASE_URL` / `SUPABASE_SECRET_KEY` → do projeto dev
   - `ASAAS_ENV=sandbox` + `ASAAS_API_KEY_SANDBOX`
   - `APP_URL` → URL do `web-dev`
   - `NEXT_PUBLIC_API_URL` → URL do `api-dev`
4. **Economia**: deixe os dois serviços **parados** quando não estiver testando.
   O Railway cobra por recurso consumido enquanto rodam.

> ⚠️ `NEXT_PUBLIC_*` **não é injetada no build Docker** do web — há fallback
> hardcoded em `apps/web/lib/supabase.ts`. Ao criar o `web-dev`, confira se o
> fallback não está fazendo o dev apontar para o banco de **produção**. Ver `/ops`.

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
Você diz **"sobe para produção"**. O que acontece:

```bash
# 1. o que ainda falta no banco de produção?
npm run db:status:prod

# 2. banco primeiro (evita o front pedir coluna que não existe)
npm run db:push:prod --sim

# 3. código
git checkout main && git merge develop && git push
```

4. Se o auto-deploy estiver desligado: clicar **Deploy** no Railway.

> **A ordem importa**: banco antes do código. O caminho inverso já quebrou a tela
> de plano em produção (front pediu `cancelar_em` antes da migration existir).

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
