-- Perfil "Gestão do Grupo" criado automaticamente em CADA empresa nova, além de
-- "Admin da empresa" e "Operação" (que são perfis de SISTEMA, globais). Este é
-- PER-EMPRESA e is_system=false → o admin da empresa pode editá-lo ou excluí-lo.
-- As permissões espelham o perfil de referência montado na empresa "QA Smoke
-- 2026-06-24" (gestão de grupo/subgrupo + agendamentos, catálogos, documentos,
-- causa raiz, não execução e tickets) — 28 permissões.

create or replace function seed_perfil_gestao_grupo(p_empresa_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_perfil uuid;
begin
  -- Idempotente: não recria se a empresa já tem um "Gestão do Grupo".
  if exists (select 1 from perfis where empresa_id = p_empresa_id and nome = 'Gestão do Grupo') then
    return;
  end if;

  insert into perfis (nome, descricao, empresa_id, is_system, publico)
  values (
    'Gestão do Grupo',
    'Gestão da área (grupo/subgrupo): estrutura, agendamentos, catálogos, documentos, causa raiz, motivos de não execução e tickets. Editável pelo admin da empresa.',
    p_empresa_id, false, false
  )
  returning id into v_perfil;

  insert into perfil_permissoes (perfil_id, permissao_id)
  select v_perfil, p.id from permissoes p
  where (p.recurso, p.acao) in (
    ('agendamentos','criar'), ('agendamentos','deletar'), ('agendamentos','editar'), ('agendamentos','ver'),
    ('catalogos','criar'), ('catalogos','editar'), ('catalogos','excluir'), ('catalogos','ver'),
    ('causa_raiz','criar'), ('causa_raiz','editar'), ('causa_raiz','excluir'),
    ('documentos','criar'), ('documentos','excluir'), ('documentos','ver'),
    ('grupos','adicionar_usuario'), ('grupos','editar'), ('grupos','gerenciar_usuario'),
    ('nao_execucao','criar'), ('nao_execucao','editar'), ('nao_execucao','excluir'),
    ('subgrupos','criar'), ('subgrupos','editar'), ('subgrupos','gerenciar_funcoes'),
    ('ticket','cancelar'), ('ticket','categorias_gerir'), ('ticket','criar'), ('ticket','tratar'), ('ticket','ver')
  )
  on conflict do nothing;
end;
$$;

-- Trigger: semeia ao criar nova empresa (mesmo padrão de trg_empresa_notif_seed).
create or replace function trg_seed_gestao_grupo_empresa()
returns trigger language plpgsql security definer as $$
begin
  perform seed_perfil_gestao_grupo(new.id);
  return new;
end;
$$;

drop trigger if exists trg_empresa_gestao_grupo_seed on empresas;
create trigger trg_empresa_gestao_grupo_seed
  after insert on empresas
  for each row execute function trg_seed_gestao_grupo_empresa();

-- Backfill: empresas já existentes ganham o perfil (a QA Smoke já tem o seu —
-- o guard de existência por nome a ignora, preservando o que o usuário montou).
do $$
declare r record;
begin
  for r in select id from empresas loop
    perform seed_perfil_gestao_grupo(r.id);
  end loop;
end;
$$;
