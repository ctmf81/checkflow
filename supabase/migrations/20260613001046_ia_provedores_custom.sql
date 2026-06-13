-- ============================================================
-- INTEGRAÇÕES DE IA — provedores customizados (OpenAI-compatible)
-- ============================================================
-- Permite plugar provedores OpenAI-compatible arbitrários (SiliconFlow,
-- DashScope, OpenRouter, etc.) informando base_url + modelo + chave pela UI,
-- sem precisar codar cada um. São tratados como OpenAI-compat (imagem; sem
-- PDF nativo, igual OpenAI/Groq).

alter table ia_provedores add column if not exists base_url      text;
alter table ia_provedores add column if not exists nome_exibicao text;

-- Libera os dois slots customizados no CHECK do provedor
alter table ia_provedores drop constraint if exists ia_provedores_provedor_check;
alter table ia_provedores add constraint ia_provedores_provedor_check
  check (provedor in ('gemini','anthropic','openai','groq','custom1','custom2'));

-- Semeia os dois slots (inativos, sem chave) para a UI listar
insert into ia_provedores (provedor, ordem, ativo, nome_exibicao) values
  ('custom1', 5, false, 'Provedor customizado 1'),
  ('custom2', 6, false, 'Provedor customizado 2')
on conflict (provedor) do nothing;
