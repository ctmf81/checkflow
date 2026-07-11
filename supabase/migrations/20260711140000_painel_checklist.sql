-- ============================================================
-- PAINEL — novo tipo "checklist" + tempo de execução
-- ============================================================
-- Até aqui um painel só monitorava UMA atividade (atividade_id). Agora ele pode
-- monitorar um CHECKLIST inteiro: placar de execução, conformidade no tempo, top
-- atividades não conformes, tratamento (planos) e não execução.
--   tipo = 'atividade' → usa atividade_id (comportamento atual; default)
--   tipo = 'checklist' → usa checklist_id
-- CHECK garante exatamente um alvo conforme o tipo. Painéis existentes já
-- satisfazem o default ('atividade' + atividade_id preenchido).
alter table dashboard_paineis
  add column if not exists tipo text not null default 'atividade'
    check (tipo in ('atividade', 'checklist')),
  add column if not exists checklist_id uuid references checklists(id) on delete cascade;

alter table dashboard_paineis alter column atividade_id drop not null;

alter table dashboard_paineis drop constraint if exists dashboard_paineis_alvo_ck;
alter table dashboard_paineis add constraint dashboard_paineis_alvo_ck check (
  (tipo = 'atividade' and atividade_id is not null and checklist_id is null)
  or (tipo = 'checklist' and checklist_id is not null and atividade_id is null)
);

create index if not exists idx_dashboard_paineis_checklist on dashboard_paineis(checklist_id);

-- ── Tempo de execução ────────────────────────────────────────
-- `data_execucao`/`criado_em` marcam o FIM (a linha nasce no finalizar). Sem um
-- marco de início não dá pra medir duração. `iniciado_em` é carimbado pelo
-- cliente na abertura e só para execução "de uma vez" (fresh insert) — retomada,
-- agendada, workflow e offline ficam null e saem da média de tempo. Execuções
-- antigas ficam null (o tempo médio passa a valer da ativação em diante).
alter table checklist_execucoes
  add column if not exists iniciado_em timestamptz;
