-- ============================================================
-- LISTAS DE TAREFAS — feature pontual, separada do Checklist
-- Um modelo de lista (título + itens) é distribuído a grupos/
-- subgrupos. Vale por data limite OU nº de respostas (o que vier
-- primeiro). Cada usuário gera sua própria instância de execução.
-- ============================================================

-- Modelo da lista
create table tarefa_listas (
  id                  uuid primary key default gen_random_uuid(),
  unidade_id          uuid not null references unidades(id) on delete cascade,
  titulo              text not null,
  descricao           text,
  status              text not null default 'rascunho'
                      check (status in ('rascunho', 'publicada', 'encerrada')),
  -- Janela de ABERTURA de novas instâncias (encerra no que vier primeiro)
  abertura_data_limite  timestamptz,            -- null = sem limite de data
  abertura_max_respostas integer,               -- null = sem limite de quantidade
  -- Janela de EDIÇÃO de cada instância depois de aberta
  edicao_janela_horas integer,                  -- null = pode editar até a lista encerrar
  -- Notificação opcional ao publicar
  notificar_whatsapp  boolean not null default false,
  criado_por          uuid references usuarios(id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

-- Atribuição da lista a grupos e subgrupos
create table tarefa_lista_grupos (
  lista_id  uuid not null references tarefa_listas(id) on delete cascade,
  grupo_id  uuid not null references grupos(id) on delete cascade,
  primary key (lista_id, grupo_id)
);

create table tarefa_lista_subgrupos (
  lista_id    uuid not null references tarefa_listas(id) on delete cascade,
  subgrupo_id uuid not null references subgrupos(id) on delete cascade,
  primary key (lista_id, subgrupo_id)
);

-- Itens (tarefas) do modelo — flags por tarefa
create table tarefa_itens (
  id               uuid primary key default gen_random_uuid(),
  lista_id         uuid not null references tarefa_listas(id) on delete cascade,
  titulo           text not null,
  ordem            integer not null default 0,
  aceita_observacao boolean not null default false,
  aceita_evidencia  boolean not null default false,
  exige_checkin     boolean not null default false,
  criado_em        timestamptz not null default now()
);

-- Instância de execução por usuário (1 por lista por usuário)
create table tarefa_execucoes (
  id           uuid primary key default gen_random_uuid(),
  lista_id     uuid not null references tarefa_listas(id) on delete cascade,
  unidade_id   uuid not null references unidades(id) on delete cascade,
  usuario_id   uuid not null references usuarios(id) on delete cascade,
  status       text not null default 'em_andamento'
               check (status in ('em_andamento', 'encerrada')),
  aberta_em    timestamptz not null default now(),
  editavel_ate timestamptz,                     -- aberta_em + edicao_janela_horas (null = sem limite próprio)
  atualizado_em timestamptz not null default now(),
  unique (lista_id, usuario_id)
);

-- Resposta por item dentro de uma instância
create table tarefa_respostas (
  id            uuid primary key default gen_random_uuid(),
  execucao_id   uuid not null references tarefa_execucoes(id) on delete cascade,
  item_id       uuid not null references tarefa_itens(id) on delete cascade,
  feito         boolean not null default false,
  observacao    text,
  evidencia_url text,
  evidencia_tipo text check (evidencia_tipo in ('foto', 'video')),
  lat           double precision,
  lng           double precision,
  respondido_em timestamptz not null default now(),
  unique (execucao_id, item_id)
);

-- Indexes
create index on tarefa_listas(unidade_id);
create index on tarefa_lista_grupos(lista_id);
create index on tarefa_lista_subgrupos(lista_id);
create index on tarefa_lista_subgrupos(subgrupo_id);
create index on tarefa_itens(lista_id);
create index on tarefa_execucoes(lista_id);
create index on tarefa_execucoes(usuario_id);
create index on tarefa_respostas(execucao_id);

-- ── Permissões (recurso 'tarefas') ───────────────────────────
insert into permissoes (recurso, acao, descricao) values
  ('tarefas', 'ver',     'Visualizar listas de tarefas'),
  ('tarefas', 'criar',   'Criar listas de tarefas'),
  ('tarefas', 'editar',  'Editar listas de tarefas'),
  ('tarefas', 'deletar', 'Excluir listas de tarefas')
on conflict (recurso, acao) do nothing;

-- Concede aos perfis de sistema (Administrador) para não quebrar acesso
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from perfis pf
join permissoes p on p.recurso = 'tarefas'
where pf.is_system = true
on conflict do nothing;

-- ── RLS ──────────────────────────────────────────────────────
alter table tarefa_listas          enable row level security;
alter table tarefa_lista_grupos    enable row level security;
alter table tarefa_lista_subgrupos enable row level security;
alter table tarefa_itens           enable row level security;
alter table tarefa_execucoes       enable row level security;
alter table tarefa_respostas       enable row level security;

-- Helper local: a lista pertence a uma unidade do usuário?
-- (subquery direto nas policies abaixo)

-- tarefa_listas: leitura por membros da unidade; escrita exige permissão 'tarefas'
create policy "tarefa_listas_leitura" on tarefa_listas for select using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);
create policy "tarefa_listas_insert" on tarefa_listas for insert with check (
  is_admin_sistema()
  or (unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('tarefas', 'criar'))
);
create policy "tarefa_listas_update" on tarefa_listas for update using (
  is_admin_sistema()
  or (unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('tarefas', 'editar'))
);
create policy "tarefa_listas_delete" on tarefa_listas for delete using (
  is_admin_sistema()
  or (unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and usuario_tem_permissao('tarefas', 'deletar'))
);

-- Tabelas-filhas do modelo (grupos/subgrupos/itens): leitura por membro da
-- unidade da lista; escrita por quem está na unidade da lista (gate de
-- permissão fica na lista).
do $$
declare t text;
begin
  foreach t in array array['tarefa_lista_grupos','tarefa_lista_subgrupos','tarefa_itens'] loop
    execute format($f$
      create policy "%1$s_leitura" on %1$s for select using (
        is_admin_sistema()
        or lista_id in (
          select id from tarefa_listas
          where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        )
      );
      create policy "%1$s_escrita" on %1$s for all using (
        is_admin_sistema()
        or lista_id in (
          select id from tarefa_listas
          where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
        )
      );
    $f$, t);
  end loop;
end $$;

-- tarefa_execucoes: gestão (unidade) lê todas; usuário cria/edita a SUA
create policy "tarefa_exec_leitura" on tarefa_execucoes for select using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);
create policy "tarefa_exec_insert" on tarefa_execucoes for insert with check (
  usuario_id = auth.uid()
  and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);
create policy "tarefa_exec_update" on tarefa_execucoes for update using (
  is_admin_sistema() or usuario_id = auth.uid()
);

-- tarefa_respostas: leitura por membro da unidade; escrita só do dono da instância
create policy "tarefa_resp_leitura" on tarefa_respostas for select using (
  is_admin_sistema()
  or execucao_id in (
    select id from tarefa_execucoes
    where unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  )
);
create policy "tarefa_resp_escrita" on tarefa_respostas for all using (
  is_admin_sistema()
  or execucao_id in (select id from tarefa_execucoes where usuario_id = auth.uid())
);
