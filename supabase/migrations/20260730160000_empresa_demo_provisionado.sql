-- ============================================================
-- EMPRESA DEMO — flag de estrutura provisionada
-- ============================================================
-- Separa as duas etapas do gerador de demo:
--   • "Gerar estrutura" (1x): cria unidade/grupos/subgrupos, catálogos,
--     perfis (Coordenador), usuários, checklists publicados, causa raiz,
--     tickets e tarefas. Marca demo_provisionado=true.
--   • "Gerar dados dos últimos 30 dias" (repetível): só acrescenta execuções
--     e planos de ação. Só habilitado quando demo_provisionado=true.
alter table empresas add column if not exists demo_provisionado boolean not null default false;

comment on column empresas.demo_provisionado is
  'Empresa demo já teve a estrutura gerada (grupos/checklists/usuários). Controla os 2 botões: Gerar estrutura (1x) vs Gerar dados (repetível).';
