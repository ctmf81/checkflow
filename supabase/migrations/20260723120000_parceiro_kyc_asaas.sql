-- ============================================================
-- Dados KYC do parceiro — para criar a subconta Asaas de primeira
-- ============================================================
-- O `POST /accounts` do Asaas (subconta white-label) exige mais que
-- nome/e-mail/documento: endereço, faturamento/renda e — conforme pessoa
-- física ou jurídica — data de nascimento (PF) ou tipo de empresa (PJ).
-- Guardamos esses campos no cadastro do parceiro para a rota
-- `POST /parceiros/:id/conta-asaas` montar o payload completo.
--
-- Todos opcionais no banco (o Asaas valida o que é obrigatório na criação).

alter table parceiros
  add column if not exists data_nascimento  date,                 -- birthDate (PF)
  add column if not exists tipo_empresa      text,                 -- companyType (PJ)
  add column if not exists renda_mensal       numeric(12,2),        -- incomeValue
  add column if not exists cep                text,                 -- postalCode
  add column if not exists endereco           text,                 -- address
  add column if not exists endereco_numero    text,                 -- addressNumber
  add column if not exists complemento        text,                 -- complement
  add column if not exists bairro             text;                 -- province

-- companyType aceito pelo Asaas (PJ). Null = pessoa física.
alter table parceiros drop constraint if exists parceiros_tipo_empresa_check;
alter table parceiros add constraint parceiros_tipo_empresa_check
  check (tipo_empresa is null or tipo_empresa in ('MEI','LIMITED','INDIVIDUAL','ASSOCIATION'));

comment on column parceiros.tipo_empresa is
  'companyType do Asaas p/ subconta PJ: MEI / LIMITED (Ltda) / INDIVIDUAL (empresário individual) / ASSOCIATION. Null = pessoa física (usa data_nascimento).';
comment on column parceiros.renda_mensal is
  'incomeValue do Asaas — faturamento/renda mensal declarado do parceiro (exigido na criação da subconta).';
