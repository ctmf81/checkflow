-- ============================================================
-- ADMIN DA EMPRESA — mesmas funções do admin de sistema, porém
-- restritas à(s) empresa(s) onde o usuário tem o perfil
-- "Admin da empresa" (perfil_id = ...002).
--
-- Escopo (confirmado 2026-06-20):
--   PODE: gerenciar usuários/acessos e estrutura (unidades, grupos,
--         subgrupos, turnos) da PRÓPRIA empresa; atribuir outro
--         "Admin da empresa" (vários em paralelo).
--   NÃO PODE: gerenciar outras empresas, catálogo de planos/preços,
--         parceiros, provedores de IA, colunas financeiras, nem se
--         tornar/atribuir "Admin de sistema".
--
-- Técnica: políticas ADITIVAS (RLS combina permissivas com OR), sem
-- reescrever/remover as policies existentes — evita afrouxar regras
-- por engano. Idempotente (drop if exists antes de cada create).
-- ============================================================

-- ── Helpers ───────────────────────────────────────────────────
-- É admin da empresa informada?
create or replace function is_admin_empresa(p_empresa_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from usuario_empresa
    where usuario_id = auth.uid()
      and empresa_id = p_empresa_id
      and perfil_id = '00000000-0000-0000-0000-000000000002'
  )
$$;

-- É admin da empresa dona da unidade informada?
-- Regra (2026-06-20): o admin da empresa enxerga e atua em TODA a sua empresa,
-- incluindo TODAS as unidades dela (só não vê outras empresas).
create or replace function is_admin_empresa_unidade(p_unidade_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select is_admin_empresa((select empresa_id from unidades where id = p_unidade_id))
$$;

create or replace function is_admin_empresa_grupo(p_grupo_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select is_admin_empresa_unidade((select unidade_id from grupos where id = p_grupo_id))
$$;

create or replace function is_admin_empresa_subgrupo(p_subgrupo_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select is_admin_empresa_grupo((select grupo_id from subgrupos where id = p_subgrupo_id))
$$;

grant execute on function is_admin_empresa(uuid)            to authenticated;
grant execute on function is_admin_empresa_unidade(uuid)    to authenticated;
grant execute on function is_admin_empresa_grupo(uuid)      to authenticated;
grant execute on function is_admin_empresa_subgrupo(uuid)   to authenticated;

-- ── Estrutura organizacional ──────────────────────────────────
-- Todas as unidades da empresa do admin.
drop policy if exists "unidades_admin_empresa" on unidades;
create policy "unidades_admin_empresa" on unidades for all
  using (is_admin_empresa(empresa_id))
  with check (is_admin_empresa(empresa_id));

drop policy if exists "grupos_admin_empresa" on grupos;
create policy "grupos_admin_empresa" on grupos for all
  using (is_admin_empresa_unidade(unidade_id))
  with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "subgrupos_admin_empresa" on subgrupos;
create policy "subgrupos_admin_empresa" on subgrupos for all
  using (is_admin_empresa_grupo(grupo_id))
  with check (is_admin_empresa_grupo(grupo_id));

drop policy if exists "turnos_admin_empresa" on turnos;
create policy "turnos_admin_empresa" on turnos for all
  using (is_admin_empresa(empresa_id))
  with check (is_admin_empresa(empresa_id));

-- ── Vínculos de usuário (gestão de acessos) ───────────────────
-- usuario_empresa: o admin pode vincular/alterar perfil de usuários
-- da SUA empresa — inclusive promover outro "Admin da empresa".
-- Guard: NUNCA pode atribuir "Admin de sistema" (...001).
drop policy if exists "usuario_empresa_admin_empresa" on usuario_empresa;
create policy "usuario_empresa_admin_empresa" on usuario_empresa for all
  using (is_admin_empresa(empresa_id))
  with check (
    is_admin_empresa(empresa_id)
    and perfil_id is distinct from '00000000-0000-0000-0000-000000000001'
  );

drop policy if exists "usuario_unidade_admin_empresa" on usuario_unidade;
create policy "usuario_unidade_admin_empresa" on usuario_unidade for all
  using (is_admin_empresa_unidade(unidade_id))
  with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "usuario_grupo_admin_empresa" on usuario_grupo;
create policy "usuario_grupo_admin_empresa" on usuario_grupo for all
  using (is_admin_empresa_grupo(grupo_id))
  with check (is_admin_empresa_grupo(grupo_id));

drop policy if exists "usuario_subgrupo_admin_empresa" on usuario_subgrupo;
create policy "usuario_subgrupo_admin_empresa" on usuario_subgrupo for all
  using (is_admin_empresa_subgrupo(subgrupo_id))
  with check (is_admin_empresa_subgrupo(subgrupo_id));

-- ── Dados operacionais — "vê tudo" da empresa (todas as unidades) ─────────────
-- Políticas ADITIVAS escopadas ao admin da empresa: só retornam linhas quando
-- is_admin_empresa_unidade(...) é verdadeiro, então NÃO abrem nada para usuário
-- comum. `for all` = ler e gerenciar todas as unidades da SUA empresa.

-- Tabelas com unidade_id direto
drop policy if exists "checklists_admin_empresa" on checklists;
create policy "checklists_admin_empresa" on checklists for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "checklist_execucoes_admin_empresa" on checklist_execucoes;
create policy "checklist_execucoes_admin_empresa" on checklist_execucoes for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "documentos_admin_empresa" on documentos;
create policy "documentos_admin_empresa" on documentos for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "catalogos_admin_empresa" on catalogos;
create policy "catalogos_admin_empresa" on catalogos for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "nao_execucao_motivos_admin_empresa" on nao_execucao_motivos;
create policy "nao_execucao_motivos_admin_empresa" on nao_execucao_motivos for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "causa_raiz_admin_empresa" on causa_raiz;
create policy "causa_raiz_admin_empresa" on causa_raiz for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "tickets_admin_empresa" on tickets;
create policy "tickets_admin_empresa" on tickets for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "ticket_categorias_admin_empresa" on ticket_categorias;
create policy "ticket_categorias_admin_empresa" on ticket_categorias for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "ticket_sla_config_admin_empresa" on ticket_sla_config;
create policy "ticket_sla_config_admin_empresa" on ticket_sla_config for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "planos_acao_admin_empresa" on planos_acao;
create policy "planos_acao_admin_empresa" on planos_acao for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "tarefa_listas_admin_empresa" on tarefa_listas;
create policy "tarefa_listas_admin_empresa" on tarefa_listas for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "tarefa_execucoes_admin_empresa" on tarefa_execucoes;
create policy "tarefa_execucoes_admin_empresa" on tarefa_execucoes for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

drop policy if exists "agendamentos_admin_empresa" on agendamentos;
create policy "agendamentos_admin_empresa" on agendamentos for all
  using (is_admin_empresa_unidade(unidade_id)) with check (is_admin_empresa_unidade(unidade_id));

-- Tabelas-filhas (resolvem a unidade via tabela-pai; escopadas ao admin)
drop policy if exists "checklist_versoes_admin_empresa" on checklist_versoes;
create policy "checklist_versoes_admin_empresa" on checklist_versoes for all
  using (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)))
  with check (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "checklist_secoes_admin_empresa" on checklist_secoes;
create policy "checklist_secoes_admin_empresa" on checklist_secoes for all
  using (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)))
  with check (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "checklist_atividades_admin_empresa" on checklist_atividades;
create policy "checklist_atividades_admin_empresa" on checklist_atividades for all
  using (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)))
  with check (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "checklist_atividade_opcoes_admin_empresa" on checklist_atividade_opcoes;
create policy "checklist_atividade_opcoes_admin_empresa" on checklist_atividade_opcoes for all
  using (atividade_id in (
    select a.id from checklist_atividades a join checklists c on c.id = a.checklist_id
    where is_admin_empresa_unidade(c.unidade_id)))
  with check (atividade_id in (
    select a.id from checklist_atividades a join checklists c on c.id = a.checklist_id
    where is_admin_empresa_unidade(c.unidade_id)));

drop policy if exists "checklist_nao_exec_admin_empresa" on checklist_nao_execucao_motivos;
create policy "checklist_nao_exec_admin_empresa" on checklist_nao_execucao_motivos for all
  using (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)))
  with check (checklist_id in (select id from checklists where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "checklist_exec_respostas_admin_empresa" on checklist_execucao_respostas;
create policy "checklist_exec_respostas_admin_empresa" on checklist_execucao_respostas for all
  using (execucao_id in (select id from checklist_execucoes where is_admin_empresa_unidade(unidade_id)))
  with check (execucao_id in (select id from checklist_execucoes where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "catalogo_valores_admin_empresa" on catalogo_valores;
create policy "catalogo_valores_admin_empresa" on catalogo_valores for all
  using (catalogo_id in (select id from catalogos where is_admin_empresa_unidade(unidade_id)))
  with check (catalogo_id in (select id from catalogos where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "documento_etapas_admin_empresa" on documento_etapas;
create policy "documento_etapas_admin_empresa" on documento_etapas for all
  using (documento_id in (select id from documentos where is_admin_empresa_unidade(unidade_id)))
  with check (documento_id in (select id from documentos where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "etapa_imagens_admin_empresa" on etapa_imagens;
create policy "etapa_imagens_admin_empresa" on etapa_imagens for all
  using (etapa_id in (
    select e.id from documento_etapas e join documentos d on d.id = e.documento_id
    where is_admin_empresa_unidade(d.unidade_id)))
  with check (etapa_id in (
    select e.id from documento_etapas e join documentos d on d.id = e.documento_id
    where is_admin_empresa_unidade(d.unidade_id)));

drop policy if exists "ticket_eventos_admin_empresa" on ticket_eventos;
create policy "ticket_eventos_admin_empresa" on ticket_eventos for all
  using (ticket_id in (select id from tickets where is_admin_empresa_unidade(unidade_id)))
  with check (ticket_id in (select id from tickets where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "ticket_evidencias_admin_empresa" on ticket_evidencias;
create policy "ticket_evidencias_admin_empresa" on ticket_evidencias for all
  using (ticket_id in (select id from tickets where is_admin_empresa_unidade(unidade_id)))
  with check (ticket_id in (select id from tickets where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "plano_acao_evidencias_admin_empresa" on plano_acao_evidencias;
create policy "plano_acao_evidencias_admin_empresa" on plano_acao_evidencias for all
  using (plano_acao_id in (select id from planos_acao where is_admin_empresa_unidade(unidade_id)))
  with check (plano_acao_id in (select id from planos_acao where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "plano_acao_movimentacoes_admin_empresa" on plano_acao_movimentacoes;
create policy "plano_acao_movimentacoes_admin_empresa" on plano_acao_movimentacoes for all
  using (plano_acao_id in (select id from planos_acao where is_admin_empresa_unidade(unidade_id)))
  with check (plano_acao_id in (select id from planos_acao where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "plano_mov_evidencias_admin_empresa" on plano_acao_movimentacao_evidencias;
create policy "plano_mov_evidencias_admin_empresa" on plano_acao_movimentacao_evidencias for all
  using (movimentacao_id in (
    select m.id from plano_acao_movimentacoes m join planos_acao p on p.id = m.plano_acao_id
    where is_admin_empresa_unidade(p.unidade_id)))
  with check (movimentacao_id in (
    select m.id from plano_acao_movimentacoes m join planos_acao p on p.id = m.plano_acao_id
    where is_admin_empresa_unidade(p.unidade_id)));

drop policy if exists "tarefa_lista_grupos_admin_empresa" on tarefa_lista_grupos;
create policy "tarefa_lista_grupos_admin_empresa" on tarefa_lista_grupos for all
  using (lista_id in (select id from tarefa_listas where is_admin_empresa_unidade(unidade_id)))
  with check (lista_id in (select id from tarefa_listas where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "tarefa_lista_subgrupos_admin_empresa" on tarefa_lista_subgrupos;
create policy "tarefa_lista_subgrupos_admin_empresa" on tarefa_lista_subgrupos for all
  using (lista_id in (select id from tarefa_listas where is_admin_empresa_unidade(unidade_id)))
  with check (lista_id in (select id from tarefa_listas where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "tarefa_itens_admin_empresa" on tarefa_itens;
create policy "tarefa_itens_admin_empresa" on tarefa_itens for all
  using (lista_id in (select id from tarefa_listas where is_admin_empresa_unidade(unidade_id)))
  with check (lista_id in (select id from tarefa_listas where is_admin_empresa_unidade(unidade_id)));

drop policy if exists "tarefa_respostas_admin_empresa" on tarefa_respostas;
create policy "tarefa_respostas_admin_empresa" on tarefa_respostas for all
  using (execucao_id in (select id from tarefa_execucoes where is_admin_empresa_unidade(unidade_id)))
  with check (execucao_id in (select id from tarefa_execucoes where is_admin_empresa_unidade(unidade_id)));
