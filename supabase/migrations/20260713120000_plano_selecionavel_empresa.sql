-- ============================================================
-- PLANOS — visibilidade para auto-serviço da empresa
-- ============================================================
-- Distingue planos que a EMPRESA pode contratar sozinha (auto-serviço em
-- /gestao/plano) dos que SÓ o admin de sistema atribui (ex.: trial, cortesia).
-- Antes a regra era fixa (`tipo='pago'`); agora é uma escolha por plano.
--   selecionavel_empresa = true  → aparece em "Planos disponíveis" p/ a empresa
--   selecionavel_empresa = false → só o admin atribui (mas o plano ATUAL da
--                                   empresa continua visível no topo, enquanto ativo)
-- Regra de produto (na UI): estando num plano PAGO, a empresa não pode voltar a
-- um não-pago por conta própria (o admin ainda pode).
alter table planos
  add column if not exists selecionavel_empresa boolean not null default false;

-- Backfill: preserva o comportamento vigente (empresa auto-seleciona os pagos).
update planos set selecionavel_empresa = true where tipo = 'pago';
