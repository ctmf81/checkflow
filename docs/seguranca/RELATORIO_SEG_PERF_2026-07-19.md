# Relatório de Segurança & Performance — CheckFlow — 2026-07-19

Bateria completa executada contra **produção** (suítes que criam dados temporários e limpam ao final) + auditoria estática de código e RLS. Escopo: pentest, IDOR/cross-tenant, escalada de privilégio, injeção, SSRF, exposição, RLS por tabela, e falhas de performance/arquitetura.

**Veredito geral:** isolamento multi-tenant (RLS) **sólido**; nenhuma vulnerabilidade crítica confirmada. Achados: **1 MEDIUM (SSRF)**, **2 LOW**, e itens de robustez/perf. Detalhes abaixo.

> ✅ **Atualização 2026-07-20:** os **3 achados foram corrigidos, mergeados e deployados** (SSRF → `assertUrlPublica` com DNS/anti-rebinding + timeout; galeria de templates → migration `20260719140000` exige autenticado; HTML em e-mails → `escapeHtml`). Ver `/security` (tabela de vulnerabilidades). Teste de carga leve executado (§5). Restam só recomendações de perf (§3, escala horizontal).

---

## 1. Suítes dinâmicas (contra produção)

| Suíte | Resultado | Observação |
|-------|-----------|------------|
| `run.mjs` (pentest principal, 49 testes) | **46/49** | 3 "fails" = leitura da galeria de templates (ver LOW-1); **não** são vazamento nem bypass de JWT (verificado) |
| `admin-empresa-rls` | **19/20** | 1 falso-positivo: bloqueio cross-tenant funcionou via trigger P0001 (o teste esperava 42501) |
| `documentos-rls` | **7/7** | ✅ |
| `causa-raiz-rls` | **7/7** | ✅ |
| `billing-templates-rls` | **18/18** | ✅ nenhum vazamento |
| `query-n1-detection` | **5/5** | ✅ sem N+1 (50 empresas) |
| `scale-rls-100-simple` | **6/6** | ✅ isolamento holds a 100 empresas |
| `backup-restore-test` | **7/7** | ✅ integridade (FK/trigger/índice/cascade) |
| `http_probe` (black-box) | **24/26** | 2 warns = banner `Server: railway-hikari` (infra, risco residual aceito) |
| `scale-quota-enforcement` | inconclusivo | Crash de teardown do `ws` no Windows (não é bug do app; insert de empresa verificado OK à parte) |
| `blue-green-readiness` | 2 checks | Checagens de config estáticas (flag `WORKFLOWS_HABILITADO`, versionamento git) — não são segurança/perf |
| `load-test-simple` (100 VU) | ✅ **EXECUTADO 2026-07-20** | 3.682 req / 30s, **0 erros**; p95 2.182ms (acima do alvo 2s), média 720ms. Nada caiu — SLO de latência estourou, não estabilidade (ver §5) |

### Verificações pontuais ao vivo
- **anon em `checklists`**: retorna 7 linhas, **todas `is_template=true`, publicadas** — 0 checklists de tenant. Sem vazamento cross-tenant.
- **anon em `planos_acao`/`workflows`/movimentações**: 0 linhas apesar de 17/34/4 linhas reais → RLS aplicada.
- **Cobertura de RLS**: 100% das tabelas criadas têm `enable row level security` (verificado tolerante a espaços).

---

## 2. Achados de segurança (priorizados)

### 🟠 MEDIUM-1 — SSRF via `importacao_api_url` (sync de usuários)
`apps/api/src/routes/usuarios.ts:51` — `fetch(empresa.importacao_api_url)` busca uma URL **configurada pelo admin da empresa** e sem validação de host. Um admin malicioso/comprometido pode apontar para alvos internos (metadata do provedor `169.254.169.254`, `localhost`, faixas privadas) — SSRF cego (resposta não volta ao atacante, mas o request interno acontece).
- **Mitigação atual**: a rota agora exige `x-cron-secret` (fechado nesta sessão), então só o cron dispara — reduz muito a superfície (não é chamável direto pelo admin).
- **Recomendação**: validar `importacao_api_url` (exigir `https`, resolver o host e **bloquear IPs privados/loopback/link-local/metadata**) antes do fetch. Idem para qualquer `base_url` de provedor de IA customizado (`ia_provedores`).
- **Bônus**: o fetch **não tem timeout/AbortController** → uma URL que pendura trava o processamento daquela empresa no cron. Adicionar `AbortSignal.timeout(~10s)`.

### 🟡 LOW-1 — Galeria de templates legível por `anon`
Policy `checklists_leitura` tem `or is_template` **sem restrição de role** → usuários **não autenticados** leem o catálogo de modelos (nome + estrutura via `secoes`/`atividades`, idem sem role guard). O comentário da migration diz "qualquer usuário **autenticado**" — a intenção era autenticado, mas a policy libera anon.
- **Impacto**: baixo — conteúdo curado, publicado, sem dados de tenant nem PII. Um concorrente poderia enumerar o catálogo de modelos.
- **Recomendação**: se a galeria deve ser só autenticada, trocar `or is_template` por `or (is_template and auth.uid() is not null)` (ou `to authenticated`) nas policies de `checklists`/`checklist_secoes`/`checklist_atividades`.

### 🟡 LOW-2 — Injeção de HTML em e-mails
`email-templates.ts` interpola dados (`nomeEmpresa`, `nomeDestinatario`, descrições) **cru no HTML** (8 pontos). Um nome de empresa/usuário com markup injeta conteúdo no e-mail do destinatário.
- **Impacto**: baixo — clientes de e-mail sandboxam; valores vêm de fluxos semi-confiáveis (cadastro/admin). Sem execução de script.
- **Recomendação**: um `escapeHtml()` nos valores interpolados nos templates.

### ✅ Confirmado seguro (sem ação)
- IDOR cross-tenant (SELECT/UPDATE/DELETE) em checklists, execuções, usuários, empresas, planos, workflows, tickets, documentos, causa-raiz — **bloqueado**.
- Escalada de privilégio: auto-promoção a `is_admin_sistema` **bloqueada** (corrigido nesta sessão: role migrado p/ `app_metadata`); associar-se a empresa alheia bloqueado.
- Rotas `/api` service-role: todas autenticam o chamador (Bearer/permite; crons via `x-cron-secret`; webhook Asaas via token) — auditado 1-a-1.
- Storage: anon não lista/insere; upload cross-tenant bloqueado.
- OTP/`password_reset_tokens`: anon/comum sem acesso; sem enumeração de CPF.
- JWT: token inválido/assinatura corrompida → tratado como `anon` (rejeitado), não é bypass.
- Sem segredos hardcoded em código rastreado.

---

## 3. Performance & Arquitetura

### OK
- **Sem N+1** nas queries principais (suíte dedicada 5/5).
- **Índices** presentes nas junções quentes de RLS (`usuario_unidade/grupo/subgrupo/empresa(usuario_id)`), que são avaliadas em quase toda policy.
- **Isolamento a 100 empresas** sem degradação/contaminação.
- **Polling** (45s, pausa em aba oculta) — escolha consciente vs Realtime no free tier; custo previsível.

### Pontos de atenção
- **`billing_status` chama `avancar_periodo_assinatura` a cada leitura** — aceitável hoje; se a tela de plano for muito acessada, considerar cache curto.
- **Crons em loop por empresa** (avisos-uso/gestão) fazem N queries por empresa. Com centenas de empresas, o cron diário fica lento mas não crítico (roda 1×/dia, fora do caminho do usuário). Reavaliar se passar de ~1000 empresas.
- **Fetch sem timeout** no sync-all (ver MEDIUM-1) — risco de travar o cron.

### SPOFs / arquitetura (já conhecidos — ver `docs/INTEGRACOES_E_RISCOS.md`)
- **Evolution API (WhatsApp)**: instância única; healthcheck + fallback e-mail já existem. Futuro = Cloud API oficial.
- **API Fastify**: instância única no Railway (sem horizontal scaling configurado). Blue-green/rollback documentados mas readiness parcial.
- **Supabase free tier**: pausa por inatividade afeta pg_cron (mitigado por crons HTTP externos).

---

## 4. Correção de rota do próprio relatório (transparência)
Durante a auditoria, um grep inicial (sensível a espaços de alinhamento nas migrations) sinalizou **falsamente** que `planos_acao`/`workflows` estavam sem RLS. Verificação ao vivo (anon lê 0 de 17 linhas reais) + releitura das migrations (`20260606000006`/`20260606000008`) confirmaram que **a RLS está ativa**. Registrado como lição: validar cobertura de RLS contra o banco, não só por texto de migration.

---

## 5. Teste de carga — EXECUTADO (leve) 2026-07-20
**`load-test-simple.mjs` (100 VU · 30s)** rodado contra produção:
- **3.682 requisições, 0 erros (0,00%)** — a instância única do Railway segurou 100 usuários simultâneos sem nenhum 5xx.
- Latência: **média 720ms, p95 2.182ms** (acima do alvo de 2s por 182ms), máx 4.068ms. O "FALHOU" do script é só o **SLO de latência**, não queda.
- ⚠️ **Nuance importante:** o script usa **token dummy** → as requisições batem na auth e voltam (401), **sem tocar o banco**. Mesmo esse caminho barato já leva ~720ms sob carga; requisições **autenticadas reais** (que consultam o Supabase) seriam **mais lentas**.
- **Diagnóstico:** o gargalo é **latência sob concorrência**, causado pelo SPOF de **instância única** (web+API sem escala horizontal — §3). 100 VU é o teto confortável dessa config.
- **Recomendação:** ligar **réplicas (2+) no Railway** para web e API resolve latência **e** o SPOF. Só **depois** disso vale rodar o **teste pesado (k6, rampa até 1000 VU)** — e em **janela de madrugada**, pois esse sim pode degradar/derrubar pros clientes. Não executado nesta rodada.

---

## 6. Ações recomendadas (ordem)
1. **MEDIUM-1**: validar host de `importacao_api_url` (bloquear IP privado/metadata) + timeout no fetch. Estender a `ia_provedores.base_url`.
2. **LOW-1**: decidir se a galeria de templates é pública ou só-autenticada; ajustar policy.
3. **LOW-2**: `escapeHtml()` nos templates de e-mail.
4. Rodar o **teste de carga** em staging.
5. Atualizar `pentest/run.mjs` para (a) cobrir cross-tenant em `planos_acao`/`workflows`, (b) filtrar `is_template` no teste de anon, (c) aceitar P0001 como bloqueio válido no admin-empresa.
