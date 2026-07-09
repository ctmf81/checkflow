-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2): rollout p/ AGENDAMENTOS
-- ============================================================
-- Recurso 'agendamentos'. Config/autoria (agendar checklist recorrente) → gate
-- em toda a escrita (escrita_permissao + admin_empresa). Leitura intacta.
-- NOTA: o cron que dispara execuções usa service role (ignora RLS) → downgrade
-- via RLS bloqueia NOVA autoria de agendamento, mas não pausa agendamentos já
-- existentes (isso é regra de produto do cron, fora do escopo desta RLS).
-- Opt-in: empresa sem plano/serviços → empresa_libera_recurso = true → sem mudança.

drop policy if exists "agendamentos_escrita" on agendamentos;
create policy "agendamentos_escrita" on agendamentos for all
  using (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = agendamentos.unidade_id), 'agendamentos')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (
        usuario_tem_permissao('agendamentos', 'criar')
        or usuario_tem_permissao('agendamentos', 'editar')
        or usuario_tem_permissao('agendamentos', 'deletar')
      )
    )
  )
  with check (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = agendamentos.unidade_id), 'agendamentos')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (
        usuario_tem_permissao('agendamentos', 'criar')
        or usuario_tem_permissao('agendamentos', 'editar')
      )
    )
  );

drop policy if exists "agendamentos_admin_empresa" on agendamentos;
create policy "agendamentos_admin_empresa" on agendamentos for all
  using (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = agendamentos.unidade_id), 'agendamentos')
  )
  with check (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = agendamentos.unidade_id), 'agendamentos')
  );
