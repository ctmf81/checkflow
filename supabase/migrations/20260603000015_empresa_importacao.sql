alter table empresas
  add column if not exists importacao_api_url       text,
  add column if not exists importacao_api_headers   jsonb default '{}',
  add column if not exists importacao_api_mapeamento jsonb default '{}';
