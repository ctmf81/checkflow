-- ============================================================
-- TELEGRAM — preferência de canal primário por usuário
-- ============================================================
-- Por padrão o Telegram é só fallback (dispara quando o WhatsApp falha). Este
-- flag permite que um usuário receba SEMPRE pelo Telegram primeiro — útil para
-- quem não usa WhatsApp ou prefere o Telegram. Quando true, a camada de envio
-- inverte a ordem: tenta Telegram e, se falhar, cai para o WhatsApp.

alter table usuarios add column if not exists telegram_primario boolean not null default false;

comment on column usuarios.telegram_primario is
  'Quando true, o usuário recebe notificações primeiro pelo Telegram (WhatsApp vira o fallback). Só tem efeito se telegram_chat_id estiver vinculado.';
