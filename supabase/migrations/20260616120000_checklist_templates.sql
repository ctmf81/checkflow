-- ============================================================
-- GALERIA DE TEMPLATES DE CHECKLIST
-- ============================================================
-- Um template é um checklist marcado como modelo (is_template),
-- sem unidade, curado pelo admin. A empresa clona para a sua unidade.

alter table checklists add column if not exists is_template boolean not null default false;
alter table checklists add column if not exists template_segmentos text[] not null default '{}';

create index if not exists idx_checklists_template on checklists(is_template) where is_template;

-- ─── Leitura pública dos modelos ────────────────────────────
-- Modelos (is_template) são legíveis por qualquer usuário autenticado
-- (galeria). Mantém o escopo por unidade para checklists normais.
drop policy if exists "checklists_leitura" on checklists;
create policy "checklists_leitura" on checklists for select using (
  is_admin_sistema()
  or is_template
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

drop policy if exists "secoes_leitura" on checklist_secoes;
create policy "secoes_leitura" on checklist_secoes for select using (
  is_admin_sistema()
  or checklist_id in (
    select id from checklists
    where is_template
       or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);

drop policy if exists "atividades_leitura" on checklist_atividades;
create policy "atividades_leitura" on checklist_atividades for select using (
  is_admin_sistema()
  or checklist_id in (
    select id from checklists
    where is_template
       or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);

drop policy if exists "opcoes_leitura" on checklist_atividade_opcoes;
create policy "opcoes_leitura" on checklist_atividade_opcoes for select using (
  is_admin_sistema()
  or atividade_id in (
    select ca.id from checklist_atividades ca
    join checklists cl on cl.id = ca.checklist_id
    where cl.is_template
       or cl.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);

-- ─── Clonagem de template para uma unidade ──────────────────
create or replace function clonar_template(p_template_id uuid, p_unidade_id uuid, p_nome text)
returns uuid language plpgsql security definer as $$
declare
  v_novo uuid;
  v_sec record;
  v_atv record;
  v_op record;
  sec_map jsonb := '{}';
  atv_map jsonb := '{}';
  v_new_sec uuid;
  v_new_atv uuid;
begin
  if not (is_admin_sistema() or exists (
    select 1 from usuario_unidade where usuario_id = auth.uid() and unidade_id = p_unidade_id
  )) then
    raise exception 'Sem permissão para criar checklist nesta unidade.';
  end if;
  if not exists (select 1 from checklists where id = p_template_id and is_template) then
    raise exception 'Template não encontrado.';
  end if;

  insert into checklists (unidade_id, nome, descricao, status, is_template, criado_por)
  select p_unidade_id, coalesce(nullif(p_nome, ''), nome), descricao, 'rascunho', false, auth.uid()
  from checklists where id = p_template_id
  returning id into v_novo;

  for v_sec in select * from checklist_secoes where checklist_id = p_template_id order by ordem loop
    insert into checklist_secoes (checklist_id, nome, ordem)
    values (v_novo, v_sec.nome, v_sec.ordem) returning id into v_new_sec;
    sec_map := sec_map || jsonb_build_object(v_sec.id::text, v_new_sec::text);
  end loop;

  for v_atv in select * from checklist_atividades where checklist_id = p_template_id order by ordem loop
    insert into checklist_atividades
      (checklist_id, secao_id, nome, descricao, tipo, ordem, obrigatoria, critica, valor_gatilho, config, gera_plano_acao)
    values (
      v_novo,
      case when v_atv.secao_id is not null then (sec_map->>v_atv.secao_id::text)::uuid else null end,
      v_atv.nome, v_atv.descricao, v_atv.tipo, v_atv.ordem, v_atv.obrigatoria, v_atv.critica,
      v_atv.valor_gatilho, v_atv.config, v_atv.gera_plano_acao
    ) returning id into v_new_atv;
    atv_map := atv_map || jsonb_build_object(v_atv.id::text, v_new_atv::text);

    for v_op in select * from checklist_atividade_opcoes where atividade_id = v_atv.id loop
      insert into checklist_atividade_opcoes (atividade_id, label, valor, ordem, e_valido)
      values (v_new_atv, v_op.label, v_op.valor, v_op.ordem, v_op.e_valido);
    end loop;
  end loop;

  -- resolve dependências (atividade_pai_id) com o mapa antigo→novo
  update checklist_atividades dst
  set atividade_pai_id = (atv_map->>src.atividade_pai_id::text)::uuid
  from checklist_atividades src
  where src.checklist_id = p_template_id
    and src.atividade_pai_id is not null
    and dst.id = (atv_map->>src.id::text)::uuid;

  return v_novo;
end $$;

-- ─── Seed: modelos de exemplo (idempotente) ─────────────────
do $$
declare
  v_cl uuid;
  v_sec uuid;
begin
  -- só semeia se ainda não houver nenhum template
  if exists (select 1 from checklists where is_template) then return; end if;

  -- ── Oficina: Recepção de veículo ──
  insert into checklists (unidade_id, nome, descricao, status, is_template, template_segmentos)
  values (null, 'Recepção de veículo', 'Vistoria de entrada do veículo na oficina', 'publicado', true, '{oficina,automotivo}')
  returning id into v_cl;

  insert into checklist_secoes (checklist_id, nome, ordem) values (v_cl, 'Identificação', 0) returning id into v_sec;
  insert into checklist_atividades (checklist_id, secao_id, nome, tipo, ordem, obrigatoria) values
    (v_cl, v_sec, 'Placa do veículo', 'texto', 0, true),
    (v_cl, v_sec, 'Quilometragem', 'numero', 1, true),
    (v_cl, v_sec, 'Foto frontal do veículo', 'foto', 2, true);

  insert into checklist_secoes (checklist_id, nome, ordem) values (v_cl, 'Exterior', 1) returning id into v_sec;
  insert into checklist_atividades (checklist_id, secao_id, nome, tipo, ordem, obrigatoria, gera_plano_acao, config) values
    (v_cl, v_sec, 'Lataria sem avarias?', 'sim_nao', 0, true, true, '{"esperado":"sim"}'),
    (v_cl, v_sec, 'Pneus em bom estado?', 'sim_nao', 1, true, false, '{"esperado":"sim"}'),
    (v_cl, v_sec, 'Observações do exterior', 'texto', 2, false, false, '{}');

  -- ── Restaurante: Abertura de loja ──
  insert into checklists (unidade_id, nome, descricao, status, is_template, template_segmentos)
  values (null, 'Abertura de loja', 'Rotina de abertura — higiene e equipamentos', 'publicado', true, '{restaurante,food,varejo}')
  returning id into v_cl;

  insert into checklist_secoes (checklist_id, nome, ordem) values (v_cl, 'Higiene', 0) returning id into v_sec;
  insert into checklist_atividades (checklist_id, secao_id, nome, tipo, ordem, obrigatoria, critica, gera_plano_acao, config) values
    (v_cl, v_sec, 'Área de preparo higienizada?', 'sim_nao', 0, true, true, true, '{"esperado":"sim"}'),
    (v_cl, v_sec, 'Equipe com uniforme/EPI?', 'sim_nao', 1, true, false, false, '{"esperado":"sim"}');

  insert into checklist_secoes (checklist_id, nome, ordem) values (v_cl, 'Equipamentos', 1) returning id into v_sec;
  insert into checklist_atividades (checklist_id, secao_id, nome, tipo, ordem, obrigatoria, critica, gera_plano_acao, config) values
    (v_cl, v_sec, 'Temperatura da câmara fria (°C)', 'numero', 0, true, true, true, '{"min":0,"max":8,"unidade":"°C"}'),
    (v_cl, v_sec, 'Foto do balcão de exposição', 'foto', 1, false, false, false, '{}');
end $$;
