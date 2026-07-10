-- ============================================================
-- Plano tipo "cortesia" (beneficente) — acesso concedido sem cobrança
-- ============================================================
-- Como um plano "pago" que não paga: a empresa fica SEMPRE ativa (sem carência
-- nem bloqueio). Serve p/ ONGs/parceiros/cortesias. Entitlements (serviços do
-- plano) funcionam normal — o que muda é só o ciclo de cobrança (não bloqueia).

alter table planos drop constraint if exists planos_tipo_check;
alter table planos add constraint planos_tipo_check
  check (tipo in ('gratuito', 'trial', 'pago', 'cortesia'));

alter table empresa_assinaturas drop constraint if exists empresa_assinaturas_plano_tipo_check;
alter table empresa_assinaturas add constraint empresa_assinaturas_plano_tipo_check
  check (plano_tipo in ('gratuito', 'trial', 'pago', 'cortesia'));

-- Fase da assinatura: 'pago' E 'cortesia' → sempre 'ativa'.
create or replace function empresa_fase_assinatura(p_empresa_id uuid)
returns text language sql security definer stable as $$
  select case
    when p_empresa_id is null then 'ativa'
    when not exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id) then 'ativa'
    -- Assinatura paga OU cortesia → empresa ativa (não sujeita ao ciclo do trial).
    when exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id and ea.plano_tipo in ('pago', 'cortesia')) then 'ativa'
    else coalesce((
      select case
        when ea.trial_fim is null then 'ativa'
        when current_date <= ea.trial_fim then 'ativa'
        when current_date <= ea.trial_fim + 30 then 'carencia'
        else 'bloqueada'
      end
      from empresa_assinaturas ea
      where ea.empresa_id = p_empresa_id
      order by ea.trial_fim desc nulls last
      limit 1
    ), 'ativa')
  end;
$$;
