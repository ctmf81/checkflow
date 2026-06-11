-- ============================================================
-- Telefone passa a ser canal obrigatorio de identificacao/recuperacao
-- ============================================================
-- Login agora e somente por CPF; telefone (WhatsApp) vira o canal
-- garantido de recuperacao de senha (e-mail continua opcional).
--
-- Nao aplicamos "not null" direto pois pode haver usuarios legados sem
-- telefone/cpf cadastrados. Index unico ja barra duplicidade para os
-- novos cadastros (obrigatorios via UI/API a partir desta versao).

create unique index if not exists usuarios_telefone_key
  on usuarios (telefone)
  where telefone is not null;

-- Visibilidade para o admin do sistema: usuarios sem cpf/telefone
-- (cadastros antigos que precisam ser completados)
create or replace view usuarios_sem_contato
  with (security_invoker = true) as
select id, nome, email, cpf, telefone, status
from usuarios
where cpf is null or telefone is null;
