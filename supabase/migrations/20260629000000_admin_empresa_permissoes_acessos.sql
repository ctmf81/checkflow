-- ============================================================
-- Fix: Admin da empresa sem as permissões de "Acessos" (gap de seed)
-- ============================================================
-- O perfil "Admin da empresa" (00000000-0000-0000-0000-000000000002) não tinha as
-- permissões dos recursos de Acessos (usuarios, unidades, perfis) nem empresas.ver/
-- editar. Consequência: o admin da empresa não conseguia gerenciar usuários da
-- própria empresa nem aprovar pré-cadastros — a rota /api/usuarios/criar chama
-- autorizarPermissao('usuarios','criar'), que via usuario_tem_permissao() retornava
-- false (o perfil não tinha a permissão em perfil_permissoes) → 403 "Você não tem
-- permissão para esta ação".
--
-- Concede ao perfil os recursos que o admin administra DENTRO da empresa. Mantém
-- empresas.criar/deletar de fora (ações de sistema; a RLS já bloquearia, mas a
-- semântica fica correta). Idempotente.

insert into perfil_permissoes (perfil_id, permissao_id)
select '00000000-0000-0000-0000-000000000002', p.id
from permissoes p
where p.recurso in ('usuarios', 'unidades', 'perfis')
   or (p.recurso = 'empresas' and p.acao in ('ver', 'editar'))
on conflict do nothing;
