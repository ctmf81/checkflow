-- ============================================================
-- RELATÓRIOS por IA (Feature 2 de IA) — modelos + relatórios gerados
-- ============================================================
-- A IA gera o relatório das EXECUÇÕES de um checklist nas últimas X horas
-- (1–24h). Duas entidades:
--   • relatorio_modelos    → template reutilizável (checklist + período + prompt)
--   • relatorios_gerados   → instância (status assíncrono + conteúdo da IA)
--
-- Entitlement: característica `ia` do plano (= "Serviços de IA") — gateada na UI
-- (menu some) e na ROTA de geração (tokens). NÃO é um módulo/recurso, então NÃO
-- entra em empresa_libera_recurso; a RLS enforça tenant + permissão + carência.
-- Permissão de perfil: recurso 'relatorios' (criar/editar/excluir/executar).
-- Criar modelo / gerar = criação de conteúdo → bloqueia em somente-leitura
-- (empresa_pode_criar, RESTRICTIVE insert). Consultar segue liberado.

-- ── 1. Tabelas ───────────────────────────────────────────────
create table relatorio_modelos (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    uuid not null references unidades(id) on delete cascade,
  checklist_id  uuid not null references checklists(id) on delete cascade,
  nome          text not null,
  periodo_horas int  not null default 24 check (periodo_horas between 1 and 24),
  prompt        text not null default '',
  criado_por    uuid references usuarios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on relatorio_modelos(unidade_id);
create index on relatorio_modelos(checklist_id);

create table relatorios_gerados (
  id           uuid primary key default gen_random_uuid(),
  modelo_id    uuid not null references relatorio_modelos(id) on delete cascade,
  unidade_id   uuid not null references unidades(id) on delete cascade,  -- denormalizado p/ RLS
  status       text not null default 'gerando' check (status in ('gerando','pronto','erro')),
  periodo_de   timestamptz not null,   -- snapshot da janela REAL analisada
  periodo_ate  timestamptz not null,
  conteudo     text,
  erro_msg     text,
  gerado_por   uuid references usuarios(id) on delete set null,
  gerado_em    timestamptz not null default now()
);
create index on relatorios_gerados(modelo_id);
create index on relatorios_gerados(unidade_id);

-- ── 2. RLS ───────────────────────────────────────────────────
-- Isolamento por unidade (usuario_unidade) + variante admin da empresa
-- (is_admin_empresa_unidade) + admin de sistema. Escrita de MODELO checa a
-- permissão de perfil por ação. relatorios_gerados é escrito só pela rota
-- (service role, ignora RLS) → aqui só leitura por tenant.
alter table relatorio_modelos  enable row level security;
alter table relatorios_gerados enable row level security;

-- helper inline: unidades do usuário
--   unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())

-- relatorio_modelos: leitura por tenant
create policy "relatorio_modelos_leitura" on relatorio_modelos for select using (
  is_admin_sistema()
  or is_admin_empresa_unidade(unidade_id)
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

-- insert (permissão 'criar')
create policy "relatorio_modelos_insert" on relatorio_modelos for insert with check (
  is_admin_sistema()
  or is_admin_empresa_unidade(unidade_id)
  or (
    unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and usuario_tem_permissao('relatorios', 'criar')
  )
);

-- update (permissão 'editar')
create policy "relatorio_modelos_update" on relatorio_modelos for update using (
  is_admin_sistema()
  or is_admin_empresa_unidade(unidade_id)
  or (
    unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and usuario_tem_permissao('relatorios', 'editar')
  )
);

-- delete (permissão 'excluir')
create policy "relatorio_modelos_delete" on relatorio_modelos for delete using (
  is_admin_sistema()
  or is_admin_empresa_unidade(unidade_id)
  or (
    unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and usuario_tem_permissao('relatorios', 'excluir')
  )
);

-- carência/pós-trial: bloqueia criação de modelo (RESTRICTIVE → AND com as de cima)
create policy "relatorio_modelos_criar_periodo" on relatorio_modelos
  as restrictive for insert
  with check (
    is_admin_sistema()
    or empresa_pode_criar((select u.empresa_id from unidades u where u.id = relatorio_modelos.unidade_id))
  );

-- relatorios_gerados: leitura por tenant (consulta). Escrita só via service role.
create policy "relatorios_gerados_leitura" on relatorios_gerados for select using (
  is_admin_sistema()
  or is_admin_empresa_unidade(unidade_id)
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

-- ── 3. Permissões (catálogo) ─────────────────────────────────
insert into permissoes (recurso, acao, descricao) values
  ('relatorios', 'criar',    'Criar modelo de relatório'),
  ('relatorios', 'editar',   'Editar modelo de relatório'),
  ('relatorios', 'excluir',  'Excluir modelo de relatório'),
  ('relatorios', 'executar', 'Gerar relatório (executar modelo)')
on conflict (recurso, acao) do nothing;

-- Concede aos perfis de SISTEMA por allowlist de ids (nunca is_system cru — não
-- vaza p/ o perfil Operação ...003). ...001 Admin de sistema, ...002 Admin da empresa.
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from perfis pf
join permissoes p on p.recurso = 'relatorios'
where pf.id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
)
on conflict do nothing;
