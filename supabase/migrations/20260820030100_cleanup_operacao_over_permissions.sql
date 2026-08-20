-- Auditoria 2026-08-20 identificou over-permissions herdadas no perfil
-- "Operação" (id 00000000-0000-0000-0000-000000000003).
--
-- Origem: `20260607100332_permissoes_faltantes.sql` fez INSERT em massa em
-- perfil_permissoes para TODOS os perfis is_system (incluindo Operação), quando
-- a regra é: Operação NÃO recebe permissões de gestão automaticamente. Grupos.criar
-- e unidades.gerenciar já foram limpos preventivamente (20260818234121 e
-- 20260819000227). Este cleanup pega o legado remanescente.
--
-- Recursos que o operador não deve gerenciar: workflows, turnos, catalogos,
-- documentos, causa_raiz, nao_execucao, subgrupos.gerenciar_funcoes,
-- grupos.adicionar_usuario, grupos.gerenciar_usuario. Se o cliente decidir dar
-- alguma dessas a um operador específico, cria um perfil custom E marca a
-- permissão no construtor — não pela herança silenciosa do seed.

with permissoes_legadas as (
  select p.id
  from permissoes p
  where
    p.recurso in ('workflows', 'turnos', 'catalogos', 'documentos', 'causa_raiz', 'nao_execucao')
    or (p.recurso = 'subgrupos' and p.acao = 'gerenciar_funcoes')
    or (p.recurso = 'grupos' and p.acao in ('adicionar_usuario', 'gerenciar_usuario'))
)
delete from perfil_permissoes pp
using permissoes_legadas pl
where pp.perfil_id = '00000000-0000-0000-0000-000000000003'
  and pp.permissao_id = pl.id;
