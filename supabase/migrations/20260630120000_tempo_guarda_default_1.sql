-- Tempo de guarda das mídias agora NASCE com 1 mês por padrão (era 12) em todo
-- checklist NOVO, qualquer que seja o caminho de criação:
--   - manual (montador) — a UI já usava 1;
--   - duplicação (DuplicarModal não envia o campo → herda o default);
--   - "usar um modelo" (RPC clonar_template não envia o campo → herda o default);
--   - "gerar com IA" (/api/checklists/gerar não envia → herda o default);
--   - setup inicial de empresa (/api/empresas/checklist-inicial → herda o default).
-- O usuário pode aumentar manualmente no montador. Evita guardar mídia
-- desnecessariamente (cota de armazenamento). NÃO altera checklists já existentes.
alter table checklists alter column tempo_guarda_meses set default 1;
