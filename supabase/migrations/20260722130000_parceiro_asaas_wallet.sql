-- ============================================================
-- Split de parceiro — wallet Asaas por parceiro (repasse automático)
-- ============================================================
-- Fase 4 do billing: sai a comissão manual/estimada e entra o split real do
-- Asaas. Cada parceiro passa a ter uma subconta (walletId). Ao assinar/reativar
-- um plano pago, a mensalidade é dividida automaticamente: `parceiro_percentual`%
-- vai para a wallet do parceiro em toda cobrança recorrente.
--
-- O split é aplicado SÓ na assinatura (mensalidade). Pacotes avulsos não têm
-- repasse (parceiro_percentual é "da mensalidade"). O código em apps/api só monta
-- o split quando há wallet + parceiro ativo + percentual > 0 (fallback seguro:
-- sem wallet, cobra 100% CheckFlow como antes).

alter table parceiros
  add column if not exists asaas_wallet_id text;

comment on column parceiros.asaas_wallet_id is
  'walletId da subconta Asaas do parceiro. Quando presente (+ empresa.parceiro_percentual), a mensalidade paga por empresas vinculadas é dividida via split do Asaas. Null = sem repasse automático (fallback: 100% CheckFlow).';
