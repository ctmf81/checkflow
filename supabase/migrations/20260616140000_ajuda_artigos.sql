-- ============================================================
-- CENTRAL DE AJUDA — artigos e vídeos (curados pelo admin)
-- ============================================================
create table if not exists ajuda_artigos (
  id            uuid primary key default uuid_generate_v4(),
  categoria     text not null,
  titulo        text not null,
  conteudo      text not null default '',
  video_url     text,
  ordem         int not null default 0,
  publicado     boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_ajuda_categoria on ajuda_artigos(categoria);

-- Leitura: qualquer autenticado vê os publicados; admin vê tudo.
-- Escrita: admin_sistema.
alter table ajuda_artigos enable row level security;
drop policy if exists "ajuda_leitura" on ajuda_artigos;
create policy "ajuda_leitura" on ajuda_artigos for select using (publicado or is_admin_sistema());
drop policy if exists "ajuda_admin" on ajuda_artigos;
create policy "ajuda_admin" on ajuda_artigos for all using (is_admin_sistema()) with check (is_admin_sistema());

-- Seed (idempotente) — alguns artigos iniciais
do $$
begin
  if exists (select 1 from ajuda_artigos) then return; end if;
  insert into ajuda_artigos (categoria, titulo, conteudo, ordem) values
    ('Primeiros passos', 'Como começar no CheckFlow',
     'Siga o card "Primeiros passos" na Home da gestão: configure uma unidade, crie seu primeiro checklist (use um modelo pronto da galeria), execute-o na Operação e convide sua equipe.', 0),
    ('Checklists', 'Criar um checklist a partir de um modelo',
     'Em Gestão → Checklists, clique em "Usar um modelo", escolha o segmento, pré-visualize e clique em "Usar". O modelo é copiado como rascunho na sua unidade — ajuste o que quiser e clique em "Publicar".', 0),
    ('Operação', 'Executar um checklist',
     'No ambiente Operação, escolha o checklist e responda às atividades. Se o checklist permitir, você pode "Continuar depois". Ao concluir, o resultado é calculado e um PDF é gerado.', 0),
    ('Plano & Cobrança', 'Entendendo limites e pacotes',
     'Em Gestão → Plano você vê o uso do período (execuções, IA, armazenamento). Execuções e tokens resetam a cada mês; armazenamento é total. Ao atingir um limite, compre um pacote adicional ou faça upgrade de plano.', 0);
end $$;
