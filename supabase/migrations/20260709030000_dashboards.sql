-- ============================================================
-- DASHBOARDS — painéis públicos de monitoramento (TV)
-- ============================================================
-- Um dashboard tem N painéis que rodam num carrossel (transicao_segundos) e
-- recarregam os dados de tempos em tempos (refresh_segundos). Cada painel lê o
-- HISTÓRICO de respostas de UMA atividade de checklist (sim_nao, multipla_escolha
-- única, numero, padrao). Acesso público por TOKEN (sem login) — a leitura
-- pública passa por uma rota service-role escopada ao token (ver /api/painel).
-- Criação/edição por permissão `dashboards`, escopo da unidade (o seletor de
-- atividade pode cruzar qualquer grupo/subgrupo da unidade).

create table dashboards (
  id                 uuid primary key default gen_random_uuid(),
  unidade_id         uuid not null references unidades(id) on delete cascade,
  nome               text not null,
  token              text not null unique default encode(gen_random_bytes(16), 'hex'),
  transicao_segundos int  not null default 15,   -- rotação entre painéis
  refresh_segundos   int  not null default 60,   -- recarga dos dados
  criado_por         uuid references usuarios(id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index on dashboards(unidade_id);

create table dashboard_paineis (
  id            uuid primary key default gen_random_uuid(),
  dashboard_id  uuid not null references dashboards(id) on delete cascade,
  ordem         int  not null default 0,
  titulo        text,                                   -- null = usa o nome da atividade
  atividade_id  uuid not null references checklist_atividades(id) on delete cascade,
  janela_horas  int  not null default 24,               -- janela do gráfico e da tendência
  criado_em     timestamptz not null default now()
);
create index on dashboard_paineis(dashboard_id);

-- ── Permissão ────────────────────────────────────────────────
insert into permissoes (recurso, acao, descricao) values
  ('dashboards', 'ver',     'Visualizar dashboards'),
  ('dashboards', 'criar',   'Criar/editar dashboards'),
  ('dashboards', 'deletar', 'Excluir dashboards')
on conflict (recurso, acao) do nothing;

insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id from perfis pf
join permissoes p on p.recurso = 'dashboards'
where pf.is_system
on conflict do nothing;

-- ── RLS ──────────────────────────────────────────────────────
alter table dashboards        enable row level security;
alter table dashboard_paineis enable row level security;

-- Leitura: membro da unidade (ou admin). Escrita: permissão `dashboards` + unidade.
create policy "dashboards_leitura" on dashboards for select using (
  is_admin_sistema()
  or is_admin_empresa_unidade(unidade_id)
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);
create policy "dashboards_escrita" on dashboards for all
  using (
    is_admin_sistema()
    or is_admin_empresa_unidade(unidade_id)
    or (unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and usuario_tem_permissao('dashboards', 'criar'))
  )
  with check (
    is_admin_sistema()
    or is_admin_empresa_unidade(unidade_id)
    or (unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        and usuario_tem_permissao('dashboards', 'criar'))
  );

create policy "paineis_leitura" on dashboard_paineis for select using (
  is_admin_sistema()
  or dashboard_id in (
    select id from dashboards d
    where is_admin_empresa_unidade(d.unidade_id)
       or d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);
create policy "paineis_escrita" on dashboard_paineis for all
  using (
    is_admin_sistema()
    or dashboard_id in (
      select id from dashboards d
      where is_admin_empresa_unidade(d.unidade_id)
         or (d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
             and usuario_tem_permissao('dashboards', 'criar'))
    )
  )
  with check (
    is_admin_sistema()
    or dashboard_id in (
      select id from dashboards d
      where is_admin_empresa_unidade(d.unidade_id)
         or (d.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
             and usuario_tem_permissao('dashboards', 'criar'))
    )
  );
