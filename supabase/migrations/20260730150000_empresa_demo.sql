-- ============================================================
-- EMPRESA DEMO — base de demonstração com gerador de dados fake
-- ============================================================
-- Marca empresas de demonstração (por vertical). A flag `demo`:
--   • isenta do ciclo de billing (fase sempre 'ativa', nunca bloqueia);
--   • libera o botão "Gerar dados dos últimos 30 dias" (admin da empresa);
--   • blinda o gerador destrutivo/append (só roda em empresa demo).
-- O plano "Demonstração" (tipo 'cortesia', limites null = ilimitado) dá a
-- assinatura não-expirável; a flag é a garantia dura, independente da assinatura.

-- ── 1. Flags na empresa ──
alter table empresas add column if not exists demo boolean not null default false;
alter table empresas add column if not exists demo_vertical text;

comment on column empresas.demo is
  'Empresa de demonstração: isenta de billing (fase sempre ativa) e habilita o gerador de dados fake. NUNCA marcar empresa de cliente pagante.';
comment on column empresas.demo_vertical is
  'Vertical da demo (ex.: fabrica_alimentos, condominio, agro, varejo, logistica) — escolhe os templates do gerador.';

-- ── 2. Fase de assinatura: demo → sempre 'ativa' (curto-circuito no topo) ──
-- Espelha 20260722120000, apenas adicionando a 2ª cláusula (demo).
create or replace function empresa_fase_assinatura(p_empresa_id uuid)
returns text language sql security definer stable as $$
  select case
    when p_empresa_id is null then 'ativa'
    when exists (select 1 from empresas e where e.id = p_empresa_id and e.demo) then 'ativa'
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

-- ── 3. Plano "Demonstração" (cortesia, ilimitado, não-padrão) ──
-- limites null = ilimitado; tipo 'cortesia' = fase 'ativa' sem trial.
insert into planos (nome, descricao, tipo, valor, ciclo,
  limite_execucoes_mes, limite_armazenamento_bytes, limite_tokens_ia_mes, ativo, ordem)
select 'Demonstração',
  'Plano interno para empresas de demonstração — ilimitado e sem expiração.',
  'cortesia', 0, null, null, null, null, true, 999
where not exists (select 1 from planos where nome = 'Demonstração' and tipo = 'cortesia');
