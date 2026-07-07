-- ============================================================
-- FIX: "Enviar para N2" ficava desabilitado para moderador N1 NÃO-admin,
-- mesmo havendo N2 no subgrupo.
--
-- A tela de moderação conta os nivel_2 do subgrupo no cliente
-- (usuario_subgrupo ... funcao='nivel_2'). Mas as policies de
-- usuario_subgrupo só deixam o usuário ler a PRÓPRIA linha
-- (usuario_subgrupo_propria) — então um N1 não-admin não enxerga a
-- linha do N2 e o count volta 0 → botão desabilitado (falso "sem N2").
-- (Admin não sofria: lê todas as linhas.)
--
-- Solução: função SECURITY DEFINER que devolve só um booleano
-- (existe N2 no subgrupo?), sem expor as linhas dos colegas.
-- Idempotente.
-- ============================================================

create or replace function public.subgrupo_tem_n2(p_subgrupo_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from usuario_subgrupo
    where subgrupo_id = p_subgrupo_id and funcao = 'nivel_2'
  );
$$;

grant execute on function public.subgrupo_tem_n2(uuid) to authenticated;
