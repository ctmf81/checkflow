-- ============================================================
-- Avisos de FIM DE TRIAL — antes de a empresa cair em somente-leitura
-- ============================================================
-- Pós-trial = somente-leitura permanente (bloqueia CRIAÇÃO; ver billing).
-- Antes disso, avisar o admin da empresa por e-mail + WhatsApp:
--   • ~5 dias antes (heads-up) e ~1 dia antes (urgente), 1x cada (idempotência).
-- + banner na Home com os dias restantes (RPC legível por qualquer membro).

-- ── Idempotência dos disparos (marcadas pelo cron ao enviar) ──
alter table empresa_assinaturas
  add column if not exists aviso_trial_5d_em timestamptz,
  add column if not exists aviso_trial_1d_em timestamptz;

-- ── Dias restantes de trial (para o banner) ──────────────────
-- Retorna NULL se a empresa não está em trial (plano pago/cortesia, sem trial,
-- ou trial já vencido); senão o nº de dias até `trial_fim` (0 = vence hoje).
-- SECURITY DEFINER: qualquer membro pode ver os dias (empresa_assinaturas em si
-- é admin-only). Parametrizada por empresa (não usa auth.uid()).
create or replace function empresa_dias_trial(p_empresa_id uuid)
returns int language sql security definer stable as $$
  select case
    when ea.plano_tipo in ('pago', 'cortesia') then null
    when ea.trial_fim is null then null
    when ea.trial_fim < current_date then null
    else (ea.trial_fim - current_date)
  end
  from empresa_assinaturas ea
  where ea.empresa_id = p_empresa_id;
$$;

grant execute on function empresa_dias_trial(uuid) to authenticated;
