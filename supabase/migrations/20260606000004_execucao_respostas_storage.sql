-- Tabela de respostas individuais por execução
create table if not exists checklist_execucao_respostas (
  id           uuid primary key default gen_random_uuid(),
  execucao_id  uuid not null references checklist_execucoes(id) on delete cascade,
  atividade_id uuid not null references checklist_atividades(id),
  resposta     jsonb,
  conforme     boolean,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_respostas_execucao   on checklist_execucao_respostas(execucao_id);
create index if not exists idx_respostas_atividade  on checklist_execucao_respostas(atividade_id);

alter table checklist_execucao_respostas enable row level security;

create policy "respostas_unidade" on checklist_execucao_respostas
  for all using (
    execucao_id in (
      select id from checklist_execucoes
      where unidade_id in (
        select unidade_id from usuario_unidade
        where usuario_id = auth.uid()
      )
    )
  );

-- Bucket para arquivos de execução (fotos e vídeos)
insert into storage.buckets (id, name, public)
values ('execucoes', 'execucoes', true)
on conflict (id) do nothing;

create policy "execucoes_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'execucoes');

create policy "execucoes_leitura" on storage.objects
  for select to public
  using (bucket_id = 'execucoes');

create policy "execucoes_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'execucoes');
