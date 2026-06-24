-- Script para corrigir schema da tabela 'turnos' em produção
-- Objetivo: adicionar colunas 'tipo' e 'config' se não existirem
-- Data: 2026-06-24

-- Passo 1: Verificar e adicionar coluna 'tipo' se não existir
ALTER TABLE turnos
ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'administrativo'
CHECK (tipo IN ('administrativo', 'escala'));

-- Passo 2: Verificar e adicionar coluna 'config' se não existir
ALTER TABLE turnos
ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Passo 3: Remover constraint DEFAULT de 'tipo' após adição (deixar apenas check)
ALTER TABLE turnos
ALTER COLUMN tipo DROP DEFAULT;

-- Passo 4: Validar se função 'usuario_esta_no_turno' existe; se não, criar
CREATE OR REPLACE FUNCTION usuario_esta_no_turno(p_usuario_id uuid, p_momento timestamptz default now())
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_turno turnos%rowtype;
  v_dia smallint;
  v_hora_local time;
  v_dia_cfg jsonb;
  v_inicio time;
  v_fim time;
  v_data_ref date;
  v_hora_ini time;
  v_horas_trab numeric;
  v_horas_folga numeric;
  v_inicio_ts timestamptz;
  v_ciclo_horas numeric;
  v_minutos_desde numeric;
  v_pos_no_ciclo numeric;
BEGIN
  SELECT t.* INTO v_turno
  FROM turnos t
  JOIN usuarios u ON u.turno_id = t.id
  WHERE u.id = p_usuario_id AND t.ativo;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Turno administrativo
  IF v_turno.tipo = 'administrativo' THEN
    v_dia := EXTRACT(dow FROM p_momento)::smallint;
    v_hora_local := p_momento::time;

    SELECT d INTO v_dia_cfg
    FROM jsonb_array_elements(COALESCE(v_turno.config->'dias', '[]'::jsonb)) d
    WHERE (d->>'dia')::smallint = v_dia
    LIMIT 1;

    IF v_dia_cfg IS NULL THEN
      RETURN false;
    END IF;

    v_inicio := (v_dia_cfg->>'inicio')::time;
    v_fim := (v_dia_cfg->>'fim')::time;

    IF v_inicio <= v_fim THEN
      RETURN v_hora_local >= v_inicio AND v_hora_local < v_fim;
    ELSE
      RETURN v_hora_local >= v_inicio OR v_hora_local < v_fim;
    END IF;
  END IF;

  -- Turno de escala
  IF v_turno.tipo = 'escala' THEN
    v_data_ref := (v_turno.config->>'data_referencia')::date;
    v_hora_ini := COALESCE((v_turno.config->>'hora_inicio')::time, '00:00'::time);
    v_horas_trab := COALESCE((v_turno.config->>'horas_trabalho')::numeric, 12);
    v_horas_folga := COALESCE((v_turno.config->>'horas_folga')::numeric, 36);

    IF v_data_ref IS NULL THEN
      RETURN true;
    END IF;

    v_inicio_ts := (v_data_ref::timestamp + v_hora_ini);
    v_ciclo_horas := v_horas_trab + v_horas_folga;

    IF v_ciclo_horas <= 0 THEN
      RETURN true;
    END IF;

    v_minutos_desde := EXTRACT(epoch FROM (p_momento - v_inicio_ts)) / 60.0;
    IF v_minutos_desde < 0 THEN
      RETURN false;
    END IF;

    v_pos_no_ciclo := MOD(v_minutos_desde / 60.0, v_ciclo_horas);

    RETURN v_pos_no_ciclo < v_horas_trab;
  END IF;

  RETURN true;
END;
$$;

-- Passo 5: Confirmar que RLS está ativado e policies existem
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;

-- Recriar policies se necessário
DROP POLICY IF EXISTS "turnos_leitura" ON turnos;
CREATE POLICY "turnos_leitura" ON turnos FOR SELECT USING (
  is_admin_sistema()
  OR empresa_id IN (SELECT empresa_id FROM usuario_empresa WHERE usuario_id = auth.uid())
);

DROP POLICY IF EXISTS "turnos_escrita" ON turnos;
CREATE POLICY "turnos_escrita" ON turnos FOR ALL USING (
  is_admin_sistema()
  OR empresa_id IN (SELECT empresa_id FROM usuario_empresa WHERE usuario_id = auth.uid())
) WITH CHECK (
  is_admin_sistema()
  OR empresa_id IN (SELECT empresa_id FROM usuario_empresa WHERE usuario_id = auth.uid())
);

-- Passo 6: Validação — listar esquema atual
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'turnos'
ORDER BY ordinal_position;
