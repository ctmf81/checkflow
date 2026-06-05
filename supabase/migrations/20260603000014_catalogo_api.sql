alter table catalogos
  add column if not exists api_url       text,
  add column if not exists api_headers   jsonb default '{}',
  add column if not exists api_mapeamento jsonb default '{}';
-- api_mapeamento ex: {"campo_chave":"cod","atributo_1":"nome","atributo_2":"acabamento"}
