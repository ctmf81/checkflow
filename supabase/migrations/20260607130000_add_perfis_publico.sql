-- BUG: "Could not find the 'publico' column of 'perfis' in the schema cache"
-- A coluna `publico` é referenciada pelo PerfilModal (UI), pelo trigger
-- validar_troca_perfil() (migration 20260607100800) e pela enforcement em
-- UsuarioModal — mas nunca foi de fato adicionada à tabela `perfis`.

alter table perfis
  add column if not exists publico boolean not null default false;

comment on column perfis.publico is
  'Se true, o perfil pode ser atribuído por gestores de grupo/setor (não só pelo admin da empresa) — ex: cobertura temporária de liderança.';
