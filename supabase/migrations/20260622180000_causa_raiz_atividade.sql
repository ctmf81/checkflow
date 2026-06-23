-- ============================================================
-- Causa raiz pré-vinculada a uma ATIVIDADE (campo) de um checklist.
--
-- Antes, causa_raiz só tinha escopo grupo/subgrupo e era órfã (não
-- entrava no fluxo do plano de ação). Agora cada causa raiz aponta para
-- um checklist e uma de suas atividades — a base para, na moderação de
-- uma não conformidade daquele campo, oferecer as causas raiz cadastradas.
--
-- Cascade: se o checklist/atividade for excluído, a causa raiz vai junto
-- (não faz sentido manter uma causa apontando para um campo inexistente).
-- ============================================================

alter table causa_raiz
  add column if not exists checklist_id uuid references checklists(id) on delete cascade,
  add column if not exists atividade_id uuid references checklist_atividades(id) on delete cascade;

create index if not exists idx_causa_raiz_atividade on causa_raiz(atividade_id);
create index if not exists idx_causa_raiz_checklist on causa_raiz(checklist_id);
