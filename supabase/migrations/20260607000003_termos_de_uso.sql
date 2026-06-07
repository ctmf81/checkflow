-- ============================================================
-- Termo de Uso: texto único, válido para todas as empresas,
-- editável pelo admin do sistema em /sistema/termos.
-- Cada edição gera uma nova "versão" (timestamp), e usuários
-- que aceitaram uma versão anterior são questionados de novo.
-- ============================================================

create table if not exists termos_uso (
  id            uuid primary key default gen_random_uuid(),
  texto         text not null,
  versao        text not null,                 -- ex: '2026-06-07' ou '2026-06-07T14:30'
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id) on delete set null
);

-- Garante que sempre exista no máximo 1 registro "vigente" — modelagem
-- simples de singleton: mantemos histórico, mas a vigente é a mais recente.
create index if not exists idx_termos_uso_atualizado on termos_uso(atualizado_em desc);

-- Registro inicial (texto padrão) — só insere se a tabela estiver vazia
insert into termos_uso (texto, versao)
select
$$TERMO DE USO E TRATAMENTO DE DADOS — CHECKFLOW

1. Sobre este Termo
O CheckFlow é uma plataforma de gestão de checklists, processos e qualidade
contratada pela empresa à qual você está vinculado ("Empresa Contratante")
para uso por seus colaboradores, prestadores e parceiros autorizados.

Ao acessar e utilizar o sistema, você declara estar ciente e de acordo com
as condições abaixo.

2. Titularidade dos Dados
Todos os dados inseridos, gerados ou armazenados durante o uso do sistema
— incluindo respostas de checklists, evidências (fotos, vídeos, assinaturas,
documentos), localização, planos de ação e demais registros — são de
propriedade e responsabilidade da Empresa Contratante, que é a controladora
desses dados perante a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).

3. Finalidade do Tratamento
Os dados coletados têm como finalidade exclusiva a operação, supervisão,
auditoria e melhoria contínua dos processos da Empresa Contratante,
incluindo o registro de execuções, não conformidades, planos de ação,
comunicações de moderação e geração de relatórios e indicadores.

4. Uso de Geolocalização e Mídia
Determinadas atividades podem solicitar acesso à localização do dispositivo,
câmera, microfone ou galeria de mídia, exclusivamente para fins de registro
e comprovação da execução dos checklists. Esses recursos só são acionados
mediante sua autorização explícita pelo navegador/dispositivo.

5. Comunicações
O sistema pode enviar mensagens automáticas (e-mail e/ou WhatsApp) relativas
a não conformidades, planos de ação e moderações, conforme as regras de
notificação configuradas pela Empresa Contratante (incluindo, quando
aplicável, restrições de horário por turno de trabalho).

6. Responsabilidades do Usuário
Você é responsável pela veracidade das informações registradas, pela guarda
de suas credenciais de acesso e pelo uso adequado do sistema, em conformidade
com as políticas internas da Empresa Contratante.

7. Confidencialidade
As informações às quais você tiver acesso através do sistema são confidenciais
e não devem ser compartilhadas, copiadas ou divulgadas a terceiros sem
autorização expressa da Empresa Contratante.

8. Alterações deste Termo
Este termo pode ser atualizado periodicamente pelo administrador do sistema.
Caso haja alterações relevantes, uma nova confirmação de aceite será
solicitada no seu próximo acesso.

9. Aceite
Ao clicar em "Li e aceito os termos", você confirma que leu, compreendeu
e concorda integralmente com as condições acima descritas.$$,
  '2026-06-07'
where not exists (select 1 from termos_uso);

-- Registro do aceite por usuário
alter table usuarios
  add column if not exists termos_aceitos_em       timestamptz,
  add column if not exists termos_versao_aceita    text;

comment on column usuarios.termos_versao_aceita is
  'Versão do termo de uso (termos_uso.versao) aceita pelo usuário. Comparar com a versão vigente (registro mais recente de termos_uso) para exigir reaceite.';

-- ── RLS ──────────────────────────────────────────────────────
alter table termos_uso enable row level security;

drop policy if exists "termos_uso_leitura" on termos_uso;
create policy "termos_uso_leitura" on termos_uso for select using (true);

drop policy if exists "termos_uso_admin" on termos_uso;
create policy "termos_uso_admin" on termos_uso for all using (is_admin_sistema()) with check (is_admin_sistema());
