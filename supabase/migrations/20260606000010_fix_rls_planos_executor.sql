-- ============================================================
-- Fix RLS: executor da execução também pode ler os planos
-- gerados pela sua própria execução de checklist.
--
-- Problema: política anterior só liberava para membros do subgrupo.
-- O executor (operador) não está no subgrupo, então via execucoes
-- no histórico de Operação retornava zero planos.
--
-- Solução: adicionar OR para quem executou o checklist que gerou
-- o plano (via checklist_execucao_id → checklist_execucoes.executado_por).
-- ============================================================

drop policy if exists "planos_acao_leitura" on planos_acao;
create policy "planos_acao_leitura" on planos_acao for select using (
  is_admin_sistema()
  -- moderadores/gestores: veem planos do próprio subgrupo
  or subgrupo_id in (
    select subgrupo_id from usuario_subgrupo
    where usuario_id = auth.uid()
  )
  -- executor: vê planos gerados pela própria execução
  or checklist_execucao_id in (
    select id from checklist_execucoes
    where executado_por = auth.uid()
  )
);
