-- Corrige o guard do último admin para considerar apenas admins ATIVOS.
-- Antes, o trigger contava admins inativos como "outros admins existentes",
-- permitindo demover o único admin ativo da empresa.

create or replace function validar_ultimo_admin_empresa()
returns trigger language plpgsql security definer as $$
declare
  v_admin_empresa_id constant uuid := '00000000-0000-0000-0000-000000000002';
  v_outros_admins    int;
begin
  -- Só valida quando o perfil está realmente mudando, saindo de Admin da empresa
  if old.perfil_id is distinct from v_admin_empresa_id then
    return new;
  end if;

  if new.perfil_id is not distinct from old.perfil_id then
    return new;
  end if;

  -- Conta apenas admins ATIVOS (exclui o próprio usuário sendo alterado)
  select count(*) into v_outros_admins
  from usuario_empresa ue
  join usuarios u on u.id = ue.usuario_id
  where ue.empresa_id = old.empresa_id
    and ue.perfil_id = v_admin_empresa_id
    and ue.usuario_id <> old.usuario_id
    and u.status = 'ativo';

  if v_outros_admins = 0 then
    raise exception 'Não é possível remover o perfil de Admin da empresa do último administrador.';
  end if;

  return new;
end;
$$;
