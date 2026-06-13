-- ============================================================
-- INTEGRAÇÕES DE IA — provedores da Consulta Inteligente
-- ============================================================
-- Permite ao admin de sistema gerenciar pela UI (/sistema/integracoes-ia)
-- as chaves dos provedores de IA usados no failover da rota
-- /api/documentos/consultar, sem precisar mexer nas env vars do Railway.
--
-- Segurança:
--   - RLS admin-only (is_admin_sistema()) — nenhum outro papel lê/escreve.
--   - A `api_key` é lida APENAS no servidor (rota usa service key); a UI nunca
--     seleciona essa coluna — exibe `chave_mascara` (ex "••••1234").
--   - A rota usa o banco como fonte primária e as env vars como fallback.

create table if not exists ia_provedores (
  id            uuid primary key default gen_random_uuid(),
  provedor      text not null unique check (provedor in ('gemini','anthropic','openai','groq')),
  api_key       text,                       -- secreta — só lida no servidor
  chave_mascara text,                        -- ex "••••1234" — segura para exibir
  modelo        text,                        -- override do modelo (null = default do código)
  ativo         boolean not null default true,
  ordem         integer not null default 0,  -- ordem de tentativa no failover
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create index if not exists idx_ia_provedores_ordem on ia_provedores (ordem) where ativo;

alter table ia_provedores enable row level security;
drop policy if exists "ia_provedores_admin" on ia_provedores;
create policy "ia_provedores_admin" on ia_provedores for all
  using (is_admin_sistema()) with check (is_admin_sistema());

-- Semeia as 4 linhas (sem chave) para a UI já listar os provedores
insert into ia_provedores (provedor, ordem, ativo) values
  ('gemini', 1, true),
  ('anthropic', 2, true),
  ('openai', 3, true),
  ('groq', 4, true)
on conflict (provedor) do nothing;

-- Onboarding da nova tela (regra de evolução)
insert into onboarding_paginas (page_id, titulo, ativo)
values ('sistema-integracoes-ia', 'Integrações de IA', true)
on conflict (page_id) do nothing;
