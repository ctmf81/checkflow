# Inventário de APIs — CheckFlow

Gerado em 2026-06-22. Cobre as **duas superfícies** de API do projeto. Mantenha
atualizado ao criar/alterar rotas. (Não é OpenAPI — é referência rápida.)

- **Fastify** (`apps/api/src/routes/`) — serviço API no Railway
  (`api-production-5bce.up.railway.app`). Proxy de WhatsApp, notificações,
  billing, crons.
- **Next.js Route Handlers** (`apps/web/app/api/`) — dentro do app web
  (`web-production-36880.up.railway.app`), base path `/api`. Operações que
  precisam de service-role (criação de usuário, IA, PDF, OTP).

Coluna **Auth**:
`pública` = sem credencial · `bearer` = JWT do usuário no header Authorization ·
`x-cron-secret` = header secreto (cron) · `asaas-token` = token do webhook Asaas ·
`service-role` = usa a chave de serviço do Supabase · ⚠️ = **sem verificar o chamador**.

---

## ✅ Lacunas de autenticação — CORRIGIDAS (2026-06-22)

O inventário revelou 3 rotas que executavam ação privilegiada com **service-role**
**sem autenticar quem chama** (`criar`, `inativar`, `importar` — `inativar` era
um IDOR: derrubava qualquer usuário por `usuarioId`). **Corrigido:** todas passam
pelo helper `lib/apiAuth.ts` (`autorizarPermissao`) — exige `Authorization: Bearer`
+ admin de sistema OU permissão `usuarios.criar`/`editar` (via `usuario_tem_permissao`).
Os callers (UsuarioModal, lista de usuários, ImportarUsuariosModal) passaram a
enviar o token.

> ✅ **CORRIGIDO (2026-06-23)**: as rotas Fastify "internas" (`/whatsapp/*`,
> `/tickets|planos-acao|tarefas/notificar`, `/catalogos/test-api`) agora exigem
> credencial via `apps/api/src/lib/apiAuth.ts` (`exigirAutorizacao`):
> **`Authorization: Bearer <jwt>`** (navegador, `lib/apiClient.ts → apiFetch`) **ou**
> **`x-internal-secret`** (servidor-a-servidor, ex.: OTP de reset). ⚠️ Requer
> `INTERNAL_API_SECRET` setado nos serviços **api e web** (mesmo valor). Crons
> seguem com `x-cron-secret`.

---

## Fastify (`apps/api`)

| Método | Rota | Auth | Propósito | Body (principais) |
|--------|------|------|-----------|-------------------|
| GET | `/health` | pública | Health check | — |
| GET/POST | `/whatsapp/status` | ⚠️ interna | Status da instância Evolution | `{ instancia? }` |
| POST | `/whatsapp/conectar` | ⚠️ interna | Gera QR / conecta instância | `{ instancia? }` |
| POST | `/whatsapp/desconectar` | ⚠️ interna | Logout da instância (trocar número) | `{ instancia? }` |
| POST | `/whatsapp/enviar` | ⚠️ interna | Envia mensagem WhatsApp | `{ numero, mensagem }` |
| POST | `/whatsapp/enviar-codigo` | ⚠️ interna | Envia OTP por WhatsApp | `{ numero, codigo, ... }` |
| POST | `/whatsapp/recuperar-senha` | pública | Reset de senha (WA + email) | `{ identificador }` |
| POST | `/tickets/notificar` | ⚠️ interna | Notifica evento de ticket (WA+email) | `{ ticket_id, evento, ator_id, texto }` |
| POST | `/planos-acao/notificar` | ⚠️ interna | Notifica moderador N1/N2 | `{ plano_id, evento, observacao, ator_nome }` |
| POST | `/tarefas/notificar` | ⚠️ interna | Notifica membros da lista de tarefas | `{ lista_id }` |
| POST | `/parceiros/boas-vindas` | ⚠️ interna | E-mail de boas-vindas ao parceiro (1x) | `{ parceiro_id }` |
| POST | `/cron/parceiros/resumo-mensal` | x-cron-secret | Resumo mensal de comissões (último dia do mês) | `{ force? }` |
| POST | `/catalogos/test-api` | ⚠️ interna | Testa API externa de catálogo (preview de campos) | `{ url, headers }` |
| POST | `/catalogos/sync-all` | x-cron-secret | Sincroniza catálogos com API configurada | — |
| POST | `/cron/limpeza-execucoes` | x-cron-secret | Remove mídia de execuções expiradas | — |
| POST | `/usuarios/sync-all` | x-cron-secret (confirmar) | Sincroniza usuários com fonte externa | — |
| POST | `/billing/assinar` | bearer (admin empresa/sistema) | Assina/troca plano (Asaas) | `{ empresaId, planoId, billingType }` |
| POST | `/billing/comprar-pacote` | bearer (admin empresa/sistema) | Compra pacote adicional | `{ empresaId, pacoteId, billingType }` |
| POST | `/billing/webhook/asaas` | asaas-token | Recebe eventos de pagamento do Asaas | payload Asaas |

## Next.js Route Handlers (`apps/web/app/api`)

| Método | Rota | Auth | Propósito | Body (principais) |
|--------|------|------|-----------|-------------------|
| POST | `/api/usuarios/criar` | bearer (`usuarios.criar`) | Cria usuário OU vincula pessoa existente à empresa | `{ email?, nome, cpf, telefone, senhaTemp, empresaId, perfilId, unidades[] }` |
| POST | `/api/usuarios/inativar` | bearer (`usuarios.editar`) | Inativa usuário (`status='inativo'`) | `{ usuarioId }` |
| POST | `/api/usuarios/importar` | bearer (`usuarios.criar`) | Importação em massa de usuários | `{ usuarios[], empresaId, fonte?, ... }` |
| POST | `/api/usuarios/impersonar` | bearer (admin_sistema) | Gera magic link de login (logar como) | `{ email }` → `{ link }` |
| POST | `/api/usuarios/resetar-senha` | bearer (admin sistema/gestor c/ permissão) | Envia código de redefinição por WhatsApp | `{ usuarioId }` |
| POST | `/api/auth/solicitar-codigo` | pública (anti-enumeração) | Solicita OTP de recuperação | `{ identificador }` |
| POST | `/api/auth/verificar-codigo` | pública | Verifica OTP, devolve token de sessão | `{ codigo, ... }` |
| POST | `/api/auth/definir-senha` | pública (token de sessão) | Define nova senha (token de uso único) | `{ token, senha }` |
| POST | `/api/ajuda` | bearer (autenticado) | Assistente de IA (failover `ia_provedores`) | `{ pergunta, contexto? }` |
| POST | `/api/templates/gerar` | bearer (admin_sistema) | Gera template de checklist com IA | `{ ... }` |
| POST | `/api/execucoes/[id]/pdf` | bearer (autenticado) | Gera PDF da execução sob demanda | — (id na rota) → PDF |
| POST | `/api/documentos/consultar` | bearer (autenticado) | Consulta inteligente (IA) sobre documento | `{ documento, pergunta }` |

---

## Notas
- **Crons** (`x-cron-secret`) são disparados pelo cron-job.org com o header
  `x-cron-secret: $CRON_SECRET`. Ver `/ops`.
- **IA** (`/api/ajuda`, `/api/documentos/consultar`, `/api/templates/gerar`)
  usa failover multi-provedor via `ia_provedores`; loga falhas em `ia_falhas`.
- Toda criação de client supabase-js na API Fastify (Node 20 no Railway) precisa
  de `{ realtime: { transport: ws } }` — ver `/uimap`/`/ops`.
