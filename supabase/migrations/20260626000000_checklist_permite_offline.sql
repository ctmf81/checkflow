-- ============================================================
-- CHECKLIST — permite execução offline?
-- ============================================================
-- true  = o checklist pode ser respondido sem internet (PWA): sua definição
--         é pré-cacheada e ele aparece na lista de operação mesmo offline.
-- false = exige conexão para ser executado (padrão).
--
-- Opt-in conservador: por padrão nada é offline; o gestor marca explicitamente
-- quais checklists são seguros/úteis para uso em campo sem sinal.

alter table checklists
  add column if not exists permite_offline boolean not null default false;
