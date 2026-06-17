-- ============================================================
-- LOG DE FALHAS DE IA (failover)
-- ============================================================
-- Registra quando um provedor de IA falha durante a execução (assistente
-- de ajuda ou Consulta Inteligente) e o sistema passa para o próximo.
-- Dá visibilidade ao admin (ex: Gemini sem cota caindo no Groq).
create table if not exists ia_falhas (
  id          uuid primary key default uuid_generate_v4(),
  contexto    text not null,            -- 'ajuda' | 'consulta'
  provedor    text not null,
  modelo      text,
  erro        text,
  empresa_id  uuid references empresas(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_ia_falhas_criado_em on ia_falhas(criado_em desc);

alter table ia_falhas enable row level security;
drop policy if exists "ia_falhas_admin" on ia_falhas;
create policy "ia_falhas_admin" on ia_falhas for all
  using (is_admin_sistema()) with check (is_admin_sistema());
