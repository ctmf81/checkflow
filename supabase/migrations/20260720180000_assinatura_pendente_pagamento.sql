-- Ativar plano só quando o pagamento confirmar (antes: /assinar já marcava
-- status='ativo' no ato, permitindo usar sem pagar).
--
-- `pendente_plano_id` guarda o plano da 1ª contratação enquanto o 1º pagamento
-- não confirma. Enquanto ≠ null, a empresa MANTÉM o acesso atual (trial/carência);
-- o webhook Asaas (PAYMENT_CONFIRMED/RECEIVED) aplica o snapshot do plano e vira
-- status='ativo'. Não afeta trocas entre planos pagos (que seguem agendadas p/ o
-- fim do período via proximo_plano_id).

alter table empresa_assinaturas
  add column if not exists pendente_plano_id uuid references planos(id) on delete set null;

comment on column empresa_assinaturas.pendente_plano_id is
  'Plano da 1ª contratação aguardando confirmação do 1º pagamento no Asaas. '
  '≠ null = empresa mantém o acesso atual; o webhook aplica o snapshot ao confirmar.';
