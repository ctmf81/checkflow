-- ============================================================
-- Plano "padrão" — o plano com que toda empresa nova começa
-- ============================================================
-- O admin de sistema marca UM plano (tipicamente gratuito/trial) como padrão.
-- Toda empresa criada nasce com ele; depois o admin pode trocar por outro plano
-- gratuito conforme o porte/interesse da empresa.
-- Índice parcial único garante no máximo um plano padrão.

alter table planos add column if not exists padrao boolean not null default false;

create unique index if not exists planos_padrao_unico on planos (padrao) where padrao;
