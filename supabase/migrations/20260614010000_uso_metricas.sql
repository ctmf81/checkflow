-- ============================================================
-- USO / MÉTRICAS POR EMPRESA
-- ============================================================
-- Registra consumo por empresa para acompanhamento de plano/limites
-- em /sistema/empresas/[id] (aba "Uso"):
--   - uso_armazenamento: bytes de cada upload (fotos/vídeos de execuções
--     e tickets, PDFs de relatório)
--   - uso_ia_eventos: tokens consumidos em cada chamada da Consulta
--     Inteligente (/api/documentos/consultar)
--
-- "Checklists executados" não precisa de tabela nova: é um count(*) em
-- checklist_execucoes por unidade/empresa e período.

create table uso_armazenamento (
  id            uuid primary key default uuid_generate_v4(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  origem        text not null check (origem in ('execucao', 'ticket', 'pdf')),
  tamanho_bytes bigint not null default 0,
  criado_por    uuid references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now()
);

create index idx_uso_armazenamento_empresa on uso_armazenamento(empresa_id);
create index idx_uso_armazenamento_criado_em on uso_armazenamento(criado_em);

create table uso_ia_eventos (
  id             uuid primary key default uuid_generate_v4(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  unidade_id     uuid references unidades(id) on delete set null,
  usuario_id     uuid references auth.users(id) on delete set null,
  provedor       text not null,
  modelo         text,
  tokens_entrada integer not null default 0,
  tokens_saida   integer not null default 0,
  criado_em      timestamptz not null default now()
);

create index idx_uso_ia_eventos_empresa on uso_ia_eventos(empresa_id);
create index idx_uso_ia_eventos_criado_em on uso_ia_eventos(criado_em);

-- ─── RLS ──────────────────────────────────────────────────────

alter table uso_armazenamento enable row level security;
alter table uso_ia_eventos    enable row level security;

-- armazenamento: qualquer membro da empresa pode registrar um upload seu
create policy "uso_armazenamento_inserir" on uso_armazenamento
  for insert with check (
    exists (
      select 1 from usuario_empresa ue
      where ue.usuario_id = auth.uid() and ue.empresa_id = uso_armazenamento.empresa_id
    )
  );

-- leitura: apenas admin de sistema (tela /sistema/empresas/[id])
create policy "uso_armazenamento_leitura" on uso_armazenamento
  for select using (is_admin_sistema());

-- ia: inserido apenas pela rota server-side (service role bypassa RLS),
-- leitura restrita ao admin de sistema
create policy "uso_ia_eventos_leitura" on uso_ia_eventos
  for select using (is_admin_sistema());
