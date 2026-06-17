-- ============================================================
-- Motivo de não execução padrão ("Não disponível") por checklist
-- ============================================================
-- Regra: todo checklist deve ter SEMPRE pelo menos 1 motivo de não execução
-- de CADA tipo (checklist e atividade). Garantimos um motivo padrão
-- "Não disponível" por unidade (grupo/subgrupo nulos = vale p/ todos os grupos),
-- associado automaticamente a cada checklist novo (trigger) e retroativamente
-- aos existentes que estejam sem motivo de algum tipo.

-- Helper: garante o motivo padrão da unidade para um tipo e retorna o id
create or replace function motivo_padrao_unidade(p_unidade_id uuid, p_tipo text)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  select id into v_id from nao_execucao_motivos
    where unidade_id = p_unidade_id and grupo_id is null and subgrupo_id is null
      and descricao = 'Não disponível' and tipo = p_tipo and status = 'ativo'
    limit 1;
  if v_id is null then
    insert into nao_execucao_motivos (unidade_id, grupo_id, subgrupo_id, descricao, tipo, status)
    values (p_unidade_id, null, null, 'Não disponível', p_tipo, 'ativo')
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Trigger: ao criar um checklist (não-template), associa o padrão dos 2 tipos
create or replace function checklist_seed_motivos_padrao()
returns trigger language plpgsql security definer as $$
declare t text; v_motivo uuid;
begin
  if NEW.is_template or NEW.unidade_id is null then return NEW; end if;
  foreach t in array array['checklist','atividade'] loop
    v_motivo := motivo_padrao_unidade(NEW.unidade_id, t);
    if not exists (
      select 1 from checklist_nao_execucao_motivos
      where checklist_id = NEW.id and motivo_id = v_motivo
    ) then
      insert into checklist_nao_execucao_motivos (checklist_id, motivo_id) values (NEW.id, v_motivo);
    end if;
  end loop;
  return NEW;
end $$;

drop trigger if exists trg_checklist_seed_motivos on checklists;
create trigger trg_checklist_seed_motivos after insert on checklists
  for each row execute function checklist_seed_motivos_padrao();

-- Retroativo: associa o padrão aos checklists existentes que estão sem motivo
-- de algum tipo (não-template, com unidade)
do $$
declare c record; t text; v_motivo uuid;
begin
  for c in select id, unidade_id from checklists where unidade_id is not null and coalesce(is_template, false) = false loop
    foreach t in array array['checklist','atividade'] loop
      if not exists (
        select 1 from checklist_nao_execucao_motivos cm
        join nao_execucao_motivos m on m.id = cm.motivo_id
        where cm.checklist_id = c.id and m.tipo = t
      ) then
        v_motivo := motivo_padrao_unidade(c.unidade_id, t);
        insert into checklist_nao_execucao_motivos (checklist_id, motivo_id) values (c.id, v_motivo);
      end if;
    end loop;
  end loop;
end $$;
