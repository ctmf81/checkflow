-- ============================================================
-- SECURITY HARDENING — corrige políticas RLS excessivamente
-- permissivas identificadas em auditoria de segurança
-- Idempotente: DROP IF EXISTS antes de cada CREATE
-- ============================================================

-- ── 1. USUARIOS ───────────────────────────────────────────────
drop policy if exists "usuarios_leitura_publica"  on usuarios;
drop policy if exists "usuarios_leitura_scoped"   on usuarios;

create policy "usuarios_leitura_scoped" on usuarios
  for select using (
    auth.uid() = id
    or is_admin_sistema()
    or id in (
      select ue2.usuario_id
      from usuario_empresa ue1
      join usuario_empresa ue2 on ue2.empresa_id = ue1.empresa_id
      where ue1.usuario_id = auth.uid()
    )
  );

-- Função para lookup de email por CPF sem expor a tabela inteira
create or replace function public.buscar_email_por_cpf(p_cpf text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from usuarios where cpf = p_cpf limit 1;
$$;

grant execute on function public.buscar_email_por_cpf(text) to anon, authenticated;

-- ── 2. CHECKLISTS e estrutura ─────────────────────────────────
drop policy if exists "checklists_leitura"        on checklists;
drop policy if exists "versoes_leitura"            on checklist_versoes;
drop policy if exists "secoes_leitura"             on checklist_secoes;
drop policy if exists "atividades_leitura"         on checklist_atividades;
drop policy if exists "opcoes_leitura"             on checklist_atividade_opcoes;

create policy "checklists_leitura" on checklists
  for select using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

create policy "versoes_leitura" on checklist_versoes
  for select using (
    is_admin_sistema()
    or checklist_id in (
      select id from checklists
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "secoes_leitura" on checklist_secoes
  for select using (
    is_admin_sistema()
    or checklist_id in (
      select id from checklists
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "atividades_leitura" on checklist_atividades
  for select using (
    is_admin_sistema()
    or checklist_id in (
      select id from checklists
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "opcoes_leitura" on checklist_atividade_opcoes
  for select using (
    is_admin_sistema()
    or atividade_id in (
      select ca.id from checklist_atividades ca
      join checklists cl on cl.id = ca.checklist_id
      where cl.unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

-- ── 3. CHECKLIST_NAO_EXECUCAO_MOTIVOS ─────────────────────────
drop policy if exists "checklist_nao_exec_write"   on checklist_nao_execucao_motivos;
drop policy if exists "checklist_nao_exec_leitura" on checklist_nao_execucao_motivos;

create policy "checklist_nao_exec_leitura" on checklist_nao_execucao_motivos
  for select using (
    is_admin_sistema()
    or checklist_id in (
      select id from checklists
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "checklist_nao_exec_write" on checklist_nao_execucao_motivos
  for all using (
    is_admin_sistema()
    or checklist_id in (
      select id from checklists
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

-- ── 4. DOCUMENTOS ─────────────────────────────────────────────
drop policy if exists "documentos_leitura" on documentos;
drop policy if exists "etapas_leitura"     on documento_etapas;
drop policy if exists "imagens_leitura"    on etapa_imagens;

create policy "documentos_leitura" on documentos
  for select using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

create policy "etapas_leitura" on documento_etapas
  for select using (
    is_admin_sistema()
    or documento_id in (
      select id from documentos
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

create policy "imagens_leitura" on etapa_imagens
  for select using (
    is_admin_sistema()
    or etapa_id in (
      select de.id from documento_etapas de
      join documentos d on d.id = de.documento_id
      where d.unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

-- ── 5. CONFIGURAÇÕES ──────────────────────────────────────────
drop policy if exists "nao_exec_leitura"    on nao_execucao_motivos;
drop policy if exists "causa_raiz_leitura"  on causa_raiz;
drop policy if exists "catalogos_leitura"   on catalogos;
drop policy if exists "valores_leitura"     on catalogo_valores;

create policy "nao_exec_leitura" on nao_execucao_motivos
  for select using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

create policy "causa_raiz_leitura" on causa_raiz
  for select using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

create policy "catalogos_leitura" on catalogos
  for select using (
    is_admin_sistema()
    or unidade_id in (
      select unidade_id from usuario_unidade where usuario_id = auth.uid()
    )
  );

create policy "valores_leitura" on catalogo_valores
  for select using (
    is_admin_sistema()
    or catalogo_id in (
      select id from catalogos
      where unidade_id in (
        select unidade_id from usuario_unidade where usuario_id = auth.uid()
      )
    )
  );

-- ── 6. STORAGE — execucoes ────────────────────────────────────
drop policy if exists "execucoes_upload"  on storage.objects;
drop policy if exists "execucoes_delete"  on storage.objects;

create policy "execucoes_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'execucoes'
    and (
      is_admin_sistema()
      or (string_to_array(name, '/'))[1]::uuid in (
        select id from checklist_execucoes
        where unidade_id in (
          select unidade_id from usuario_unidade where usuario_id = auth.uid()
        )
      )
    )
  );

create policy "execucoes_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'execucoes'
    and (
      is_admin_sistema()
      or (string_to_array(name, '/'))[1]::uuid in (
        select id from checklist_execucoes
        where unidade_id in (
          select unidade_id from usuario_unidade where usuario_id = auth.uid()
        )
      )
    )
  );

-- ── 7. STORAGE — empresas ─────────────────────────────────────
drop policy if exists "upload_logo"   on storage.objects;
drop policy if exists "deletar_logo"  on storage.objects;

create policy "upload_logo" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'empresas'
    and is_admin_sistema()
  );

create policy "deletar_logo" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'empresas'
    and is_admin_sistema()
  );
