-- ============================================================
-- CHECKLIST — modo de execução: pode continuar depois?
-- ============================================================
-- true  = execução pausável (operador pode "Continuar depois"; pendências
--         iniciadas e não terminadas aparecem na Operação)
-- false = execução de uma vez (sem atalhos para sair durante a execução)

alter table checklists
  add column if not exists permite_continuar_depois boolean not null default true;
