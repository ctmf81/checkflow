-- ============================================================
-- TELEGRAM — canal de mensageria alternativo (fallback do WhatsApp)
-- ============================================================
-- O WhatsApp pode falhar por bloqueio de conta. O Telegram entra como canal
-- secundário. Diferença-chave: o bot do Telegram SÓ consegue enviar mensagem
-- para quem já iniciou conversa com ele ("/start"). Por isso guardamos, por
-- usuário:
--   • telegram_chat_id      — id do chat do usuário com o bot (só existe após o
--                             /start). É o "endereço" para onde enviamos.
--   • telegram_link_code    — código aleatório embutido no deep link
--                             (t.me/checkflows_bot?start=<code>); o webhook casa
--                             o /start com o usuário certo e grava o chat_id.
--   • telegram_vinculado_em — quando o vínculo foi concluído.

alter table usuarios add column if not exists telegram_chat_id      text;
alter table usuarios add column if not exists telegram_link_code    text;
alter table usuarios add column if not exists telegram_vinculado_em timestamptz;

-- link_code é o identificador procurado pelo webhook: único e indexado.
create unique index if not exists idx_usuarios_telegram_link_code
  on usuarios(telegram_link_code) where telegram_link_code is not null;
create index if not exists idx_usuarios_telegram_chat_id
  on usuarios(telegram_chat_id) where telegram_chat_id is not null;

comment on column usuarios.telegram_chat_id is
  'Chat id do usuário com o bot do Telegram (@checkflows_bot). Preenchido pelo webhook após o /start. Null = não vinculado.';
comment on column usuarios.telegram_link_code is
  'Código aleatório do deep link de vínculo (t.me/<bot>?start=<code>). O webhook casa o /start a este código.';
comment on column usuarios.telegram_vinculado_em is
  'Momento em que o usuário concluiu o vínculo do Telegram (deu /start no bot).';
