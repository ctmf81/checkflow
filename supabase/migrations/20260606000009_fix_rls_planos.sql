-- ============================================================
-- Fix RLS: políticas de INSERT nas tabelas filhas de planos_acao
-- Problema: "plano_acao_id in (select id from planos_acao)" usa RLS
-- cascateado, que pode retornar vazio dependendo do contexto.
-- Solução: incluir a verificação de subgrupo explicitamente.
-- ============================================================

-- ── plano_acao_evidencias ────────────────────────────────────

drop policy if exists "plano_ev_insert" on plano_acao_evidencias;
create policy "plano_ev_insert" on plano_acao_evidencias
  for insert with check (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo
        where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_ev_leitura" on plano_acao_evidencias;
create policy "plano_ev_leitura" on plano_acao_evidencias
  for select using (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo
        where usuario_id = auth.uid()
      )
    )
  );

-- ── plano_acao_movimentacoes ─────────────────────────────────

drop policy if exists "plano_mov_insert" on plano_acao_movimentacoes;
create policy "plano_mov_insert" on plano_acao_movimentacoes
  for insert with check (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo
        where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_mov_leitura" on plano_acao_movimentacoes;
create policy "plano_mov_leitura" on plano_acao_movimentacoes
  for select using (
    is_admin_sistema()
    or plano_acao_id in (
      select pa.id from planos_acao pa
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo
        where usuario_id = auth.uid()
      )
    )
  );

-- ── plano_acao_movimentacao_evidencias ───────────────────────

drop policy if exists "plano_mov_ev_insert" on plano_acao_movimentacao_evidencias;
create policy "plano_mov_ev_insert" on plano_acao_movimentacao_evidencias
  for insert with check (
    is_admin_sistema()
    or movimentacao_id in (
      select m.id from plano_acao_movimentacoes m
      join planos_acao pa on pa.id = m.plano_acao_id
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo
        where usuario_id = auth.uid()
      )
    )
  );

drop policy if exists "plano_mov_ev_leitura" on plano_acao_movimentacao_evidencias;
create policy "plano_mov_ev_leitura" on plano_acao_movimentacao_evidencias
  for select using (
    is_admin_sistema()
    or movimentacao_id in (
      select m.id from plano_acao_movimentacoes m
      join planos_acao pa on pa.id = m.plano_acao_id
      where pa.subgrupo_id in (
        select subgrupo_id from usuario_subgrupo
        where usuario_id = auth.uid()
      )
    )
  );

-- ── Adicionar 'reaberto' ao check de status de planos_acao ──
-- (o status 'reaberto' é usado na UI mas faltava no check)
alter table planos_acao
  drop constraint if exists planos_acao_status_check;
alter table planos_acao
  add constraint planos_acao_status_check
  check (status in (
    'em_moderacao_n1',
    'em_moderacao_n2',
    'corrigido',
    'nao_corrigido',
    'reaberto'
  ));
