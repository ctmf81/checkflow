-- Audit financeiro 2026-08-20 identificou 2 CRIT LATENTES:
--
-- 1) `avancar_periodo_assinatura` avança sempre 1 mês, ignorando `a.ciclo`.
--    Consequências para plano ANUAL:
--    - Cancelamento agendado (`cancelar_em=periodo_fim`) efetiva em 30d após
--      o pagamento anual — cliente perde acesso mesmo tendo pago 12 meses.
--    - Troca agendada idem (`troca_efetiva_em=periodo_fim`).
--    - Pro-rata anual: `calcularProRata` usa 365 dias mas o `periodoFim` do
--      DB fica só 30 dias à frente → divide por 12× o certo → under-charge.
--
-- 2) Default da coluna `periodo_fim` também fixo em `+1 month`.
--
-- Prod hoje: 0 clientes anuais. Fix preventivo antes de lançar plano anual.
--
-- Solução: avança `+1 month` se ciclo='mensal', `+1 year` se ciclo='anual'.
-- Default da coluna cai pra `+1 month` (histórico); nas assinaturas anuais o
-- webhook de ativação já grava `periodo_fim` correto (fix separado no código).

create or replace function avancar_periodo_assinatura(p_empresa_id uuid)
returns void language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  fp planos%rowtype;
  v_interval interval;
begin
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id for update;
  if not found then return; end if;

  -- Trial expirado → cai no plano gratuito (se existir um ativo)
  if a.status = 'trial' and a.trial_fim is not null and a.trial_fim <= current_date then
    select * into fp from planos where tipo = 'gratuito' and ativo order by ordem limit 1;
    if found then
      a.plano_id := fp.id; a.plano_nome := fp.nome; a.plano_tipo := fp.tipo;
      a.valor := fp.valor; a.ciclo := fp.ciclo;
      a.limite_execucoes_mes := fp.limite_execucoes_mes;
      a.limite_armazenamento_bytes := fp.limite_armazenamento_bytes;
      a.limite_tokens_ia_mes := fp.limite_tokens_ia_mes;
      a.status := 'ativo';
    end if;
    a.trial_fim := null;
  end if;

  -- Avança períodos vencidos respeitando o CICLO da assinatura corrente.
  -- Se ciclo mudar por troca de plano no meio do loop, a próxima iteração
  -- usa o novo ciclo (`fp.ciclo` foi copiado para `a.ciclo`).
  while a.periodo_fim <= current_date loop
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
    v_interval := case when a.ciclo = 'anual' then interval '1 year' else interval '1 month' end;
    a.periodo_inicio := a.periodo_fim;
    a.periodo_fim := (a.periodo_fim + v_interval)::date;
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
    atualizado_em = now()
  where empresa_id = p_empresa_id;
end $$;
