-- ============================================================
-- NOTIFICAÇÃO — novos tipos: plano_devolvido_n1 e tarefa_publicada
-- ============================================================
-- ATENÇÃO: adicionar valor a enum precisa estar numa migração SEPARADA
-- do seed que usa esse valor — o Postgres não permite usar um valor de
-- enum recém-criado na mesma transação em que ele foi adicionado.
-- O seed dos templates vai na migração 20260708120001.

alter type notificacao_tipo add value if not exists 'plano_devolvido_n1';
alter type notificacao_tipo add value if not exists 'tarefa_publicada';
