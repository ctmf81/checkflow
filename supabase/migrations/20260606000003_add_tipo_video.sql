-- Adiciona 'video' ao check constraint do tipo de atividade
-- O frontend já suporta o tipo; sem esta migration, inserir atividade
-- do tipo 'video' causa erro de constraint no Postgres.

alter table checklist_atividades
  drop constraint if exists checklist_atividades_tipo_check;

alter table checklist_atividades
  add constraint checklist_atividades_tipo_check
  check (tipo in (
    'sim_nao',
    'numero',
    'texto',
    'multipla_escolha',
    'catalogo',
    'foto',
    'video',
    'assinatura',
    'data_hora',
    'localizacao'
  ));
