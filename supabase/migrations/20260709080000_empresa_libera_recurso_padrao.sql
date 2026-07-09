-- ============================================================
-- ENTITLEMENTS — empresa_libera_recurso passa a respeitar serviços "padrão"
-- ============================================================
-- A função (fase 2, migration 20260709060000) só olhava os serviços DO PLANO.
-- Mas a UI (SessionContext) une SEMPRE os recursos dos serviços `padrao=true`
-- (checklists, estrutura/grupos, catálogos) — base que independe do plano.
-- Sem esse alinhamento, gatear a escrita de um módulo padrão pela RLS bloquearia
-- empresas com plano configurado enquanto a UI mostra o botão (divergência = bug).
-- Este ajuste só AMPLIA o acesso; empresas atuais (sem serviços no plano) seguem
-- liberadas pelos ramos anteriores.

create or replace function empresa_libera_recurso(p_empresa_id uuid, p_recurso text)
returns boolean language sql security definer stable as $$
  select case
    when p_empresa_id is null then true
    when not exists (
      select 1 from empresa_assinaturas ea
      where ea.empresa_id = p_empresa_id and ea.plano_id is not null
    ) then true
    when not exists (
      select 1 from plano_servicos ps
      join empresa_assinaturas ea on ea.plano_id = ps.plano_id
      where ea.empresa_id = p_empresa_id
    ) then true
    else (
      -- liberado por um serviço-módulo ATIVO do plano...
      exists (
        select 1 from plano_servicos ps
        join empresa_assinaturas ea on ea.plano_id = ps.plano_id
        join servicos s on s.id = ps.servico_id
        where ea.empresa_id = p_empresa_id
          and s.tipo = 'modulo' and s.ativo
          and p_recurso = any (s.recursos)
      )
      -- ...ou por um serviço-módulo "padrão" (base, sempre disponível).
      or exists (
        select 1 from servicos s
        where s.tipo = 'modulo' and s.ativo and s.padrao
          and p_recurso = any (s.recursos)
      )
    )
  end;
$$;
