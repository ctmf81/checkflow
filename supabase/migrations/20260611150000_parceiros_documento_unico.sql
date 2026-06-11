-- ============================================================
-- PARCEIROS — busca por CPF: documento normalizado e único
-- ============================================================
-- A localização de parceiro passou a ser por CPF (documento), não e-mail.
-- Normaliza registros existentes para só dígitos e garante unicidade,
-- evitando dois cadastros com o mesmo CPF.

update parceiros
set documento = regexp_replace(documento, '\D', '', 'g')
where documento is not null and documento ~ '\D';

create unique index if not exists idx_parceiros_documento
  on parceiros (documento) where documento is not null;
