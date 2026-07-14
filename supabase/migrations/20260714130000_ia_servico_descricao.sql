-- Atualiza o rótulo/descrição da característica `ia` para refletir que ela cobre
-- TODAS as features de IA (o entitlement é único). Antes falava só de documentos.
-- Relatórios por IA (Feature 2) entra sob "Serviços de IA" — sem serviço separado.
update servicos
set nome = 'Serviços de IA',
    descricao = 'Consulta Inteligente sobre documentos, preenchimento de campo por foto e relatórios de execuções por IA.'
where chave = 'ia';
