---
name: security
description: Cyber security rules and DevOps hardening for CheckFlow. Use whenever touching RLS policies, API keys, auth flows, storage rules, or running security tests. Also trigger on any mention of "pen test", "vulnerability", "IDOR", "RLS", "secret", "token", or "permission".
---

# Security & DevOps Hardening

## Non-Negotiable Rules
- **Nunca** hardcode chaves (`SUPABASE_SERVICE_KEY`, `EVOLUTION_API_KEY`, etc.) em código — sempre via `process.env`
- **Nunca** commitar `.env.local` ou qualquer arquivo com secrets — verificar `.gitignore` antes
- GitHub Push Protection está ativo — qualquer secret no commit será bloqueado
- RLS obrigatório em **todas** as tabelas de dados de usuário, sem exceção

## Gating de entitlement (menu/perfil) é UX, NÃO segurança
`lib/entitlements/gating.ts` decide o que aparece no menu/tela/perfil — é **UX**. A barreira real segue no **RLS + checagem de permissão nas ações/rotas**.
- **Característica (`ia`)**: recursos gateados por característica (ex.: `relatorios`) são barrados na **UI** (`flag:'ia'` no Sidebar/permissoes.ts) e na **rota que gasta token** (checa `plano_servicos` flag + `billing_pode_consumir_ia`). A RLS de `relatorio_modelos` enforça **tenant + permissão + carência**, mas NÃO a característica (é flag, não recurso-módulo) — risco v1 aceito (criar modelo sem IA é inócuo; gerar é barrado na rota). Mesmo padrão da IA-foto/Consulta Inteligente.
- **Rota de IA com service role**: `/api/relatorios/gerar` ignora RLS → checa a permissão `relatorios/executar` **na mão** (query em `perfil_permissoes`) + admin sistema/empresa, antes de gerar.
- **Recursos CORE** (`unidades/perfis/usuarios`) nunca gateados por plano (`RECURSOS_CORE`) — são gestão da própria empresa; não é vazamento entre tenants, é só visibilidade.

## RLS — Padrão Obrigatório por Operação
Toda tabela com `unidade_id` precisa das 4 policies:

```sql
-- SELECT
create policy "X_leitura" on T for select using (
  is_admin_sistema() or unidade_id in (
    select unidade_id from usuario_unidade where usuario_id = auth.uid()
  )
);
-- INSERT
create policy "X_insert" on T for insert with check (
  is_admin_sistema() or unidade_id in (
    select unidade_id from usuario_unidade where usuario_id = auth.uid()
  )
);
-- UPDATE
create policy "X_update" on T for update using (
  is_admin_sistema() or unidade_id in (
    select unidade_id from usuario_unidade where usuario_id = auth.uid()
  )
);
-- DELETE (restrito a admin em tabelas de auditoria)
create policy "X_delete" on T for delete using ( is_admin_sistema() );
```

### Admin da empresa — helpers escopados (2026-06-20)
Para dar a um admin **da empresa** as mesmas funções de gestão sem furar o multi-tenant, use os helpers (migration `20260620120000_admin_empresa_rls.sql`):
- `is_admin_empresa(empresa_id)`, `is_admin_empresa_unidade(unidade_id)`, `is_admin_empresa_grupo(grupo_id)`, `is_admin_empresa_subgrupo(subgrupo_id)` — todos `security definer stable set search_path=public`.
- Adicione policies **aditivas** (não reescreva as existentes): `... using (is_admin_empresa_unidade(unidade_id))`. RLS combina permissivas com OR.
- ⚠️ **Guard obrigatório** em `usuario_empresa`: o `with check` deve impedir atribuir `perfil_id='…001'` (Admin de sistema) — admin de empresa não escala para sistema.
- ✅ **Pentest `pentest/admin-empresa-rls.mjs` — 20/20 (2026-06-20)**: admin da empresa A vê toda a empresa A cross-unidade, não vê/gerencia nada de B, não atribui Admin de sistema nem vincula em B. Asserções distinguem RLS (42501) de erro de query.
- ✅ **`/catalogos/sync-all` protegido por `x-cron-secret` (2026-06-20)**: antes estava aberto (qualquer um podia disparar sync de todos os catálogos). Agora exige `CRON_SECRET` (mesmo padrão de `/cron/limpeza-execucoes`). Disparado por um job no **cron-job.org** ("Checkflow | Atualizar Catálogos", POST + header `x-cron-secret`) → testado 200 OK (2026-06-20). `CRON_SECRET` já existe no Railway (serviço `api`).
- ✅ **Fastify content-type parser catch-all (2026-06-20, `server.ts`)**: POST de serviços de cron vinha com Content-Type não-JSON → 415. Parser `'*'` ignora o corpo em endpoints que não o usam; `application/json` segue no parser padrão (webhook Asaas intacto).
- ✅ **Catálogos — escrita por permissão** (migration `20260620140000`): `catalogos`/`catalogo_valores` graváveis por quem tem permissão `catalogos` + unidade (antes só `is_admin_sistema`).
- ✅ **Documentos — escrita por permissão** (migration `20260620160000`): `documentos`/`documento_etapas`/`etapa_imagens` + storage (`empresas/etapas/`) graváveis por quem tem permissão `documentos` + unidade. Pentest `pentest/documentos-rls.mjs` **7/7** (gestor com permissão escreve na sua unidade, não em outra empresa; comum sem permissão não escreve; leitura por unidade ok).

⚠️ **PostgREST não lança erro em UPDATE/DELETE bloqueado por RLS** — retorna `data: []` silenciosamente. Testes de segurança devem verificar se o dado realmente mudou no banco, não se houve exceção.

## Migrations — Sempre Idempotentes
```sql
drop policy if exists "nome" on tabela;   -- antes de cada create policy
create table if not exists ...;           -- em vez de create table
create index if not exists idx_nome on T; -- com nome explícito
drop trigger if exists nome on T;         -- antes de create trigger
```

## Pen Test Suite
Localização: `pentest/run.mjs`  
Execução:
```bash
SUPABASE_URL="..." SUPABASE_ANON_KEY="..." SUPABASE_SERVICE_KEY="..." node pentest/run.mjs
```
Cria usuários temporários, roda 29 testes e limpa tudo ao final.

**Cobertura atual (48/48 ✅ — última execução 2026-06-12):**
| Categoria | Testes |
|-----------|--------|
| Acesso não autenticado (anon) | 5 |
| IDOR cross-tenant (SELECT/UPDATE/DELETE) | 6 |
| Escalada de privilégio | 4 |
| Storage (upload/delete por outros tenants) | 3 |
| RPC / funções security definer | 3 |
| Rotas /api sem autenticação | 3 |
| JWT manipulation (token inválido / assinatura corrompida) | 2 |
| Information disclosure / enumeração | 3 |
| Login por código OTP (`password_reset_tokens` + `/api/auth`) | 8 |
| Programa de Parceiros (3 tabelas admin-only + colunas financeiras) | 11 |

⚠️ Rotas `/api/*` são bloqueadas pelo middleware (redirect 307 → /login) quando o request não tem cookie de sessão — o pen test usa `redirect: 'manual'` e aceita 307/401/403 como "bloqueado". A autorização fina do handler (Bearer + permissão) é defesa em profundidade adicional.

Rode o pen test após qualquer alteração de RLS ou nova tabela.

## HTTP Security Probe (black-box)
Localização: `pentest/http_probe.mjs` (criado 2026-06-08, sem credenciais de banco)
Execução:
```bash
node pentest/http_probe.mjs
```
Cobre: headers de segurança (HSTS/X-Frame-Options/nosniff), CORS, cookies de sessão, exposição de erro/path interno, TLS básico, XSS refletido (heurística), SQLi (heurística), acesso anônimo a rotas da API. Categorias adaptadas do relatório de pentest "SENAI CONECTA" (app externo) ao stack do CheckFlow.

Último resultado (2026-06-08, pós-correções): 25/26 pass — único warn residual é o banner `Server: railway-hikari` (infra Railway, aceito como risco residual). Relatório completo em `docs/seguranca/RELATORIO_SEGURANCA_2026-06-08.md`.

## Vulnerabilidades Corrigidas
| Data | Issue | Migration |
|------|-------|-----------|
| 2026-06-06 | IDOR: SELECT sem escopo de empresa em `usuarios` | 20260606000005 |
| 2026-06-06 | CPF lookup expunha tabela `usuarios` ao anon | 20260606000005 (RPC `buscar_email_por_cpf`) |
| 2026-06-06 | Chaves service role hardcoded em 3 rotas API | `api/usuarios/criar\|inativar\|importar` |
| 2026-06-06 | RLS storage sem escopo de unidade | 20260606000005 |
| 2026-06-06 | IDOR: UPDATE/DELETE sem escopo em `checklists` e `checklist_execucoes` | 20260606000007 |
| 2026-06-07 | Bucket `execucoes` com policy de leitura `to public` — anon listava (`list()`) evidências de execução de TODAS as empresas (28/29 no pentest) | 20260607110000 — substitui por policy `to authenticated` escopada por unidade (bucket continua `public=true` p/ não quebrar `getPublicUrl()`, mas listagem/enumeração agora exige vínculo com a unidade) |
| 2026-06-08 | CORS da API refletia qualquer `Origin` (`origin: true`) — qualquer site externo podia fazer requests cross-origin com credenciais do usuário (CSRF/exfiltração) | `apps/api/src/server.ts` — substituído por allowlist de origens conhecidas (commit `733a0fd`) |
| 2026-06-08 | Web sem headers de segurança (HSTS, X-Frame-Options/clickjacking, X-Content-Type-Options: nosniff) | `apps/web/next.config.ts` — adicionado `headers()` (commit `3ce612d`), validado em produção pós-deploy |
| 2026-06-11 | `EVOLUTION_API_KEY` hardcoded como fallback em `lib/whatsapp.ts`/`routes/whatsapp.ts` e default no front (`sistema/whatsapp/page.tsx`) | Removido — chave vem só de `process.env.EVOLUTION_API_KEY` (Railway); URL/instância mantêm default (não-secret); browser não embarca mais a chave (commit `e0afe99`). ⏳ Recomendado rotacionar a chave na Evolution (`AUTHENTICATION_API_KEY`), pois já esteve no git |
| 2026-06-11 | Enumeração de CPF em `/api/auth/solicitar-codigo`: respostas distintas (422 sem telefone / 429 rate limit) só para CPFs existentes | rota agora responde genérico em ambos os casos, logando internamente |
| 2026-06-11 | Policy `tickets_atualizar`: branch `usuario_tem_permissao('ticket','tratar')` era global — permitia UPDATE em tickets de qualquer unidade | 20260611134557 — escopo `usuario_unidade` adicionado ao branch |
| 2026-06-11 | UI de tickets gravava evento na timeline imutável mesmo quando o UPDATE de status era bloqueado por RLS (falha silenciosa do PostgREST) | `tickets/[id]/page.tsx` — update com `.select()` + abort antes do evento |
| 2026-06-14 | `usuario_unidade` só tinha policy admin-only — qualquer policy de outra tabela com `exists(select ... from usuario_unidade where usuario_id = auth.uid())` retornava falso pra usuários normais (bloqueava `tickets_criar`, leitura de `checklists`/`catalogos`/`documentos`/`padroes_variaveis`). Erro: "Erro ao criar ticket" (42501) | 20260614030000 — policy `usuario_unidade_propria` (select própria linha) |
| 2026-06-14 | `admin_sistema` sem linha em `usuario_unidade` não conseguia criar/ler tickets, eventos, evidências, categorias | 20260614040000 — `or is_admin_sistema()` em `tickets_leitura/criar`, `ticket_eventos_*`, `ticket_evidencias_*`, `ticket_categorias_leitura`, `ticket_sla_leitura` |
| 2026-06-14 | FK `tickets.aberto_por_id`/`assignee_id` apontava para `auth.users`, mas frontend embute `usuarios!tickets_aberto_por_id_fkey` — PostgREST retornava `PGRST200` e a listagem de tickets mostrava "nenhum ticket encontrado" sem erro visível | 20260614050000 — FK repontada para `usuarios(id)` |
| 2026-07-05 | **Mesmo gotcha de FK→auth.users em `ticket_eventos.autor_id`** (a `20260614050000` cobriu `tickets` mas esqueceu `ticket_eventos`) — embed `autor:usuarios(nome)` falhava → **timeline do ticket vinha vazia** | `20260703020000` — FK repontada para `usuarios(id)` |
| 2026-07-05 | `usuarios_leitura_scoped` fazia a subquery de `usuario_empresa` **sob o RLS aninhado** (operador só via a própria linha) → operador não lia nome de colega (abridor/responsável/autor de evento) → embed null → crash da tela de ticket | `20260703000000` — função `partilha_empresa(uuid)` SECURITY DEFINER usada na policy (avalia compartilhamento de empresa sem RLS aninhado) |
| 2026-07-05 | `tickets_atualizar` só tinha `USING` (Postgres reaproveita como `WITH CHECK` na linha nova) → transferir/reatribuir para outro assignee barrava operador não-abridor | `20260703030000` — `WITH CHECK` explícito = usuário na mesma unidade do ticket |
| 2026-07-05 | Storage `execucoes_upload/delete` só aceitava caminho de checklist (`<execucao_id>/...`) e ainda castava `[1]::uuid` — evidência de ticket (`tickets/<id>/...`) era barrada e o cast quebrava | `20260703040000` — aceita caminho de ticket via comparação por **texto** (`id::text`), sem cast do segmento p/ uuid |
| 2026-06-22 | **Broken access control** em rotas Next.js service-role sem autenticar o chamador: `/api/usuarios/inativar` (IDOR — derrubava qualquer usuário por `usuarioId`), `/api/usuarios/criar`, `/api/usuarios/importar` | Helper `lib/apiAuth.ts` (`autorizarPermissao`) — exige Bearer + admin sistema OU `usuario_tem_permissao('usuarios', criar/editar)`. Callers passaram a enviar o token. Descoberto ao gerar `docs/api/INVENTARIO_APIS.md` |

| 2026-06-23 | Rotas Fastify "internas" sem auth — chamáveis direto na URL (CORS só barra navegador): `/whatsapp/*`, `/tickets\|planos-acao\|tarefas/notificar`, `/catalogos/test-api`. Risco: envio de WhatsApp arbitrário, SSRF (`test-api`), spam de notificação | `apps/api/src/lib/apiAuth.ts` (`exigirAutorizacao`): exige Bearer JWT (navegador, via `apps/web/lib/apiClient.ts`) ou `x-internal-secret` (servidor). Requer env `INTERNAL_API_SECRET` em api+web |

| 2026-06-27 | **CORS bloqueava o domínio de produção**: `apps/api/src/server.ts` só tinha `web-production-36880.up.railway.app` + localhost na allowlist; o app roda em `app.checkflow.digital` → navegador dava "Failed to fetch" em toda chamada direta à API (WhatsApp QR, billing, impersonar). OTP/notificações não afetados (servidor-a-servidor, sem Origin) | `server.ts` — adicionado `https://app.checkflow.digital` à `allowedOrigins` (commit 9d1f8d9). `CORS_EXTRA_ORIGINS` (env) segue como extensão |
| 2026-06-29 | **Login não barrava conta inativa** (status não checado pós-auth) + **vazava "CPF não encontrado"** (enumeração — CPF inexistente dava msg diferente de senha errada) | `login/page.tsx` — bloco de status pós-auth (grava aviso em `sessionStorage` **antes** do `signOut` p/ sobreviver ao flash do redirect) + msg genérica "CPF ou senha incorretos" p/ CPF desconhecido (commits `b04fda2`/`e6a6e63`) |
| 2026-06-29 | **Escalada de privilégio na UI**: "Admin de sistema" (perfil seed `…001`) aparecia como opção atribuível na **moderação de pré-cadastro** e no **criar/editar usuário** — admin da empresa poderia se promover a admin de plataforma (a RLS `usuario_empresa` já barrava no banco, mas a UI oferecia) | Defense-in-depth na UI: `ModeracaoPreCadastroModal.tsx` (`.neq('id', ADMIN_SISTEMA_ID)` na query de perfis) + `UsuarioModal.tsx` (filtra `…001` salvo se já for o perfil atual do usuário) — commit `bcb4b3d` |
| 2026-06-29 | **`password_reset_tokens` nunca aplicada em prod** (migration `20260610060000` pulada) → todo o OTP (1º acesso / reset / self-service) falhava silenciosamente: `criarCodigoOtp` ignorava o erro do insert e a UI dizia "código enviado" | Usuário aplicou a migration; hardening `criarCodigoOtp` agora **lança** no erro do insert (`a3e9317`). Lição: verificar que a migration foi de fato aplicada em prod (projeto não linkado localmente) |
| 2026-06-29 | **OTP por WhatsApp sem DDI 55** → Evolution retornava `exists:false` → código nunca entregava (só os fluxos N1 que somavam o 55 à mão funcionavam) | `apps/api/src/lib/whatsapp.ts` — `normalizarNumero()` centraliza o prefixo 55 antes de `resolverNumero`, aplicado em `enviarWhatsApp`/`enviarWhatsAppMidia` (commit `fd7883e`) |
| 2026-06-30 | **Operador (não-admin) lia `usuario_empresa = []` por falta de self-select RLS** → `SessionContext` sem empresa/unidade → app inutilizável ("Nenhuma unidade selecionada"). Não era vazamento, mas broken-access que travava todo não-admin (operador/N1/N2/gestor); irmão do gotcha de `usuario_unidade`/`usuario_subgrupo` | Migration `20260630000000` — `usuario_empresa_propria`/`usuario_grupo_propria` `for select using (usuario_id = auth.uid())`. Verificado sob RLS: lê só a própria linha (não vaza a de outro usuário) e a **escrita segue admin-only** (tentativa de auto-promoção a admin-empresa bloqueada). Ver `/db` |
| 2026-07-09 | **Upload do PDF da Consulta Inteligente barrado por RLS** ("new row violates row-level security policy"): o `security_hardening` (20260606000005) travou o INSERT no bucket `empresas` em **só `is_admin_sistema()`**; a feature de documentos (20260620160000) liberou só o prefixo **`etapas/%`**. O PDF sobe em **`documentos/%`** → sem policy → admin da empresa/gestor barrado (imagem de etapa funcionava, PDF não). **Não era** upsert/mime/tamanho (pistas falsas antes de ver a msg real) | `20260709020000` — policy `documentos_arquivo_upload/delete` no prefixo `documentos/%` = `is_admin_sistema() OR usuario_tem_permissao('documentos', 'criar')` (espelha a de etapas). Cliente também deixou de usar `upsert` (caminho já é único). Lição: **exigir a mensagem real do erro** antes de teorizar |

| 2026-07-18 | 🔴 **Escalada de privilégio: `is_admin_sistema()` confiava em `user_metadata`** (`20260603000003`, nunca redefinida). `user_metadata`/`raw_user_meta_data` é **gravável pelo próprio usuário** via `supabase.auth.updateUser({ data: { role: 'admin_sistema' } })` com a chave publishable do browser — vai ao GoTrue, não ao PostgREST, então nenhuma policy intercepta e o JWT seguinte já sai com o claim. Como a função é o `or` de abertura de quase toda policy, qualquer usuário de qualquer empresa viraria super-admin de plataforma (todos os tenants). As rotas service-role que decidem em JS (`lib/apiAuth.ts`, `/api/usuarios/impersonar`, `/api/empresas/[id]/excluir`, `/api/templates/gerar`, `billing.ts`) caíam junto. **Pentest 48/48 não cobria** — os 4 testes de escalada assumem o JWT imutável | `20260718160000` — backfill `raw_app_meta_data` (só gravável com service role) **antes** de trocar a função p/ `auth.jwt() -> 'app_metadata'` (ordem invertida derruba todo admin). 26 call sites `user_metadata?.role` → `app_metadata?.role` + `lib/admin.ts` retipado. Teste de regressão em `admin.unit.test.ts` ("IGNORA role vindo de user_metadata"). **Diagnóstico: 1 única conta com o role, a seed de 2026-06-03 — sem sinal de exploração.** ⚠️ `user_metadata.role` foi deixado no banco de propósito (limpar só depois do deploy do front) |
| 2026-07-18 | **`POST /usuarios/sync-all` sem autenticação** (`apps/api/src/routes/usuarios.ts`) — irmão do `/catalogos/sync-all` fechado em 2026-06-20, passou batido. Service role, sem `exigirAutorizacao` nem `x-cron-secret`: POST anônimo varria TODAS as empresas com `importacao_api_url`, criava usuários via `auth.admin.createUser` e, com `estrategia='inativar'`, inativava em massa. Sem chamador na UI (cron-only); `docs/api/INVENTARIO_APIS.md` já marcava "x-cron-secret (confirmar)" e a confirmação nunca ocorreu | `usuarios.ts` — guard `x-cron-secret` (env `CRON_SECRET`), mesmo padrão de `/catalogos/sync-all`. ⚠️ **Requer job no cron-job.org** com o header, se o sync for usado |

| 2026-07-19 | **SSRF via URL configurável** — `usuarios.ts` `fetch(empresa.importacao_api_url)` (admin da empresa) e as 5 rotas/lib de IA que fazem `fetch(ia_provedores.base_url)` (admin_sistema) buscavam URLs sem validar o host → SSRF cego para metadata de nuvem/loopback/redes privadas | Helper `assertUrlPublica()` (`apps/api/src/lib/urlExterna.ts` + `apps/web/lib/urlExterna.ts`): exige https, resolve DNS e bloqueia IP interno (anti-rebinding). `ehIpPrivado` testado. `+ AbortSignal.timeout(10s)` no sync-all. Aplicado em `ajuda`/`documentos-consultar`/`ia-interpretar-foto`/`relatorios-gerar`/`lib/ia/checklistIA` |
| 2026-07-19 | **Galeria de templates legível por anon** — policy `checklists_leitura` (+ secoes/atividades/opcoes) tinha `or is_template` sem role guard → `anon` enumerava o catálogo de modelos | `20260719140000` — ramo vira `(is_template and auth.uid() is not null)` nas 4 policies de leitura |
| 2026-07-19 | **Injeção de HTML em e-mails** — templates interpolavam dados do usuário (nome/observação/título/descrição) cru no HTML | `email-templates.ts` — helper `escapeHtml()`; `row()` escapa por padrão (+`rowRaw()` p/ HTML intencional); todos os campos de texto/nome escapados. Inclui os 3 templates dos alertas (`emailLimiteUso`/`emailFaturaVencida`/`emailPreCadastrosPendentes`) — `nomeEmpresa`/`nomeDestinatario` escapados no corpo; assuntos (texto puro) intocados |

## Bateria completa de seg+perf (2026-07-19)
Relatório: `docs/seguranca/RELATORIO_SEG_PERF_2026-07-19.md`. Suítes dinâmicas contra prod: `run.mjs` 46/49, RLS suites (documentos/causa-raiz/billing-templates/admin-empresa) OK, `scale-rls-100` 6/6, `backup-restore` 7/7, `query-n1` 5/5 (sem N+1), `http_probe` 24/26. **Cobertura de RLS = 100%** das tabelas (verificado ao vivo: anon lê 0 de planos_acao/workflows apesar de dados reais). Os "fails" do run.mjs eram a **galeria de templates lida por anon** (não é vazamento de tenant nem bypass de JWT). Os 3 achados (**MEDIUM SSRF**, **LOW** galeria anon, **LOW** HTML em e-mails) foram **corrigidos** — ver as linhas da tabela acima (2026-07-19). ✅ **Load test leve rodado 2026-07-20** (`load-test-simple`, 100 VU·30s): 3.682 req, **0 erros**, p95 2.182ms — instância única segura 100 VU, gargalo é latência (SPOF sem escala horizontal). k6 1000 VU **NÃO** rodado (rodar só em madrugada + depois de ligar réplicas). Achados do relatório **todos corrigidos** (ver tabela acima). Ver `docs/seguranca/RELATORIO_SEG_PERF_2026-07-19.md`.

### Pré-cadastro por QR — RLS (2026-06-27)
`pre_cadastros` (migration `20260627000000`): INSERT **anônimo** só com `status='pendente'` (sem leitura/edição p/ anon — anti-enumeração); SELECT/UPDATE só admin sistema/empresa. RPC `empresa_publica` (security definer, anon) expõe só nome+logo de empresa ativa. **Spam:** a moderação é a barreira (anônimo cria pendente, mas só vira usuário se o admin aprovar). Pendência futura: rate-limit no INSERT anônimo. Ver `/db`.

### OTP — visibilidade de falha de envio (2026-06-27)
`enviarCodigoUsuario` (lib/passwordReset.ts) agora **retorna `{enviado, erro}`** (antes `.catch` silencioso → UI dizia "enviado" falso). `/api/usuarios/criar` propaga `codigoEnviado`/`envioErro`; a moderação avisa quando o código NÃO saiu. E-mail é **fallback paralelo** (enviado = whatsapp.ok OU email.ok). Healthcheck do WhatsApp em `/ops`.

### Dashboards públicos — leitura por token (2026-07-09)
`/painel/[token]` é **público (sem login)** e `/api/painel/[token]` usa **service-role** (o público não tem sessão). A barreira é o **token não-adivinhável** (`gen_random_bytes(16)` hex) + a rota **só devolve os painéis daquele dashboard** (nunca outros dados/tenants). Token **revogável** (regenerar no editor invalida o antigo). Exceção consciente ao padrão "toda rota service-role autentica o chamador": aqui o token É a credencial. Escrita (criar/editar dashboards) segue autenticada por RLS (`usuario_tem_permissao('dashboards','criar')` + unidade).
- ⚠️ **Superfície do link público cresceu com o painel de checklist (2026-07-11)**: além do histórico de UMA atividade, o token passa a expor **agregados de execução do checklist** — placar (executados/aprovados/reprovados/não exec.), **nomes das atividades** mais não conformes, **motivos de não execução** e contagem de planos. Continua **escopado ao(s) painel(éis) daquele dashboard** (a rota só lê `checklist_id`/`atividade_id` configurados) e é **só agregado/leitura** (sem dados pessoais do operador, sem outras unidades). Decisão consciente: quem tem o link vê esses indicadores — orientar o gestor a tratar o link como semi-secreto e regenerar se vazar.

⚠️ **Padrão para Route Handlers Next.js (`apps/web/app/api`) que usam service-role**: SEMPRE autenticar o chamador com `autorizarPermissao(req, recurso, acao)` de `lib/apiAuth.ts` no topo. **Rotas Fastify "internas"** (apps/api): proteger com `exigirAutorizacao(req, reply)` de `apps/api/src/lib/apiAuth.ts`. Service-role bypassa RLS — sem essa checagem a rota fica aberta. Exceções: rotas de auth pré-login (`solicitar/verificar-codigo`, `definir-senha`) que têm seu próprio anti-abuso.

## RPCs Sensíveis (Security Definer)
| Função | Proteção | Migration |
|--------|----------|-----------|
| `buscar_email_por_cpf` | retorna só email, sem expor tabela `usuarios` ao anon | 20260606000005 |
| `excluir_empresa_cascata(p_empresa_id)` | exige `is_admin_sistema()` E `status = 'inativo'`; apaga em cascata (8 FKs ajustadas para `on delete cascade` em 20260610040000) | 20260610040000 |

⚠️ Padrão para novas RPCs `security definer`: sempre `revoke all ... from public` + `grant execute ... to authenticated`, e validar role/condições de negócio **dentro** da função (nunca confiar só na UI).

## Login por Código (OTP) — Anti-abuso (2026-06-10)
- `password_reset_tokens` (sem RLS, só service role) guarda apenas `codigo_hash` (sha256), nunca o código em texto puro
- Códigos de 6 dígitos, expiram em 15 min, máx. 5 tentativas (incrementa `tentativas` a cada erro)
- `/api/auth/solicitar-codigo` (self-service) sempre retorna mensagem genérica — não revela se o CPF existe; limite 3 envios/hora por usuário
- `/api/usuarios/resetar-senha` (gestor) exige Bearer token + `is_admin_sistema()` ou `usuario_tem_permissao('usuarios','editar')` (RPC chamada com client autenticado via header `Authorization`, para `auth.uid()` resolver corretamente); limite 5 envios/hora por usuário
- Token de sessão pós-verificação (`sessao_senha`) é de uso único e expira em 10 min — separa "validar código" de "definir senha"

## DevOps — Serviços Railway
| Serviço | URL | Notas |
|---------|-----|-------|
| Web (Next.js) | `web-production-36880.up.railway.app` | Branch `main` → auto-deploy |
| API (Fastify) | `api-production-5bce.up.railway.app` | WhatsApp proxy |

## Env Vars Necessárias (nomes, nunca valores)
| Var | Onde |
|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Railway + `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Railway + `.env.local` |
| `SUPABASE_SECRET_KEY` | Railway only |
| `NEXT_PUBLIC_API_URL` | Railway + `.env.local` |
| `CRON_SECRET` | Railway only — protege `POST /cron/parceiros/resumo-mensal` (header `x-cron-secret`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Railway only — `apps/api/src/lib/email.ts` (Resend) |

## Programa de Parceiros (migrations aplicadas em 2026-06-11)
- `parceiros`, `empresa_status_eventos`, `parceiro_emails_log`: RLS habilitado, policies admin-only (`is_admin_sistema()`) — sem acesso anon/membro
- `/cron/parceiros/resumo-mensal` é a única rota não autenticada por sessão — protegida por `CRON_SECRET` via header `x-cron-secret`, retorna 401/500 se ausente/incorreto; valida internamente o último dia do mês (idempotente por `parceiro+mês`)
- ✅ Pen test seção 10 (`pentest/run.mjs`) cobre as 3 tabelas: anon e usuário comum negados em SELECT/INSERT/UPDATE/DELETE. Suite completa 48/48 em 2026-06-12
- ✅ Dados financeiros de empresa (`valor_mensalidade`, `parceiro_percentual`, `plano`, `status_pagamento`, etc.) movidos de `empresas` para **`empresa_financeiro`** (RLS admin-only, migration 20260613002351). Independente de a exposição original ser explorável, agora os campos sensíveis estão numa tabela sem policy de membro — defense-in-depth. Toda escrita/leitura passa por admin (UI `/sistema/empresas/[id]`, rota de parceiros, `/sistema/parceiros`)

## Correções da auditoria de regras (2026-06-11)
| Issue | Fix |
|-------|-----|
| `/api/auth/solicitar-codigo` vazava existência de CPF (422 p/ usuário sem telefone, 429 no rate limit) | Resposta genérica em ambos os casos, log interno via `console.warn` |
| Policy `tickets_atualizar` branch `tratar` sem escopo de unidade (update cross-tenant por id) | 20260611134557 — exige `usuario_unidade` |
| Transição de ticket bloqueada por RLS gravava evento na timeline imutável mesmo assim | UI verifica `error` + linhas afetadas antes de inserir o evento |
| `coalesce(resultado,'aprovado')` no motor de workflow (falso aprovado via SQL manual) | 20260611134557 — nulo = reprovado |
| Crash 500 em rotas da API (supabase-js exige WebSocket nativo, Node 22+; Railway = Node 20) | `{ realtime: { transport: ws } }` em TODO `createClient` da apps/api — padrão obrigatório p/ rotas novas |

## Evolution Rule
Ao corrigir uma vulnerabilidade: adicionar linha na tabela "Vulnerabilidades Corrigidas".  
Ao adicionar nova tabela com dados de usuário: adicionar políticas RLS completas (4 operations) e rodar pen test.
