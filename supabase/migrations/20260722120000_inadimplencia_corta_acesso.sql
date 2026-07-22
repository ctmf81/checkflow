-- ============================================================
-- Inadimplência corta acesso — fatura vencida há +7 dias → somente leitura
-- ============================================================
-- Decisão de produto (2026-07-22): plano PAGO cuja fatura recorrente venceu e
-- não foi paga entra em `inadimplente` (webhook PAYMENT_OVERDUE). Passados 7 dias
-- do vencimento sem pagar, a empresa cai para a fase `carencia` (somente leitura),
-- reusando o mesmo mecanismo do pós-trial. Volta a `ativa` assim que o pagamento
-- confirma (webhook zera status/vencido_em).
--
-- O corte é DATE-DRIVEN pela função de fase (avaliada a cada checagem de RLS),
-- portanto não precisa de cron para efetivar — acontece sozinho ao passar a data.

-- ── 1. Âncora da carência: vencimento da fatura em aberto ──
-- Preenchida no PAYMENT_OVERDUE (menor vencimento em aberto); null quando em dia.
alter table empresa_assinaturas
  add column if not exists vencido_em date;

comment on column empresa_assinaturas.vencido_em is
  'Vencimento da fatura recorrente em aberto (âncora da carência por inadimplência). +7 dias sem pagar → fase carencia. Null quando em dia.';

-- ── 2. Fase: pago inadimplente há +7 dias do vencimento → carência ──
-- Checado ANTES do atalho pago/cortesia→ativa (senão um pago-inadimplente
-- voltaria a 'ativa'), e DEPOIS de cancelado (cancelado continua tendo prioridade).
create or replace function empresa_fase_assinatura(p_empresa_id uuid)
returns text language sql security definer stable as $$
  select case
    when p_empresa_id is null then 'ativa'
    when not exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id) then 'ativa'
    when exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id and ea.status = 'cancelado') then 'carencia'
    when exists (
      select 1 from empresa_assinaturas ea
      where ea.empresa_id = p_empresa_id
        and ea.plano_tipo = 'pago' and ea.status = 'inadimplente'
        and ea.vencido_em is not null and current_date > ea.vencido_em + 7
    ) then 'carencia'
    when exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id and ea.plano_tipo in ('pago', 'cortesia')) then 'ativa'
    else coalesce((
      select case
        when ea.trial_fim is null then 'ativa'
        when current_date <= ea.trial_fim then 'ativa'
        else 'carencia'
      end
      from empresa_assinaturas ea
      where ea.empresa_id = p_empresa_id
      order by ea.trial_fim desc nulls last
      limit 1
    ), 'ativa')
  end;
$$;

-- ── 3. billing_status: expõe vencido_em (a UI avisa o prazo de corte) ──
create or replace function billing_status(p_empresa_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  v_storage_usado bigint;
  v_storage_extra bigint;
begin
  if not (
    is_admin_sistema()
    or exists (
      select 1 from usuario_empresa
      where usuario_id = auth.uid() and empresa_id = p_empresa_id
        and perfil_id = '00000000-0000-0000-0000-000000000002'
    )
  ) then
    raise exception 'Sem permissão para consultar a assinatura desta empresa.';
  end if;

  perform avancar_periodo_assinatura(p_empresa_id);
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return null; end if;

  select coalesce(sum(tamanho_bytes),0) into v_storage_usado
    from uso_armazenamento where empresa_id = p_empresa_id;
  select coalesce(sum(quantidade),0) into v_storage_extra
    from empresa_pacotes_comprados where empresa_id = p_empresa_id and tipo = 'armazenamento';

  return jsonb_build_object(
    'plano_nome', a.plano_nome,
    'plano_tipo', a.plano_tipo,
    'status', a.status,
    'valor', a.valor,
    'ciclo', a.ciclo,
    'periodo_inicio', a.periodo_inicio,
    'periodo_fim', a.periodo_fim,
    'trial_fim', a.trial_fim,
    'vencido_em', a.vencido_em,
    'proximo_plano_id', a.proximo_plano_id,
    'troca_efetiva_em', a.troca_efetiva_em,
    'execucoes', jsonb_build_object('usado', a.execucoes_usadas, 'limite', a.limite_execucoes_mes, 'extra', a.execucoes_extra),
    'tokens_ia', jsonb_build_object('usado', a.tokens_ia_usados, 'limite', a.limite_tokens_ia_mes, 'extra', a.tokens_ia_extra),
    'armazenamento', jsonb_build_object('usado', v_storage_usado, 'limite', a.limite_armazenamento_bytes, 'extra', v_storage_extra)
  );
end $$;
