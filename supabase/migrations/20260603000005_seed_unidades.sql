-- Cria unidade padrão para empresas existentes que ainda não têm unidade
insert into unidades (nome, empresa_id, status)
select 'Unidade padrão', e.id, 'ativo'
from empresas e
where not exists (
  select 1 from unidades u where u.empresa_id = e.id
);
