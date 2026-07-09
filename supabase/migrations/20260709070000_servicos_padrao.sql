-- ============================================================
-- SERVIÇOS — flag "padrão" (sempre disponível, independe do plano)
-- ============================================================
-- Funções base (checklist, grupos/áreas, catálogo...) não devem ser gated pelo
-- plano: aparecem SEMPRE no perfil/menu. `padrao = true` marca esses serviços;
-- seus recursos entram no conjunto liberado mesmo quando o plano restringe.

alter table servicos add column if not exists padrao boolean not null default false;

-- Base padrão (as que o usuário citou): checklists, estrutura (grupos/áreas), catálogos.
update servicos set padrao = true where chave in ('checklists', 'estrutura', 'catalogos');
