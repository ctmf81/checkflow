-- LOW: a galeria de modelos (is_template) era legível por usuários NÃO
-- autenticados (anon). O ramo `or is_template` das policies de leitura não tinha
-- guarda de role, então a `anon` key (pública no bundle) enumerava o catálogo de
-- modelos + estrutura (seções/atividades/opções). Intenção documentada era
-- "qualquer usuário AUTENTICADO".
--
-- Fix: exigir `auth.uid() is not null` no ramo de template das 4 policies de
-- leitura. Checklists de tenant seguem escopados por unidade (inalterado).
-- Idempotente (drop + create).

drop policy if exists "checklists_leitura" on checklists;
create policy "checklists_leitura" on checklists for select using (
  is_admin_sistema()
  or (is_template and auth.uid() is not null)
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

drop policy if exists "secoes_leitura" on checklist_secoes;
create policy "secoes_leitura" on checklist_secoes for select using (
  is_admin_sistema()
  or checklist_id in (
    select id from checklists
    where (is_template and auth.uid() is not null)
       or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);

drop policy if exists "atividades_leitura" on checklist_atividades;
create policy "atividades_leitura" on checklist_atividades for select using (
  is_admin_sistema()
  or checklist_id in (
    select id from checklists
    where (is_template and auth.uid() is not null)
       or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);

drop policy if exists "opcoes_leitura" on checklist_atividade_opcoes;
create policy "opcoes_leitura" on checklist_atividade_opcoes for select using (
  is_admin_sistema()
  or atividade_id in (
    select ca.id from checklist_atividades ca
    join checklists cl on cl.id = ca.checklist_id
    where (cl.is_template and auth.uid() is not null)
       or cl.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);
