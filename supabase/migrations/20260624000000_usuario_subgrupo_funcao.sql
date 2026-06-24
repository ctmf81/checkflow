-- Adicionar coluna 'funcao' à tabela usuario_subgrupo
-- Funções: 'Operação', 'Nível 1', 'Nível 2'
-- Padrão: 'Operação' (operador comum, sem permissão de moderação)

ALTER TABLE usuario_subgrupo
ADD COLUMN funcao text NOT NULL DEFAULT 'Operação'
CHECK (funcao IN ('Operação', 'Nível 1', 'Nível 2'));

-- Índice para queries rápidas por função
CREATE INDEX idx_usuario_subgrupo_funcao ON usuario_subgrupo(funcao);

-- Comentário para documentação
COMMENT ON COLUMN usuario_subgrupo.funcao IS
'Função do usuário no subgrupo:
- Operação: operador comum, executa checklists e tarefas
- Nível 1: moderador Nível 1, aprova planos de ação
- Nível 2: moderador Nível 2, aprova planos e escalações';
