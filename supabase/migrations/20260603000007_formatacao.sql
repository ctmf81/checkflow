-- Labels de terminologia por unidade
alter table unidades add column if not exists grupo_label    text default 'Grupo';
alter table unidades add column if not exists subgrupo_label text default 'Subgrupo';
