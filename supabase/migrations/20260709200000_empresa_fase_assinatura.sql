-- ============================================================
-- Ciclo de vida da assinatura — fase por empresa (uso livre → carência → bloqueio)
-- ============================================================
-- Empresas em plano "trial" (uso gratuito por N dias) passam por 3 fases após o
-- fim do período livre (empresa_assinaturas.trial_fim):
--   • ativa     — dentro do período livre, OU plano pago, OU sem assinatura
--   • carencia  — trial_fim vencido, dentro de +30 dias → bloqueia CRIAÇÃO
--   • bloqueada — carência vencida (trial_fim + 30d) → bloqueia ACESSO
-- Opt-in: empresa sem assinatura ou com plano pago = sempre 'ativa'.

create or replace function empresa_fase_assinatura(p_empresa_id uuid)
returns text language sql security definer stable as $$
  select case
    when p_empresa_id is null then 'ativa'
    when not exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id) then 'ativa'
    -- Qualquer assinatura paga → empresa ativa (não sujeita ao ciclo do trial).
    when exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id and ea.plano_tipo = 'pago') then 'ativa'
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

-- Helper booleano para RLS (fase 2): só cria itens novos quando a empresa está ativa.
create or replace function empresa_pode_criar(p_empresa_id uuid)
returns boolean language sql security definer stable as $$
  select empresa_fase_assinatura(p_empresa_id) = 'ativa';
$$;
