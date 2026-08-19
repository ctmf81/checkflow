-- Permite empresa_cobrancas.tipo = 'upgrade' (cobrança avulsa gerada quando
-- cliente faz upgrade de plano imediato com pro-rata da diferença).
-- Ver rota POST /billing/assinar (branch de upgrade imediato) e lib
-- billingParceiro.calcularProRata.

alter table empresa_cobrancas drop constraint if exists empresa_cobrancas_tipo_check;
alter table empresa_cobrancas add constraint empresa_cobrancas_tipo_check
  check (tipo in ('assinatura', 'pacote', 'upgrade'));
