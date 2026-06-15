-- ============================================================
-- FIX: admin_sistema sem linha em usuario_unidade não conseguia
-- ler/criar tickets, eventos, evidências e categorias
-- ============================================================
-- As policies de tickets (leitura/criação) e das tabelas relacionadas
-- (ticket_eventos, ticket_evidencias, ticket_categorias, ticket_sla_config)
-- exigem `exists (select 1 from usuario_unidade uu where uu.usuario_id =
-- auth.uid() and uu.unidade_id = ...)`. Um usuário com role
-- "admin_sistema" não necessariamente tem linha em usuario_unidade
-- (ele acessa tudo via is_admin_sistema()), então o `exists` fica
-- falso e o insert/select falha com 42501 — mesmo após o fix anterior
-- (usuario_unidade_propria), pois o problema aqui é ausência da linha,
-- não falta de visibilidade dela.
--
-- tickets_atualizar já tinha "or is_admin_sistema()" — aplicando o
-- mesmo padrão nas demais.

drop policy if exists "tickets_leitura" on tickets;
create policy "tickets_leitura" on tickets
  for select using (
    is_admin_sistema()
    or exists (
      select 1 from usuario_unidade uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = tickets.unidade_id
    )
  );

drop policy if exists "tickets_criar" on tickets;
create policy "tickets_criar" on tickets
  for insert with check (
    is_admin_sistema()
    or exists (
      select 1 from usuario_unidade uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = tickets.unidade_id
    )
  );

drop policy if exists "ticket_eventos_leitura" on ticket_eventos;
create policy "ticket_eventos_leitura" on ticket_eventos
  for select using (
    is_admin_sistema()
    or exists (
      select 1 from tickets t
      join usuario_unidade uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_eventos.ticket_id and uu.usuario_id = auth.uid()
    )
  );

drop policy if exists "ticket_eventos_inserir" on ticket_eventos;
create policy "ticket_eventos_inserir" on ticket_eventos
  for insert with check (
    is_admin_sistema()
    or exists (
      select 1 from tickets t
      join usuario_unidade uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_eventos.ticket_id and uu.usuario_id = auth.uid()
    )
  );

drop policy if exists "ticket_evidencias_leitura" on ticket_evidencias;
create policy "ticket_evidencias_leitura" on ticket_evidencias
  for select using (
    is_admin_sistema()
    or exists (
      select 1 from tickets t
      join usuario_unidade uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_evidencias.ticket_id and uu.usuario_id = auth.uid()
    )
  );

drop policy if exists "ticket_evidencias_inserir" on ticket_evidencias;
create policy "ticket_evidencias_inserir" on ticket_evidencias
  for insert with check (
    is_admin_sistema()
    or exists (
      select 1 from tickets t
      join usuario_unidade uu on uu.unidade_id = t.unidade_id
      where t.id = ticket_evidencias.ticket_id and uu.usuario_id = auth.uid()
    )
  );

drop policy if exists "ticket_categorias_leitura" on ticket_categorias;
create policy "ticket_categorias_leitura" on ticket_categorias
  for select using (
    is_admin_sistema()
    or exists (
      select 1 from usuario_unidade uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = ticket_categorias.unidade_id
    )
  );

drop policy if exists "ticket_sla_leitura" on ticket_sla_config;
create policy "ticket_sla_leitura" on ticket_sla_config
  for select using (
    is_admin_sistema()
    or exists (
      select 1 from usuario_unidade uu
      where uu.usuario_id = auth.uid() and uu.unidade_id = ticket_sla_config.unidade_id
    )
  );
