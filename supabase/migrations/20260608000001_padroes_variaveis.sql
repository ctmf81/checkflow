-- ============================================================
-- PADRÕES E VARIÁVEIS
-- ============================================================
-- Regra de negócio (explicada pelo usuário em 2026-06-08):
--
-- Um "padrão" é uma atividade de validação numérica cuja resposta
-- esperada não é fixa — ela depende de uma COMBINAÇÃO de variáveis.
--
-- Exemplo: o padrão "Densidade" depende das variáveis "Tipo de
-- caminhão" (toco/truck/bitruck) e "Tipo de container" (6m/8m).
-- Cada combinação possível de valores dessas variáveis é uma
-- "instância", e cada instância tem um valor numérico esperado
-- (com margem de tolerância opcional).
--
-- Fluxo de cadastro:
--   1. Cadastra-se as VARIÁVEIS e seus valores possíveis
--      (ex: variável "Tipo de caminhão" → valores "Toco","Truck"...)
--   2. Cadastra-se o PADRÃO (nome, grupo, subgrupo, descrição) e
--      escolhe-se quais variáveis compõem esse padrão
--   3. Cadastra-se as INSTÂNCIAS: cada uma escolhe um valor para
--      cada variável do padrão + o valor numérico esperado
--
-- Fluxo de execução (atividade tipo 'padrao'):
--   1. O usuário escolhe, para cada variável do padrão, o valor
--      aplicável àquela execução (ex: Container 6m + Truck)
--   2. O sistema procura a instância cuja combinação de valores
--      bate exatamente com a escolhida
--   3. Valida o número informado pelo usuário contra o valor
--      esperado da instância (± margem)
--   4. Se não validar e houver plano de ação configurado → abre o PA
-- ============================================================

-- VARIÁVEIS (ex: "Tipo de caminhão")
create table variaveis (
  id            uuid primary key default uuid_generate_v4(),
  unidade_id    uuid references unidades(id) on delete cascade,
  nome          text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now()
);

-- VALORES POSSÍVEIS DE CADA VARIÁVEL (ex: "Toco", "Truck", "Bitruck")
create table variavel_valores (
  id           uuid primary key default uuid_generate_v4(),
  variavel_id  uuid not null references variaveis(id) on delete cascade,
  valor        text not null,
  ordem        int not null default 0,
  criado_em    timestamptz not null default now()
);

-- PADRÕES (ex: "Densidade")
create table padroes (
  id            uuid primary key default uuid_generate_v4(),
  unidade_id    uuid references unidades(id) on delete cascade,
  grupo_id      uuid references grupos(id) on delete set null,
  subgrupo_id   uuid references subgrupos(id) on delete set null,
  nome          text not null,
  descricao     text,
  unidade_medida text,           -- ex: "kg/m³", "%", opcional, só exibição
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now()
);

-- QUAIS VARIÁVEIS COMPÕEM CADA PADRÃO (ordem de exibição na execução)
create table padrao_variaveis (
  padrao_id    uuid not null references padroes(id) on delete cascade,
  variavel_id  uuid not null references variaveis(id) on delete cascade,
  ordem        int not null default 0,
  primary key (padrao_id, variavel_id)
);

-- INSTÂNCIAS: cada combinação de valores → um valor numérico esperado
create table padrao_instancias (
  id             uuid primary key default uuid_generate_v4(),
  padrao_id      uuid not null references padroes(id) on delete cascade,
  valor_esperado numeric not null,
  margem         numeric not null default 0,   -- tolerância: |resposta - esperado| <= margem → conforme
  criado_em      timestamptz not null default now()
);

-- VALORES DA COMBINAÇÃO DE CADA INSTÂNCIA
-- (ex: instância X → variavel "Tipo de caminhão" = valor "Truck",
--                     variavel "Tipo de container" = valor "6m")
create table padrao_instancia_valores (
  instancia_id uuid not null references padrao_instancias(id) on delete cascade,
  variavel_id  uuid not null references variaveis(id) on delete cascade,
  valor_id     uuid not null references variavel_valores(id) on delete cascade,
  primary key (instancia_id, variavel_id)
);

create index on variaveis(unidade_id);
create index on variavel_valores(variavel_id);
create index on padroes(unidade_id);
create index on padroes(grupo_id);
create index on padroes(subgrupo_id);
create index on padrao_variaveis(variavel_id);
create index on padrao_instancias(padrao_id);
create index on padrao_instancia_valores(variavel_id, valor_id);

-- ============================================================
-- RLS — mesmo padrão escopado por unidade usado em `catalogos`
-- (migration 20260606000014_fix_rls_catalogos): leitura liberada
-- para quem tem acesso à unidade (ou é admin de sistema); escrita
-- restrita a admin de sistema/empresa via permissão 'padrao'.
-- ============================================================
alter table variaveis                enable row level security;
alter table variavel_valores          enable row level security;
alter table padroes                   enable row level security;
alter table padrao_variaveis           enable row level security;
alter table padrao_instancias          enable row level security;
alter table padrao_instancia_valores   enable row level security;

-- Leitura: qualquer usuário com acesso à unidade do registro (ou sem unidade = geral)
create policy "variaveis_leitura" on variaveis for select using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  or (unidade_id is null and exists (select 1 from usuario_unidade where usuario_id = auth.uid()))
);
create policy "variavel_valores_leitura" on variavel_valores for select using (
  is_admin_sistema()
  or variavel_id in (
    select id from variaveis v
    where v.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
       or (v.unidade_id is null and exists (select 1 from usuario_unidade where usuario_id = auth.uid()))
  )
);
create policy "padroes_leitura" on padroes for select using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
  or (unidade_id is null and exists (select 1 from usuario_unidade where usuario_id = auth.uid()))
);
create policy "padrao_variaveis_leitura" on padrao_variaveis for select using (
  is_admin_sistema()
  or padrao_id in (
    select id from padroes p
    where p.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
       or (p.unidade_id is null and exists (select 1 from usuario_unidade where usuario_id = auth.uid()))
  )
);
create policy "padrao_instancias_leitura" on padrao_instancias for select using (
  is_admin_sistema()
  or padrao_id in (
    select id from padroes p
    where p.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
       or (p.unidade_id is null and exists (select 1 from usuario_unidade where usuario_id = auth.uid()))
  )
);
create policy "padrao_instancia_valores_leitura" on padrao_instancia_valores for select using (
  is_admin_sistema()
  or instancia_id in (
    select pi.id from padrao_instancias pi
    join padroes p on p.id = pi.padrao_id
    where p.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
       or (p.unidade_id is null and exists (select 1 from usuario_unidade where usuario_id = auth.uid()))
  )
);

-- Escrita: admin de sistema, ou quem tem a permissão 'padrao' na empresa da unidade
create policy "variaveis_escrita" on variaveis for all using (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
) with check (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
);
create policy "variavel_valores_escrita" on variavel_valores for all using (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
) with check (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
);
create policy "padroes_escrita" on padroes for all using (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
) with check (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
);
create policy "padrao_variaveis_escrita" on padrao_variaveis for all using (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
) with check (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
);
create policy "padrao_instancias_escrita" on padrao_instancias for all using (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
) with check (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
);
create policy "padrao_instancia_valores_escrita" on padrao_instancia_valores for all using (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
) with check (
  is_admin_sistema() or usuario_tem_permissao('padrao', 'editar')
);

-- ============================================================
-- Permissões 'padrao' (ver/criar/editar/excluir) — seguindo o
-- padrão de permissoes.ts (recurso 'padrao' já listado como
-- "Padrões e variáveis" no cadastro de perfil).
-- ============================================================
insert into permissoes (recurso, acao, descricao) values
  ('padrao', 'ver',      'Visualizar padrões e variáveis'),
  ('padrao', 'criar',    'Criar padrões e variáveis'),
  ('padrao', 'editar',   'Editar padrões, variáveis e instâncias'),
  ('padrao', 'excluir',  'Excluir padrões, variáveis e instâncias')
on conflict (recurso, acao) do nothing;

-- Concede ao Admin de sistema e Admin da empresa (perfis is_system = true)
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, pm.id
from perfis pf
cross join permissoes pm
where pf.is_system = true
  and pm.recurso = 'padrao'
on conflict do nothing;
