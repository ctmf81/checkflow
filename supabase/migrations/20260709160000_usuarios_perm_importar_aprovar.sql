-- ============================================================
-- Permissões granulares de Usuários: 'importar' e 'aprovar_precadastro'
-- ============================================================
-- Antes, importar usuários e aprovar pré-cadastro exigiam 'usuarios','criar'
-- (mesma permissão de criar usuário avulso) e os botões apareciam pra qualquer
-- um na tela. Agora são capacidades separadas, montáveis no construtor de perfil
-- e enforçadas no servidor (/api/usuarios/importar e /criar com viaPreCadastro).
--
-- Backfill: quem já tem 'usuarios','criar' recebe as duas novas — ninguém perde
-- acesso no deploy. Perfis de sistema também recebem.

insert into permissoes (recurso, acao, descricao) values
  ('usuarios', 'importar',            'Importar usuários em massa (planilha)'),
  ('usuarios', 'aprovar_precadastro', 'Aprovar / moderar pré-cadastros')
on conflict (recurso, acao) do nothing;

-- Backfill: todo perfil que já pode criar usuário mantém importar + aprovar
insert into perfil_permissoes (perfil_id, permissao_id)
select pp.perfil_id, p_new.id
from perfil_permissoes pp
join permissoes p_criar
  on p_criar.id = pp.permissao_id and p_criar.recurso = 'usuarios' and p_criar.acao = 'criar'
join permissoes p_new
  on p_new.recurso = 'usuarios' and p_new.acao in ('importar', 'aprovar_precadastro')
on conflict do nothing;

-- Perfis de sistema (Administrador) recebem as novas permissões
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from perfis pf
join permissoes p on p.recurso = 'usuarios' and p.acao in ('importar', 'aprovar_precadastro')
where pf.is_system = true
on conflict do nothing;
