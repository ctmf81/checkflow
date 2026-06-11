-- ============================================================
-- Recuperacao/definicao de senha via codigo (WhatsApp + e-mail)
-- ============================================================
-- Suporta 3 fluxos, todos baseados em codigo numerico de 6 digitos:
--   - primeiro_acesso: enviado automaticamente ao criar/importar usuario
--   - reset_admin:     disparado por um gestor (permissao usuarios.editar)
--   - self_service:    "esqueci minha senha" a partir do CPF
--
-- Apos o codigo ser validado, gera-se uma segunda linha (tipo
-- 'sessao_senha') com um token de uso unico para a etapa de definir
-- a nova senha — evita reaproveitar o codigo OTP como sessao.
--
-- Tabela so e acessada por rotas server-side com a service role key
-- (bypassa RLS) — sem policies para anon/authenticated.

create table if not exists password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  tipo        text not null check (tipo in ('primeiro_acesso','reset_admin','self_service','sessao_senha')),
  codigo_hash text not null,
  criado_por  uuid references usuarios(id),
  expira_em   timestamptz not null,
  tentativas  int not null default 0,
  usado       boolean not null default false,
  criado_em   timestamptz not null default now()
);

create index if not exists password_reset_tokens_usuario_idx
  on password_reset_tokens (usuario_id, tipo, usado, expira_em);

alter table password_reset_tokens enable row level security;
-- Sem policies: apenas service role (rotas /api/auth/*) acessa esta tabela.
