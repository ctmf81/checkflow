-- Permite múltiplos vídeos por rota (ex.: montagem de checklist tem 1 vídeo pra
-- fluxo, 1 pra tipos de campo, 1 pra opções). Ordem controla o carrossel do modal.
drop index if exists idx_ajuda_videos_rota;
alter table ajuda_videos add column if not exists ordem integer not null default 0;
create index if not exists idx_ajuda_videos_rota on ajuda_videos(rota);
