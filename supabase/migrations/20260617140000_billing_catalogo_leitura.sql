-- ============================================================
-- FIX: leitura do catálogo (planos/pacotes) para usuários autenticados
-- ============================================================
-- O self-service em /gestao/plano (admin da empresa, NÃO admin_sistema)
-- lista planos pagos e pacotes ativos lendo direto dessas tabelas. As
-- policies eram admin-only → a empresa não via nada para assinar/comprar.
-- Liberamos a LEITURA dos itens ATIVOS para qualquer usuário autenticado;
-- a escrita continua admin_sistema (policy *_admin já existente cobre ALL).

drop policy if exists "planos_leitura_ativos" on planos;
create policy "planos_leitura_ativos" on planos for select using (
  is_admin_sistema() or (ativo and auth.uid() is not null)
);

drop policy if exists "pacotes_leitura_ativos" on pacotes_adicionais;
create policy "pacotes_leitura_ativos" on pacotes_adicionais for select using (
  is_admin_sistema() or (ativo and auth.uid() is not null)
);
