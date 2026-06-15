-- ============================================================
-- Impede remover o perfil "Admin da empresa" do último admin
-- de uma empresa, deixando-a sem nenhum administrador.
-- ============================================================

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

  select count(*) into v_outros_admins
  from usuario_empresa
  where empresa_id = old.empresa_id
    and perfil_id = v_admin_empresa_id
    and usuario_id <> old.usuario_id;

  if v_outros_admins = 0 then
    raise exception 'Não é possível remover o perfil de Admin da empresa do último administrador.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_ultimo_admin_empresa on usuario_empresa;
create trigger trg_validar_ultimo_admin_empresa
  before update on usuario_empresa
  for each row
  execute function validar_ultimo_admin_empresa();
