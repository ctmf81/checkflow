-- ============================================================
-- Registra o motivo escolhido quando o checklist inteiro não
-- pôde ser executado (tipo='checklist' em nao_execucao_motivos).
-- Motivos de não execução de ATIVIDADE individual ficam
-- guardados dentro do JSON da própria resposta
-- ({ _nao_executavel: true, motivo_id, motivo_descricao, observacao }).
-- ============================================================

alter table checklist_execucoes
  add column if not exists motivo_nao_execucao_id  uuid references nao_execucao_motivos(id) on delete set null,
  add column if not exists motivo_nao_execucao_obs text;

create index if not exists idx_execucoes_motivo_nao_exec on checklist_execucoes(motivo_nao_execucao_id);
