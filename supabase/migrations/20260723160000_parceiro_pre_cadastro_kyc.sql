-- ============================================================
-- KYC no pré-cadastro público de parceiros
-- ============================================================
-- O próprio interessado passa a informar endereço (e nascimento/tipo de empresa)
-- no formulário `/seja-parceiro`. Na aprovação, esses dados são copiados para
-- `parceiros` — assim a subconta Asaas já nasce com tudo preenchido, sem o admin
-- ter que perseguir informação depois.
--
-- `renda_mensal` NÃO entra aqui de propósito: é mockada na criação da subconta
-- (RENDA_MENSAL_MOCK), para não criar fricção no formulário público.

alter table parceiro_pre_cadastros
  add column if not exists data_nascimento  date,   -- birthDate (PF)
  add column if not exists tipo_empresa     text,   -- companyType (PJ)
  add column if not exists cep              text,
  add column if not exists endereco         text,
  add column if not exists endereco_numero  text,
  add column if not exists complemento      text,
  add column if not exists bairro           text;

alter table parceiro_pre_cadastros drop constraint if exists parceiro_pre_cad_tipo_empresa_check;
alter table parceiro_pre_cadastros add constraint parceiro_pre_cad_tipo_empresa_check
  check (tipo_empresa is null or tipo_empresa in ('MEI','LIMITED','INDIVIDUAL','ASSOCIATION'));

-- As policies existentes já cobrem as colunas novas (INSERT anon só com
-- status='pendente'; SELECT/UPDATE só is_admin_sistema()).
