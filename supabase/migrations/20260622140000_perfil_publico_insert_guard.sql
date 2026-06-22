-- ============================================================
-- 1) Guard do "perfil público" também no INSERT
--
-- Antes, validar_troca_perfil() só rodava em UPDATE de usuario_empresa,
-- deixando o PRIMEIRO vínculo (INSERT) sem checagem: um usuário não-admin
-- com policy de insert poderia atribuir um perfil NÃO público.
-- Agora o trigger vale para INSERT e UPDATE.
--
-- Bypass para service-role / sem sessão (auth.uid() null): a criação de
-- usuários roda na API com service-role (confiável) — não bloqueamos ali.
-- O guard mira INSERTs diretos de usuários autenticados via PostgREST.
-- ============================================================

create or replace function validar_troca_perfil()
returns trigger language plpgsql security definer as $$
declare
  v_novo_publico boolean;
  v_ator_perfil  uuid;
  v_admin_empresa_id  constant uuid := '00000000-0000-0000-0000-000000000002';
  v_admin_sistema_id  constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- UPDATE que não muda o perfil: nada a validar
  if tg_op = 'UPDATE' and new.perfil_id is not distinct from old.perfil_id then
    return new;
  end if;

  -- Sem contexto de auth (service-role / API confiável): não bloqueia
  if auth.uid() is null then
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

  -- Perfil não público: exige Admin da empresa (ou de sistema) NESTA empresa
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
  before insert or update on usuario_empresa
  for each row
  execute function validar_troca_perfil();

-- ============================================================
-- 2) Busca de pessoa por CPF (para vincular a outra empresa)
--
-- A mesma pessoa (1 linha em usuarios, login por CPF) pode pertencer a
-- várias empresas com perfil próprio em cada (usuario_empresa). A UI de
-- "Adicionar usuário" usa isto para detectar um CPF já cadastrado e
-- oferecer o vínculo em vez de tentar recriar (CPF é único).
--
-- Exposição restrita: só admin de sistema ou admin de empresa — evita
-- enumeração de CPF→nome por usuário comum.
-- ============================================================
create or replace function buscar_pessoa_por_cpf(p_cpf text)
returns table(id uuid, nome text, telefone text)
language sql security definer set search_path = public as $$
  select u.id, u.nome, u.telefone
  from usuarios u
  where u.cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
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
