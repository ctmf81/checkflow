-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2) — função + piloto Dashboards
-- ============================================================
-- Função central que espelha a regra do gating de UI (opt-in):
--   • empresa sem plano ativo            → LIBERA (true)
--   • plano sem NENHUM serviço configurado → LIBERA (true)
--   • senão → libera só se algum serviço-módulo ATIVO do plano contém o recurso
-- Assim empresas atuais (sem serviços no plano) não são afetadas. Aplica-se aqui
-- só à ESCRITA de Dashboards (piloto); rolar p/ os demais módulos é incremental.

create or replace function empresa_libera_recurso(p_empresa_id uuid, p_recurso text)
returns boolean language sql security definer stable as $$
  select case
    when p_empresa_id is null then true
    when not exists (
      select 1 from empresa_assinaturas ea
      where ea.empresa_id = p_empresa_id and ea.plano_id is not null
    ) then true
    when not exists (
      select 1 from plano_servicos ps
      join empresa_assinaturas ea on ea.plano_id = ps.plano_id
      where ea.empresa_id = p_empresa_id
    ) then true
    else exists (
      select 1 from plano_servicos ps
      join empresa_assinaturas ea on ea.plano_id = ps.plano_id
      join servicos s on s.id = ps.servico_id
      where ea.empresa_id = p_empresa_id
        and s.tipo = 'modulo' and s.ativo
        and p_recurso = any (s.recursos)
    )
  end;
$$;

-- Escrita de Dashboards passa a exigir que o plano da empresa libere 'dashboards'
-- (admin de sistema ignora). Recria a policy 20260709030000 com o gate.
drop policy if exists "dashboards_escrita" on dashboards;
create policy "dashboards_escrita" on dashboards for all
  using (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = dashboards.unidade_id), 'dashboards')
      and (
        is_admin_empresa_unidade(unidade_id)
        or (unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
            and usuario_tem_permissao('dashboards', 'criar'))
      )
    )
  )
  with check (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = dashboards.unidade_id), 'dashboards')
      and (
        is_admin_empresa_unidade(unidade_id)
        or (unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
            and usuario_tem_permissao('dashboards', 'criar'))
      )
    )
  );
