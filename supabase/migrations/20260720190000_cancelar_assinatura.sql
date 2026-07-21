-- Cancelamento de assinatura ATIVA (parar a recorrência de quem já paga).
-- Efeito no FIM do período já pago: para as cobranças futuras no Asaas AGORA,
-- mantém o acesso até `periodo_fim` e, na virada, a empresa cai para 'carencia'
-- (somente leitura). Reversível (/billing/reativar) enquanto o período não virou.

alter table empresa_assinaturas
  add column if not exists cancelar_em date;  -- efetiva o cancelamento nessa data (= periodo_fim)

-- fase: assinatura CANCELADA = somente leitura (carência). Checado ANTES de
-- pago/cortesia — senão um pago-cancelado voltaria a 'ativa'.
create or replace function empresa_fase_assinatura(p_empresa_id uuid)
returns text language sql security definer stable as $$
  select case
    when p_empresa_id is null then 'ativa'
    when not exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id) then 'ativa'
    when exists (select 1 from empresa_assinaturas ea where ea.empresa_id = p_empresa_id and ea.status = 'cancelado') then 'carencia'
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

-- avancar: (1) assinatura já cancelada não avança; (2) ao vencer o período com
-- cancelamento agendado, efetiva (status='cancelado') e NÃO renova.
create or replace function avancar_periodo_assinatura(p_empresa_id uuid)
returns void language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  fp planos%rowtype;
begin
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id for update;
  if not found then return; end if;
  if a.status = 'cancelado' then return; end if;  -- congelada; não avança

  while a.periodo_fim <= current_date loop
    -- Cancelamento agendado tem prioridade: efetiva ao vencer o período.
    if a.cancelar_em is not null and a.cancelar_em <= a.periodo_fim then
      a.status := 'cancelado';
      a.cancelar_em := null;
      a.proximo_plano_id := null;
      a.troca_efetiva_em := null;
      exit;  -- assinatura encerrada; não renova
    end if;

    if a.proximo_plano_id is not null and a.troca_efetiva_em is not null and a.troca_efetiva_em <= a.periodo_fim then
      select * into fp from planos where id = a.proximo_plano_id;
      if found then
        a.plano_id := fp.id; a.plano_nome := fp.nome; a.plano_tipo := fp.tipo;
        a.valor := fp.valor; a.ciclo := fp.ciclo;
        a.limite_execucoes_mes := fp.limite_execucoes_mes;
        a.limite_armazenamento_bytes := fp.limite_armazenamento_bytes;
        a.limite_tokens_ia_mes := fp.limite_tokens_ia_mes;
        a.status := 'ativo';
      end if;
      a.proximo_plano_id := null;
      a.troca_efetiva_em := null;
    end if;
    a.periodo_inicio := a.periodo_fim;
    a.periodo_fim := (a.periodo_fim + interval '1 month')::date;
    a.execucoes_usadas := 0;
    a.tokens_ia_usados := 0;
    a.execucoes_extra := 0;
    a.tokens_ia_extra := 0;
  end loop;

  update empresa_assinaturas set
    plano_id = a.plano_id, plano_nome = a.plano_nome, plano_tipo = a.plano_tipo,
    valor = a.valor, ciclo = a.ciclo,
    limite_execucoes_mes = a.limite_execucoes_mes,
    limite_armazenamento_bytes = a.limite_armazenamento_bytes,
    limite_tokens_ia_mes = a.limite_tokens_ia_mes,
    status = a.status,
    periodo_inicio = a.periodo_inicio, periodo_fim = a.periodo_fim,
    execucoes_usadas = a.execucoes_usadas, tokens_ia_usados = a.tokens_ia_usados,
    execucoes_extra = a.execucoes_extra, tokens_ia_extra = a.tokens_ia_extra,
    trial_fim = a.trial_fim,
    proximo_plano_id = a.proximo_plano_id, troca_efetiva_em = a.troca_efetiva_em,
    cancelar_em = a.cancelar_em,
    atualizado_em = now()
  where empresa_id = p_empresa_id;
end $$;
