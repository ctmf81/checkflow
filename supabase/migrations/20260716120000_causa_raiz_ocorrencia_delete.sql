-- ============================================================
-- Causa raiz do plano: 1 por plano, substituível na moderação
-- ============================================================
-- Regra de produto: um plano de ação tem NO MÁXIMO uma causa raiz. Para trocar,
-- o resolvedor remove a atual e registra outra. Até agora a remoção era só do
-- admin de sistema (registro "histórico"); agora o AUTOR da ocorrência (o N1/N2
-- que registrou) e o admin da empresa também podem removê-la.
-- Policy DELETE separada (permissiva, combina por OR com a de admin de sistema).

drop policy if exists "cr_ocorrencias_delete_propria" on causa_raiz_ocorrencias;
create policy "cr_ocorrencias_delete_propria" on causa_raiz_ocorrencias for delete
  using (
    is_admin_sistema()
    or criado_por = auth.uid()
    or is_admin_empresa_unidade(unidade_id)
  );
