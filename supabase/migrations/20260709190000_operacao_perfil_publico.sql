-- ============================================================
-- Perfil "Operação" (sistema, ...003) passa a ser PÚBLICO
-- ============================================================
-- A coluna perfis.publico (20260607130000) nasceu com default false e foi
-- criada DEPOIS do seed do foundation, então Operação ficou publico=false.
-- Operação é o perfil dos operadores e deve poder ser atribuído diretamente
-- pela gestão de grupo/setor (sem exigir o admin da empresa) — ou seja, público.

update perfis set publico = true
where id = '00000000-0000-0000-0000-000000000003' and publico = false;
