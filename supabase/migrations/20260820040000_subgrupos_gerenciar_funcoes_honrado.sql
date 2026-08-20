-- Auditoria 2026-08-20 identificou: permissão `subgrupos.gerenciar_funcoes`
-- existia no banco e no construtor de perfis mas nenhuma policy a testava.
-- A `usuario_subgrupo_permissao` (via `usuario_pode_gerir_subgrupo`) só checa
-- `grupos.gerenciar_usuario OR grupos.adicionar_usuario` — atribuir função
-- N1/N2 dependia dessas, não da permissão nominal `subgrupos.gerenciar_funcoes`.
-- Efeito: checkbox no perfil "Gestão de funções (N1/N2/Executor)" era inerte.
--
-- Fix: expande `usuario_pode_gerir_subgrupo` para aceitar também
-- `subgrupos.gerenciar_funcoes`. Semanticamente: quem tem essa permissão pode
-- mexer nos vínculos usuario↔subgrupo (que é onde a função vive). Broadening
-- via OR — usuários que só têm gerenciar_usuario não perdem nada.
--
-- Alternativa considerada: separar em policies FOR INSERT/UPDATE/DELETE
-- distintas com regras finas. Descartada — a permissão declarada no /biz é
-- ampla ("gerenciar funções"), e a granulação fina não foi pedida.

create or replace function usuario_pode_gerir_subgrupo(p_subgrupo_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    (usuario_tem_permissao('grupos', 'gerenciar_usuario')
      or usuario_tem_permissao('grupos', 'adicionar_usuario')
      or usuario_tem_permissao('subgrupos', 'gerenciar_funcoes'))
    and exists (
      select 1 from subgrupos s
      join grupos g on g.id = s.grupo_id
      join unidades u on u.id = g.unidade_id
      join usuario_empresa ue on ue.empresa_id = u.empresa_id
      where s.id = p_subgrupo_id
        and ue.usuario_id = auth.uid()
    )
$$;
