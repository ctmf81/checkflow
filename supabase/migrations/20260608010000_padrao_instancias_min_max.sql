-- Ajuste de modelo (feedback do usuário 2026-06-08): a instância de um
-- padrão não usa "valor esperado ± margem de tolerância" — usa uma
-- FAIXA [mínimo, máximo] direta, igual à validação do tipo "número".
-- Substitui valor_esperado/margem por valor_min/valor_max (nullable —
-- pode ter só piso, só teto, ou ambos).

alter table padrao_instancias
  add column if not exists valor_min numeric,
  add column if not exists valor_max numeric;

-- Migra dados existentes (se houver): faixa = esperado ± margem
update padrao_instancias
   set valor_min = valor_esperado - coalesce(margem, 0),
       valor_max = valor_esperado + coalesce(margem, 0)
 where valor_min is null and valor_max is null;

alter table padrao_instancias
  drop column if exists valor_esperado,
  drop column if exists margem;

alter table padrao_instancias
  add constraint padrao_instancias_min_max_check
  check (valor_min is null or valor_max is null or valor_min <= valor_max);
