-- Remove o limite por nº de respostas nas Listas de Tarefas.
-- A partir daqui, a lista encerra APENAS pela data limite (ou manualmente).
alter table tarefa_listas drop column if exists abertura_max_respostas;
