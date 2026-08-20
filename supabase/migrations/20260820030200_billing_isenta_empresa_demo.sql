-- Auditoria 2026-08-20: a isenção de billing pra empresa demo só está em
-- `empresa_fase_assinatura` (adicionado em 20260730150000). As RPCs de cota
-- (`billing_pode_executar`, `billing_pode_consumir_ia`,
-- `billing_armazenamento_disponivel`) NÃO checam `empresas.demo`.
--
-- Não quebra hoje porque o plano "Demonstração" tem limites null (ilimitado,
-- curto-circuita as 3 funções). MAS se um admin trocar a demo por qualquer
-- plano com limites, essas 3 RPCs bloqueiam a demo, contradizendo a regra
-- "empresa demo é isenta de billing (nunca bloqueia)".
--
-- Fix: early-return true quando a empresa é demo. Preserva o resto da lógica
-- ORIGINAL (assinatura, perform, tipos %rowtype, cálculo de capacidade/uso).

create or replace function billing_pode_executar(p_empresa_id uuid)
returns boolean language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  v_demo boolean;
begin
  select demo into v_demo from empresas where id = p_empresa_id;
  if coalesce(v_demo, false) then return true; end if;

  perform avancar_periodo_assinatura(p_empresa_id);
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return true; end if;
  if a.limite_execucoes_mes is null then return true; end if;
  return a.execucoes_usadas < (a.limite_execucoes_mes + a.execucoes_extra);
end $$;

create or replace function billing_pode_consumir_ia(p_empresa_id uuid)
returns boolean language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  v_demo boolean;
begin
  select demo into v_demo from empresas where id = p_empresa_id;
  if coalesce(v_demo, false) then return true; end if;

  perform avancar_periodo_assinatura(p_empresa_id);
  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return true; end if;
  if a.limite_tokens_ia_mes is null then return true; end if;
  return a.tokens_ia_usados < (a.limite_tokens_ia_mes + a.tokens_ia_extra);
end $$;

create or replace function billing_armazenamento_disponivel(p_empresa_id uuid, p_bytes bigint)
returns boolean language plpgsql security definer as $$
declare
  a empresa_assinaturas%rowtype;
  v_capacidade bigint;
  v_usado bigint;
  v_demo boolean;
begin
  select demo into v_demo from empresas where id = p_empresa_id;
  if coalesce(v_demo, false) then return true; end if;

  select * into a from empresa_assinaturas where empresa_id = p_empresa_id;
  if not found then return true; end if;
  if a.limite_armazenamento_bytes is null then return true; end if;
  select a.limite_armazenamento_bytes + coalesce(sum(quantidade),0) into v_capacidade
    from empresa_pacotes_comprados where empresa_id = p_empresa_id and tipo = 'armazenamento';
  select coalesce(sum(tamanho_bytes),0) into v_usado
    from uso_armazenamento where empresa_id = p_empresa_id;
  return (v_usado + coalesce(p_bytes,0)) <= v_capacidade;
end $$;
