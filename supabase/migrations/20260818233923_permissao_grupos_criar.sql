-- Adiciona a permissão `grupos.criar` (faltava) + seed pros perfis is_system
-- (admin_sistema e admin_empresa recebem tudo automaticamente).
--
-- Motivação: modelo unificado de gate de UI — toda tela consulta
-- usuario_tem_permissao(recurso, acao). Antes, a tela de Grupos gateava por
-- "isAdmin" porque grupos.criar não existia. Criando a permissão, admins já
-- recebem por seed e todo mundo usa a mesma checagem.
--
-- Perfil per-empresa "Gestão do Grupo" (is_system=false) NÃO recebe — quem
-- cria grupo é admin (design atual). Se algum dia quisermos abrir, é só um
-- insert manual no perfil_permissoes.

insert into permissoes (recurso, acao, descricao) values
  ('grupos', 'criar', 'Criar grupo')
on conflict (recurso, acao) do nothing;

-- Seed pros perfis is_system=true, EXCETO Operação (perfil de check-in
-- na área operacional; não gerencia estrutura). Padrão dos migrations
-- anteriores pegava todo is_system e dava permissão de gestão pra Operação
-- por engano — evita repetir aqui.
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from perfis pf
join permissoes p on p.recurso = 'grupos' and p.acao = 'criar'
where pf.is_system = true
  and pf.id <> '00000000-0000-0000-0000-000000000003'  -- Operação
on conflict do nothing;

-- Cleanup: se o seed acidentalmente entregou grupos.criar pra Operação (por
-- algum re-run ou seed antigo), remover.
delete from perfil_permissoes pp
using permissoes p
where pp.permissao_id = p.id
  and p.recurso = 'grupos' and p.acao = 'criar'
  and pp.perfil_id = '00000000-0000-0000-0000-000000000003';
