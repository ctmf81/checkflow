-- Adiciona ultima_empresa_id em sessao_usuario para restaurar
-- automaticamente a empresa ativa ao recarregar a página,
-- evitando pedir escolha toda vez para usuários com múltiplas empresas.

alter table sessao_usuario
  add column if not exists ultima_empresa_id uuid references empresas(id) on delete set null;
