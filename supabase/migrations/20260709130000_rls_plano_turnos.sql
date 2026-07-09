-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2): rollout p/ TURNOS
-- ============================================================
-- Recurso 'turnos'. Config/autoria (turnos e regras de acesso/notificação) →
-- gate em toda a escrita (escrita + admin_empresa). Leitura intacta (turnos já
-- configurados seguem valendo em usuario_esta_no_turno).
-- turnos é escopado por empresa_id DIRETO na linha (sem unidade), então o gate
-- usa turnos.empresa_id direto.
-- Opt-in: empresa sem plano/serviços → empresa_libera_recurso = true → sem mudança.

drop policy if exists "turnos_escrita" on turnos;
create policy "turnos_escrita" on turnos for all
  using (
    is_admin_sistema()
    or (
      empresa_libera_recurso(turnos.empresa_id, 'turnos')
      and empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
    )
  )
  with check (
    is_admin_sistema()
    or (
      empresa_libera_recurso(turnos.empresa_id, 'turnos')
      and empresa_id in (select empresa_id from usuario_empresa where usuario_id = auth.uid())
    )
  );

drop policy if exists "turnos_admin_empresa" on turnos;
create policy "turnos_admin_empresa" on turnos for all
  using (is_admin_empresa(empresa_id) and empresa_libera_recurso(turnos.empresa_id, 'turnos'))
  with check (is_admin_empresa(empresa_id) and empresa_libera_recurso(turnos.empresa_id, 'turnos'));
