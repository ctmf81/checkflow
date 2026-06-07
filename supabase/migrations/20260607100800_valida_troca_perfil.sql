-- ============================================================
-- Garante no nível de banco a regra de "perfil público":
-- só o Admin da empresa (ou Admin de sistema) pode atribuir um
-- perfil NÃO público a um usuário. Perfis públicos podem ser
-- atribuídos por quem gerencia usuários do grupo (ex: cobrir
-- a liderança de alguém de férias).
--
-- Isso reforça em DB a regra que já existe na UI (UsuarioModal),
-- protegendo contra chamadas diretas à API do Supabase.
-- ============================================================

create or replace function validar_troca_perfil()
returns trigger language plpgsql security definer as $$
declare
  v_novo_publico boolean;
  v_ator_perfil  uuid;
  v_admin_empresa_id  constant uuid := '00000000-0000-0000-0000-000000000002';
  v_admin_sistema_id  constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- Só valida quando o perfil está realmente mudando
  if new.perfil_id is not distinct from old.perfil_id then
    return new;
  end if;

  -- is_admin_sistema() sempre pode
  if is_admin_sistema() then
    return new;
  end if;

  select publico into v_novo_publico from perfis where id = new.perfil_id;

  -- Perfil público: qualquer usuário com acesso à tela pode atribuir
  if coalesce(v_novo_publico, false) then
    return new;
  end if;

  -- Perfil não público: exige que quem está fazendo a troca seja
  -- Admin da empresa (ou Admin de sistema) NESTA empresa
  select perfil_id into v_ator_perfil
  from usuario_empresa
  where usuario_id = auth.uid() and empresa_id = new.empresa_id;

  if v_ator_perfil = v_admin_empresa_id or v_ator_perfil = v_admin_sistema_id then
    return new;
  end if;

  raise exception 'Apenas o administrador da empresa pode atribuir este perfil (não público).';
end;
$$;

drop trigger if exists trg_validar_troca_perfil on usuario_empresa;
create trigger trg_validar_troca_perfil
  before update on usuario_empresa
  for each row
  execute function validar_troca_perfil();
