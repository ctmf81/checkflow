-- ============================================================
-- VÍDEO TUTORIAL POR TELA — cadastrado pelo admin do sistema
-- ============================================================
-- O assistente de ajuda mostra um ícone de vídeo quando a tela atual tem um
-- vídeo cadastrado (YouTube ou Google Drive). Sem cadastro, o ícone não
-- aparece. Uma tela = um vídeo (rota única).
create table if not exists ajuda_videos (
  id            uuid primary key default uuid_generate_v4(),
  rota          text not null,
  titulo        text,
  url           text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists idx_ajuda_videos_rota on ajuda_videos(rota);

-- Leitura: qualquer autenticado vê os ativos (o vídeo é o mesmo para todas as
-- empresas, como `termos_uso` e `ajuda_artigos`); admin vê tudo.
-- Escrita: só admin_sistema.
alter table ajuda_videos enable row level security;

drop policy if exists "ajuda_videos_leitura" on ajuda_videos;
create policy "ajuda_videos_leitura" on ajuda_videos
  for select using (ativo or is_admin_sistema());

drop policy if exists "ajuda_videos_admin" on ajuda_videos;
create policy "ajuda_videos_admin" on ajuda_videos
  for all using (is_admin_sistema()) with check (is_admin_sistema());
