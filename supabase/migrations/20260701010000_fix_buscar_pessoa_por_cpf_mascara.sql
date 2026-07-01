-- Corrige buscar_pessoa_por_cpf para normalizar AMBOS os lados da comparação.
-- CPFs legados foram salvos com máscara (048.973.350-60); a versão anterior só
-- normalizava o parâmetro de entrada, causando miss quando o stored era mascarado.
create or replace function buscar_pessoa_por_cpf(p_cpf text)
returns table(id uuid, nome text, telefone text)
language sql security definer set search_path = public as $$
  select u.id, u.nome, u.telefone
  from usuarios u
  where regexp_replace(u.cpf, '\D', '', 'g') = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
    and (
      is_admin_sistema()
      or exists (
        select 1 from usuario_empresa ue
        where ue.usuario_id = auth.uid()
          and ue.perfil_id = '00000000-0000-0000-0000-000000000002'
      )
    )
  limit 1;
$$;

grant execute on function buscar_pessoa_por_cpf(text) to authenticated;
