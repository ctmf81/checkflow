-- ============================================================
-- LIMPEZA DE MÍDIA POR TEMPO DE GUARDA
-- ============================================================
-- Marca quando a mídia (fotos/vídeos/PDF) de uma execução foi
-- removida do Storage por ter passado de checklist_execucoes.data_expiracao.
-- O registro da execução (respostas, status, datas) é preservado —
-- só a mídia é removida. Usado pela rotina POST /cron/limpeza-execucoes
-- (apps/api) para evitar reprocessar a mesma execução.

alter table checklist_execucoes
  add column if not exists midia_removida_em timestamptz;

create index if not exists idx_execucoes_midia_removida
  on checklist_execucoes(data_expiracao)
  where midia_removida_em is null;
