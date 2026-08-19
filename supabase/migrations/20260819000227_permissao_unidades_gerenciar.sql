-- Adiciona permissão `unidades.gerenciar` (cria/edita/desativa unidade da empresa).
-- Antes: só admin_sistema / admin_empresa podiam via RLS, sem permissão discreta.
-- Agora: gate visual da UI usa `usuario_tem_permissao('unidades', 'gerenciar')`
-- e admins recebem via seed (mesmo padrão de grupos.criar).

insert into permissoes (recurso, acao, descricao) values
  ('unidades', 'gerenciar', 'Criar, editar e desativar unidades da empresa')
on conflict (recurso, acao) do nothing;

insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from perfis pf
join permissoes p on p.recurso = 'unidades' and p.acao = 'gerenciar'
where pf.is_system = true
  and pf.id <> '00000000-0000-0000-0000-000000000003'  -- Operação
on conflict do nothing;

-- Cleanup preventivo (mesmo caso do grupos.criar: seed antigo pode ter pegado Operação)
delete from perfil_permissoes pp
using permissoes p
where pp.permissao_id = p.id
  and p.recurso = 'unidades' and p.acao = 'gerenciar'
  and pp.perfil_id = '00000000-0000-0000-0000-000000000003';
