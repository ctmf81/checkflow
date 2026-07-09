-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2): rollout p/ TICKETS
-- ============================================================
-- Recurso gateado: 'ticket'. Tickets é OPERACIONAL (abrir pelo FAB, assumir,
-- comentar, concluir), diferente da autoria de Documentos/Tarefas. Então:
--   • BLOQUEIA a CRIAÇÃO de ticket novo (sem plano → não usa a feature) e a
--     CONFIG do módulo (categorias/SLA).
--   • NÃO bloqueia tratar/concluir/comentar/evidência em tickets JÁ abertos,
--     nem a leitura — senão um downgrade estrangularia tickets em aberto.
--
-- A criação tem 2 caminhos permissivos (tickets_criar p/ membro da unidade e
-- tickets_admin_empresa p/ admin da empresa). Em vez de mexer nos dois (e
-- arriscar a leitura/update que a policy `for all` admin_empresa também cobre),
-- usa-se UMA policy RESTRICTIVE só de INSERT: ela faz AND com TODAS as
-- permissivas de insert, fechando os dois caminhos de uma vez, sem tocar em
-- select/update/delete. admin de SISTEMA continua livre.
-- Opt-in: empresa sem plano/serviços → empresa_libera_recurso = true → sem mudança.

-- ── Gate de CRIAÇÃO (restritiva, só INSERT — cobre operador e admin_empresa) ──
drop policy if exists "tickets_criar_gate_plano" on tickets;
create policy "tickets_criar_gate_plano" on tickets
  as restrictive for insert
  with check (
    is_admin_sistema()
    or empresa_libera_recurso((select u.empresa_id from unidades u where u.id = tickets.unidade_id), 'ticket')
  );

-- ── CONFIG do módulo (categorias/SLA) — gate na escrita ──
-- `_escrita` é `for all`, mas a leitura tem policy própria (_leitura), então
-- gatear aqui não tira o SELECT. Espelha o padrão de Documentos.
drop policy if exists "ticket_categorias_escrita" on ticket_categorias;
create policy "ticket_categorias_escrita" on ticket_categorias for all
  using (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_categorias.unidade_id), 'ticket')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  )
  with check (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_categorias.unidade_id), 'ticket')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  );

drop policy if exists "ticket_sla_escrita" on ticket_sla_config;
create policy "ticket_sla_escrita" on ticket_sla_config for all
  using (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_sla_config.unidade_id), 'ticket')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  )
  with check (
    is_admin_sistema()
    or (
      empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_sla_config.unidade_id), 'ticket')
      and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('ticket', 'categorias_gerir')
    )
  );

-- ── CONFIG via admin_empresa (20260620120000) — gate na escrita ──
-- São `for all`; ao gatear, o SELECT do admin_empresa nessas config tables cai,
-- mas isso é imaterial (empresa fora do plano não usa tickets; leitura de config
-- não é operação viva) e há _leitura própria p/ membros da unidade.
drop policy if exists "ticket_categorias_admin_empresa" on ticket_categorias;
create policy "ticket_categorias_admin_empresa" on ticket_categorias for all
  using (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_categorias.unidade_id), 'ticket')
  )
  with check (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_categorias.unidade_id), 'ticket')
  );

drop policy if exists "ticket_sla_config_admin_empresa" on ticket_sla_config;
create policy "ticket_sla_config_admin_empresa" on ticket_sla_config for all
  using (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_sla_config.unidade_id), 'ticket')
  )
  with check (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = ticket_sla_config.unidade_id), 'ticket')
  );

-- NÃO alteradas de propósito (operação viva / leitura):
--   tickets_criar (permissiva; o gate vem da restritiva acima),
--   tickets_atualizar, ticket_eventos_inserir, ticket_evidencias_inserir,
--   tickets_admin_empresa, ticket_eventos_admin_empresa, ticket_evidencias_admin_empresa,
--   e todas as *_leitura.
