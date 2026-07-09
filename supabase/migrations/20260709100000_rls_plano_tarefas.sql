-- ============================================================
-- ENTITLEMENTS — RLS por plano (fase 2): rollout p/ TAREFAS
-- ============================================================
-- Recurso gateado: 'tarefas'. Segue a mesma filosofia de Documentos:
--   • Gate só na AUTORIA (definir/publicar listas) — tarefa_listas + filhas de
--     definição (grupos/subgrupos/itens). Aqui o gate importa.
--   • NÃO gateia OPERAÇÃO: tarefa_execucoes/tarefa_respostas (operador executando
--     lista já publicada) ficam intactas — downgrade não pode travar operação viva.
--   • NÃO gateia DELETE da lista — limpeza não deve depender do plano.
--   • Admin de SISTEMA ignora; admin da EMPRESA é limitado ao plano.
-- RLS permissiva combina por OR → gatear TODAS as write policies de autoria,
-- inclusive as *_admin_empresa (20260620120000).
-- Opt-in: empresa sem plano/sem serviços → empresa_libera_recurso = true → sem mudança.

-- ── tarefa_listas: insert / update (delete fica livre p/ limpeza) ──
drop policy if exists "tarefa_listas_insert" on tarefa_listas;
create policy "tarefa_listas_insert" on tarefa_listas for insert with check (
  is_admin_sistema()
  or (
    empresa_libera_recurso((select u.empresa_id from unidades u where u.id = tarefa_listas.unidade_id), 'tarefas')
    and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and usuario_tem_permissao('tarefas', 'criar')
  )
);

drop policy if exists "tarefa_listas_update" on tarefa_listas;
create policy "tarefa_listas_update" on tarefa_listas for update using (
  is_admin_sistema()
  or (
    empresa_libera_recurso((select u.empresa_id from unidades u where u.id = tarefa_listas.unidade_id), 'tarefas')
    and unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and usuario_tem_permissao('tarefas', 'editar')
  )
);

-- ── filhas de definição (grupos/subgrupos/itens): escrita via lista ──
-- Recria as policies "<t>_escrita" (for all) do do-block de 20260618120000
-- acrescentando o gate; a "<t>_leitura" fica intacta.
do $$
declare t text;
begin
  foreach t in array array['tarefa_lista_grupos','tarefa_lista_subgrupos','tarefa_itens'] loop
    execute format($f$
      drop policy if exists "%1$s_escrita" on %1$s;
      create policy "%1$s_escrita" on %1$s for all using (
        is_admin_sistema()
        or lista_id in (
          select l.id from tarefa_listas l
          where l.unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
            and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = l.unidade_id), 'tarefas')
        )
      );
    $f$, t);
  end loop;
end $$;

-- ── admin_empresa de autoria (20260620120000) — gatear tb ──
drop policy if exists "tarefa_listas_admin_empresa" on tarefa_listas;
create policy "tarefa_listas_admin_empresa" on tarefa_listas for all
  using (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = tarefa_listas.unidade_id), 'tarefas')
  )
  with check (
    is_admin_empresa_unidade(unidade_id)
    and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = tarefa_listas.unidade_id), 'tarefas')
  );

do $$
declare t text;
begin
  foreach t in array array['tarefa_lista_grupos','tarefa_lista_subgrupos','tarefa_itens'] loop
    execute format($f$
      drop policy if exists "%1$s_admin_empresa" on %1$s;
      create policy "%1$s_admin_empresa" on %1$s for all
        using (lista_id in (
          select l.id from tarefa_listas l
          where is_admin_empresa_unidade(l.unidade_id)
            and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = l.unidade_id), 'tarefas')))
        with check (lista_id in (
          select l.id from tarefa_listas l
          where is_admin_empresa_unidade(l.unidade_id)
            and empresa_libera_recurso((select u.empresa_id from unidades u where u.id = l.unidade_id), 'tarefas')));
    $f$, t);
  end loop;
end $$;

-- NÃO alteradas de propósito (operação/limpeza):
--   tarefa_listas_delete, tarefa_exec_*, tarefa_resp_*,
--   tarefa_execucoes_admin_empresa, tarefa_respostas_admin_empresa.
