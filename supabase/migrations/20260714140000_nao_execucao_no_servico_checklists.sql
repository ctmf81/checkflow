-- "Motivos de não execução" (recurso 'nao_execucao') não pertencia a nenhum
-- serviço → num plano configurado ele sumia do menu até para o admin da empresa
-- (mesmo bug dos recursos core, mas este NÃO é core: é config operacional ligada
-- aos checklists). Decisão: entra junto com o serviço Checklists.
update servicos
set recursos = array(select distinct unnest(recursos || array['nao_execucao']))
where chave = 'checklists';
