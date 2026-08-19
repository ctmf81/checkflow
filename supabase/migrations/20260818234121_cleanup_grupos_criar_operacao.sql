-- Cleanup: o seed da migration 20260818233923 usou `where pf.is_system = true`
-- e Operação (perfil is_system) recebeu grupos.criar erroneamente. Remove.
delete from perfil_permissoes pp
using permissoes p
where pp.permissao_id = p.id
  and p.recurso = 'grupos' and p.acao = 'criar'
  and pp.perfil_id = '00000000-0000-0000-0000-000000000003';
