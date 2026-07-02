-- Corrige buscar_email_por_cpf para comparar CPFs normalizados (sem máscara)
-- independente de como o CPF está armazenado (com ou sem pontos/traço).
CREATE OR REPLACE FUNCTION buscar_email_por_cpf(p_cpf text)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT email FROM usuarios
  WHERE regexp_replace(cpf, '\D', '', 'g') = regexp_replace(p_cpf, '\D', '', 'g')
  LIMIT 1;
$$;
