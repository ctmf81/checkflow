-- ============================================================
-- Ocorrências de causa raiz.
--
-- Distinção importante:
--   • causa_raiz                = BANCO de causas possíveis por atividade
--     (catálogo curado em Configurações).
--   • causa_raiz_ocorrencias    = a OCORRÊNCIA real de uma causa raiz quando
--     um plano de ação é aberto numa execução — com observação própria.
--
-- Na abertura do plano (execução), a pessoa escolhe uma causa raiz do banco
-- daquela atividade e pode anexar uma observação. As últimas ocorrências da
-- atividade são exibidas no modal como histórico.
-- ============================================================

create table if not exists causa_raiz_ocorrencias (
  id            uuid primary key default gen_random_uuid(),
  causa_raiz_id uuid not null references causa_raiz(id) on delete cascade,
  atividade_id  uuid not null references checklist_atividades(id) on delete cascade,
  plano_acao_id uuid references planos_acao(id) on delete cascade,
  unidade_id    uuid not null references unidades(id) on delete cascade,
  observacao    text,
  criado_por    uuid references usuarios(id) on delete set null,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_cr_ocorrencias_atividade on causa_raiz_ocorrencias(atividade_id);
create index if not exists idx_cr_ocorrencias_plano     on causa_raiz_ocorrencias(plano_acao_id);
create index if not exists idx_cr_ocorrencias_causa     on causa_raiz_ocorrencias(causa_raiz_id);

alter table causa_raiz_ocorrencias enable row level security;

-- Leitura: admin de sistema ou membro da unidade (vê o histórico da atividade).
drop policy if exists "cr_ocorrencias_leitura" on causa_raiz_ocorrencias;
create policy "cr_ocorrencias_leitura" on causa_raiz_ocorrencias for select using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

-- Inserção: qualquer membro da unidade (quem executa/abre o plano registra a
-- ocorrência). with check garante o escopo da própria unidade.
drop policy if exists "cr_ocorrencias_insert" on causa_raiz_ocorrencias;
create policy "cr_ocorrencias_insert" on causa_raiz_ocorrencias for insert
  with check (
    is_admin_sistema()
    or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  );

-- Edição/remoção: só admin de sistema (registro histórico, não editável).
drop policy if exists "cr_ocorrencias_admin" on causa_raiz_ocorrencias;
create policy "cr_ocorrencias_admin" on causa_raiz_ocorrencias for all
  using (is_admin_sistema()) with check (is_admin_sistema());
