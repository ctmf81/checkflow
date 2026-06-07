-- ============================================================
-- Restringe quem pode CRIAR/EDITAR/EXCLUIR agendamentos.
-- Hoje a policy "agendamentos_escrita" libera qualquer usuário
-- vinculado à unidade — passa a exigir permissão de perfil
-- (recurso 'agendamentos') além do vínculo com a unidade.
-- ============================================================

-- Novas permissões (seguindo o padrão recurso/ação já usado)
insert into permissoes (recurso, acao, descricao) values
  ('agendamentos', 'ver',     'Visualizar agendamentos'),
  ('agendamentos', 'criar',   'Criar agendamentos'),
  ('agendamentos', 'editar',  'Editar agendamentos'),
  ('agendamentos', 'deletar', 'Excluir agendamentos')
on conflict (recurso, acao) do nothing;

-- Helper: usuário tem permissão (via perfil em alguma empresa)?
create or replace function usuario_tem_permissao(p_recurso text, p_acao text)
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from usuario_empresa ue
    join perfil_permissoes pp on pp.perfil_id = ue.perfil_id
    join permissoes p on p.id = pp.permissao_id
    where ue.usuario_id = auth.uid()
      and p.recurso = p_recurso
      and p.acao = p_acao
  );
$$;

-- Concede as novas permissões aos perfis padrão "Administrador"
-- (perfis is_system = true), para não quebrar acesso existente.
insert into perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from perfis pf
join permissoes p on p.recurso = 'agendamentos'
where pf.is_system = true
on conflict do nothing;

-- ── Atualiza policies de agendamentos ────────────────────────

drop policy if exists "agendamentos_leitura" on agendamentos;
create policy "agendamentos_leitura" on agendamentos for select using (
  is_admin_sistema()
  or (
    unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and usuario_tem_permissao('agendamentos', 'ver')
  )
);

drop policy if exists "agendamentos_escrita" on agendamentos;
create policy "agendamentos_escrita" on agendamentos for all using (
  is_admin_sistema()
  or (
    unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and (
      usuario_tem_permissao('agendamentos', 'criar')
      or usuario_tem_permissao('agendamentos', 'editar')
      or usuario_tem_permissao('agendamentos', 'deletar')
    )
  )
) with check (
  is_admin_sistema()
  or (
    unidade_id in (select unidade_id from usuario_unidade where usuario_id = auth.uid())
    and (
      usuario_tem_permissao('agendamentos', 'criar')
      or usuario_tem_permissao('agendamentos', 'editar')
    )
  )
);
