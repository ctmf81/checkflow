-- ============================================================
-- Exclusão definitiva de empresa inativa (cascata completa)
-- ============================================================
-- Garante que `delete from empresas where id = ...` apague toda a árvore
-- de dados da empresa (unidades, grupos, checklists, execuções, planos de
-- ação, workflows, tickets, etc.), corrigindo FKs que hoje estão como
-- "NO ACTION" e bloqueariam a exclusão.

-- Função utilitária: troca a ação de uma FK existente para CASCADE,
-- descobrindo o nome real da constraint (evita depender do nome default).
create or replace function _fk_set_cascade(
  p_table text, p_column text, p_ref_table text
) returns void as $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  join pg_class t  on t.oid = c.conrelid
  join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
  where c.contype = 'f'
    and t.relname = p_table
    and a.attname = p_column
  limit 1;

  if v_constraint is not null then
    execute format('alter table %I drop constraint %I', p_table, v_constraint);
  end if;

  execute format(
    'alter table %I add constraint %I foreign key (%I) references %I(id) on delete cascade',
    p_table, p_table || '_' || p_column || '_fkey_cascade', p_column, p_ref_table
  );
end;
$$ language plpgsql;

select _fk_set_cascade('checklist_execucoes',          'unidade_id',                     'unidades');
select _fk_set_cascade('workflow_execucoes',           'unidade_id',                     'unidades');
select _fk_set_cascade('planos_acao',                  'unidade_id',                     'unidades');
select _fk_set_cascade('planos_acao',                  'subgrupo_id',                    'subgrupos');
select _fk_set_cascade('planos_acao',                  'checklist_execucao_id',          'checklist_execucoes');
select _fk_set_cascade('planos_acao',                  'checklist_execucao_resposta_id', 'checklist_execucao_respostas');
select _fk_set_cascade('planos_acao',                  'atividade_id',                   'checklist_atividades');
select _fk_set_cascade('checklist_execucao_respostas', 'atividade_id',                   'checklist_atividades');

drop function _fk_set_cascade(text, text, text);

-- ------------------------------------------------------------
-- RPC: excluir empresa (somente inativa, somente admin de sistema)
-- ------------------------------------------------------------
create or replace function excluir_empresa_cascata(p_empresa_id uuid)
returns void as $$
declare
  v_status status_empresa;
begin
  if not is_admin_sistema() then
    raise exception 'Apenas administradores de sistema podem excluir empresas';
  end if;

  select status into v_status from empresas where id = p_empresa_id;

  if v_status is null then
    raise exception 'Empresa não encontrada';
  end if;

  if v_status <> 'inativo' then
    raise exception 'Somente empresas com status "inativo" podem ser excluídas';
  end if;

  delete from empresas where id = p_empresa_id;
end;
$$ language plpgsql security definer;

revoke all on function excluir_empresa_cascata(uuid) from public;
grant execute on function excluir_empresa_cascata(uuid) to authenticated;
