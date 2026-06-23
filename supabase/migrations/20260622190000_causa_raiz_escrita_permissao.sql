-- ============================================================
-- Causa raiz — escrita por PERMISSÃO + leitura escopada à unidade.
-- Antes a escrita era só `is_admin_sistema()` (gestor com permissão
-- `causa_raiz` não conseguia gerir) e a leitura era `using (true)`
-- (qualquer autenticado lia causas de TODAS as unidades).
-- Espelha o padrão de catálogos/documentos.
-- ============================================================

drop policy if exists "causa_raiz_admin"   on causa_raiz;
drop policy if exists "causa_raiz_leitura"  on causa_raiz;
drop policy if exists "causa_raiz_escrita"  on causa_raiz;

-- Leitura: admin de sistema ou membro da unidade (operador precisa ler o
-- banco de causas da atividade na execução).
create policy "causa_raiz_leitura" on causa_raiz for select using (
  is_admin_sistema()
  or unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
);

-- Escrita: admin de sistema, ou membro da unidade com permissão `causa_raiz`.
create policy "causa_raiz_escrita" on causa_raiz for all
  using (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (usuario_tem_permissao('causa_raiz', 'criar')
           or usuario_tem_permissao('causa_raiz', 'editar')
           or usuario_tem_permissao('causa_raiz', 'excluir'))
    )
  )
  with check (
    is_admin_sistema()
    or (
      unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
      and (usuario_tem_permissao('causa_raiz', 'criar') or usuario_tem_permissao('causa_raiz', 'editar'))
    )
  );
