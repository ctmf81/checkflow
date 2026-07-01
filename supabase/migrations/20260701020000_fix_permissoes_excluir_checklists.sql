-- ============================================================
-- Fix 1: renomeia 'deletar' → 'excluir' nos 4 recursos que
-- o frontend usa 'excluir' mas a foundation seeded 'deletar'.
-- Os perfil_permissoes existentes apontam por id → não quebra.
-- ============================================================
update permissoes
set acao = 'excluir'
where acao = 'deletar'
  and recurso in ('grupos', 'subgrupos', 'usuarios', 'perfis');

-- ============================================================
-- Fix 2: adiciona permissões de checklists (nunca foram inseridas)
-- ============================================================
insert into permissoes (recurso, acao, descricao) values
  ('checklists', 'criar',         'Criar checklist'),
  ('checklists', 'editar',        'Editar checklist'),
  ('checklists', 'excluir',       'Excluir checklist'),
  ('checklists', 'configuracoes', 'Configurações de checklist'),
  ('checklists', 'duplicar',      'Duplicar checklist')
on conflict (recurso, acao) do nothing;

-- ============================================================
-- Fix 3: garante que os perfis de sistema (admin empresa +
-- operação) recebam todas as permissões de checklists
-- ============================================================
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, pm.id
from perfis pf
cross join permissoes pm
where pf.is_system = true
  and pm.recurso = 'checklists'
on conflict do nothing;
