-- Rastreamento de origem do usuário
alter table usuario_empresa
  add column if not exists fonte        text not null default 'manual',
  -- 'manual' | 'api' | 'csv'
  add column if not exists fonte_sistema text;
  -- ex: 'senior', 'oracle', 'totvs', etc.

-- Configuração de sync por empresa
alter table empresas
  add column if not exists importacao_campo_status   text,
  -- campo do payload externo que representa o status (ex: 'situacao', 'status')
  add column if not exists importacao_status_ativo   text,
  -- valor que significa ativo (ex: 'A', 'ATIVO', '1', 'true')
  add column if not exists importacao_estrategia     text not null default 'inativar',
  -- 'inativar' → inativa quem saiu | 'manter' → nunca inativa automaticamente
  add column if not exists importacao_sistema_nome   text;
  -- nome do sistema de origem (ex: 'Senior', 'Oracle EBS')
