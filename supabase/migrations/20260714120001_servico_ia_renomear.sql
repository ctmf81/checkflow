-- ============================================================
-- Característica 'ia' renomeada — cobre Consulta Inteligente + IA por foto
-- ============================================================
-- A mesma característica `ia` (flag) gateia a Consulta Inteligente E o novo
-- preenchimento de campo por foto. O nome/descrição antigo só mencionava
-- documentos — atualiza para refletir os dois recursos.
update servicos
set nome = 'Serviços de IA',
    descricao = 'Consulta Inteligente (perguntas sobre documentos) e preenchimento de campo por foto.'
where chave = 'ia';
