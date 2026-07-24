-- ============================================================
-- Documento do parceiro é IMUTÁVEL depois que existiu subconta Asaas
-- ============================================================
-- Regra de produto: "teve wallet um dia, CPF nunca mais muda". O documento é o
-- que identifica a conta financeira real que recebe o repasse do split — deixar
-- o cadastro divergir criaria o caso em que a tela mostra um CPF e o dinheiro
-- vai para a conta de outro.
--
-- Antes a trava dependia de `asaas_wallet_id` estar preenchido, então limpar o
-- wallet destravava o documento. Agora um carimbo `asaas_wallet_criada_em`
-- registra que a subconta EXISTIU — e ele nunca volta a null.
--
-- A regra é imposta no BANCO (trigger), não só na UI: vale para a tela, para a
-- API e para escrita direta na tabela.

alter table parceiros
  add column if not exists asaas_wallet_criada_em timestamptz;

comment on column parceiros.asaas_wallet_criada_em is
  'Quando a subconta Asaas passou a existir. Carimbado automaticamente na 1ª vez que asaas_wallet_id fica preenchido e NUNCA volta a null — a partir dele o documento fica imutável.';

-- Backfill: quem já tem wallet fica travado imediatamente.
update parceiros
   set asaas_wallet_criada_em = coalesce(asaas_wallet_criada_em, atualizado_em, now())
 where asaas_wallet_id is not null and asaas_wallet_criada_em is null;

create or replace function parceiros_documento_imutavel()
returns trigger language plpgsql as $$
begin
  -- 1) Carimba na primeira vez que a wallet aparece (qualquer caminho: rota
  --    conta-asaas, edição manual do Wallet ID, importação).
  if new.asaas_wallet_id is not null and new.asaas_wallet_criada_em is null then
    new.asaas_wallet_criada_em := now();
  end if;

  if tg_op = 'UPDATE' then
    -- 2) O carimbo nunca volta a null (limpar o wallet_id não destrava).
    if new.asaas_wallet_criada_em is null and old.asaas_wallet_criada_em is not null then
      new.asaas_wallet_criada_em := old.asaas_wallet_criada_em;
    end if;

    -- 3) Tendo carimbo, o documento é imutável.
    if old.asaas_wallet_criada_em is not null
       and new.documento is distinct from old.documento then
      raise exception 'O CPF/CNPJ do parceiro não pode ser alterado: a subconta Asaas já foi criada com este documento.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_parceiros_documento_imutavel on parceiros;
create trigger trg_parceiros_documento_imutavel
  before insert or update on parceiros
  for each row execute function parceiros_documento_imutavel();
