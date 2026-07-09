-- ============================================================
-- Índice composto p/ os painéis de Dashboard (janela por atividade)
-- ============================================================
-- A rota /api/painel filtra checklist_execucao_respostas por
-- (atividade_id = X AND criado_em >= corte) ORDER BY criado_em. Com só o índice
-- de atividade_id, o filtro de tempo é pós-scan. O composto vira range scan
-- enxuto — barato mesmo em atividade muito movimentada, sem competir com o
-- transacional (leitura, MVCC não trava escrita).

create index if not exists idx_respostas_atividade_criado
  on checklist_execucao_respostas (atividade_id, criado_em);
