// Template de demo — FÁBRICA DE ALIMENTOS.
// Conteúdo plausível de indústria de alimentos: recebimento de matéria-prima,
// higienização pré-operacional, controle de temperatura de câmara fria, inspeção
// de linha de envase e boas práticas (APPCC). Gabarito de conformidade em cada
// atividade que valida, para o gerador saber o que é "conforme" vs "não".

import type { VerticalTemplate } from '../tipos'

export const fabricaAlimentos: VerticalTemplate = {
  id: 'fabrica_alimentos',
  nome: 'Fábrica de Alimentos',
  labelGrupo: 'Setor',
  labelSubgrupo: 'Área',
  unidade: 'Planta Industrial',

  estrutura: [
    { grupo: 'Recebimento', subgrupos: ['Matéria-prima', 'Insumos'] },
    { grupo: 'Produção', subgrupos: ['Envase', 'Câmara Fria'] },
    { grupo: 'Qualidade & Segurança de Alimentos', subgrupos: ['APPCC', 'Higienização'] },
  ],

  catalogos: [
    {
      nome: 'Câmaras Frias',
      campoChave: 'Código',
      atributos: ['Setor', 'Temp. alvo (°C)', 'Capacidade'],
      itens: [
        { 'Código': 'CF-01', 'Setor': 'Matéria-prima', 'Temp. alvo (°C)': '2', 'Capacidade': '20 t' },
        { 'Código': 'CF-02', 'Setor': 'Produção', 'Temp. alvo (°C)': '-18', 'Capacidade': '35 t' },
        { 'Código': 'CF-03', 'Setor': 'Produção', 'Temp. alvo (°C)': '4', 'Capacidade': '15 t' },
        { 'Código': 'CF-04', 'Setor': 'Expedição', 'Temp. alvo (°C)': '-20', 'Capacidade': '40 t' },
        { 'Código': 'CF-05', 'Setor': 'Laticínios', 'Temp. alvo (°C)': '5', 'Capacidade': '10 t' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Recebimento de Matéria-prima',
      grupo: 'Recebimento',
      subgrupo: 'Matéria-prima',
      porDiaMin: 1,
      porDiaMax: 3,
      pesos: { aprovada: 55, reprovada_sem_plano: 10, plano_aberto_n1: 15, plano_corrigido: 15, plano_nao_corrigido: 5 },
      secoes: [
        {
          nome: 'Conferência da carga',
          atividades: [
            { nome: 'Temperatura da carga na chegada (°C)', tipo: 'numero', faixa: { min: 0, max: 7, unidade: '°C' } },
            { nome: 'Embalagem íntegra (sem avarias)', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Nota fiscal confere com o pedido', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Laudo/Certificado do fornecedor apresentado', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Placa do veículo', tipo: 'texto', valores: ['PQR1D23', 'RGT5E01', 'ABC9F88', 'MNO2G45'] },
          ],
        },
      ],
    },
    {
      nome: 'Higienização Pré-operacional',
      grupo: 'Qualidade & Segurança de Alimentos',
      subgrupo: 'Higienização',
      porDiaMin: 2,
      porDiaMax: 3,
      pesos: { aprovada: 60, reprovada_sem_plano: 8, plano_aberto_n1: 12, plano_aberto_n2: 5, plano_corrigido: 12, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Sanitização',
          atividades: [
            { nome: 'Bancadas e superfícies higienizadas', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Concentração de sanitizante (ppm)', tipo: 'numero', faixa: { min: 150, max: 200, unidade: 'ppm' } },
            { nome: 'Utensílios sanitizados e guardados', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Registro de troca de água realizado', tipo: 'sim_nao', simConforme: 'sim' },
          ],
        },
      ],
    },
    {
      nome: 'Controle de Temperatura — Câmara Fria',
      grupo: 'Produção',
      subgrupo: 'Câmara Fria',
      porDiaMin: 2,
      porDiaMax: 4,
      pesos: { aprovada: 62, reprovada_sem_plano: 8, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Monitoramento',
          atividades: [
            { nome: 'Câmara monitorada', tipo: 'catalogo', catalogo: 'Câmaras Frias' },
            { nome: 'Temperatura registrada (°C)', tipo: 'numero', faixa: { min: -20, max: 5, unidade: '°C' } },
            { nome: 'Termômetro calibrado (selo válido)', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Vedação da porta em bom estado', tipo: 'sim_nao', simConforme: 'sim' },
          ],
        },
      ],
    },
    {
      nome: 'Inspeção de Linha de Envase',
      grupo: 'Produção',
      subgrupo: 'Envase',
      porDiaMin: 2,
      porDiaMax: 4,
      pesos: { aprovada: 58, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_aberto_n2: 5, plano_corrigido: 12, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Qualidade do produto',
          atividades: [
            { nome: 'Data de validade impressa e legível', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Peso da unidade (g)', tipo: 'numero', faixa: { min: 490, max: 510, unidade: 'g' } },
            { nome: 'Lacre/selo de segurança íntegro', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Presença de corpo estranho', tipo: 'sim_nao', simConforme: 'nao' },
            { nome: 'Aspecto visual do produto', tipo: 'multipla_escolha', opcoes: ['Conforme', 'Descolorido', 'Deformado'], opcoesConformes: ['Conforme'] },
          ],
        },
      ],
    },
    {
      nome: 'Boas Práticas de Fabricação (APPCC)',
      grupo: 'Qualidade & Segurança de Alimentos',
      subgrupo: 'APPCC',
      porDiaMin: 1,
      porDiaMax: 2,
      pesos: { aprovada: 65, reprovada_sem_plano: 8, plano_aberto_n1: 10, plano_corrigido: 14, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Pessoas e ambiente',
          atividades: [
            { nome: 'Uso correto de uniforme e EPI', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Higiene das mãos realizada', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Controle de pragas sem indícios', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Lixeiras tampadas e identificadas', tipo: 'sim_nao', simConforme: 'sim' },
          ],
        },
      ],
    },
  ],

  usuarios: [
    { nome: 'Bruno Tavares Ramos', cpf: '318.472.650-09', perfil: 'operacao' },
    { nome: 'Camila Nunes Ferraz', cpf: '425.981.370-12', perfil: 'nivel_1' },
    { nome: 'Diego Almeida Prado', cpf: '537.204.918-66', perfil: 'nivel_2' },
    { nome: 'Eduarda Lima Barros', cpf: '640.315.827-40', perfil: 'gestor' },
  ],

  motivosNaoConformidade: [
    'Temperatura fora da faixa',
    'Falha de higienização',
    'Embalagem danificada',
    'Ausência de registro',
    'Presença de corpo estranho',
    'Peso fora do padrão',
  ],

  causasRaiz: [
    'Equipamento descalibrado',
    'Falha no cumprimento do procedimento',
    'Falta de treinamento da equipe',
    'Insumo fora de especificação',
    'Manutenção preventiva pendente',
  ],

  tickets: [
    { titulo: 'Câmara fria CF-02 oscilando temperatura', descricao: 'Registro de temperatura acima do alvo no turno da tarde. Necessária verificação da vedação e do compressor.' },
    { titulo: 'Falta de sanitizante no estoque', descricao: 'Estoque de sanitizante abaixo do mínimo para a higienização pré-operacional. Repor com urgência.' },
    { titulo: 'Balança da linha de envase desregulada', descricao: 'Peso das unidades variando fora da faixa. Solicitar aferição da balança.' },
  ],

  tarefas: [
    { titulo: 'Higienização semanal profunda', itens: ['Desmontar e sanitizar esteira', 'Limpar drenos', 'Trocar filtros de ar', 'Registrar no controle'] },
    { titulo: 'Calibração mensal de termômetros', itens: ['Aferir termômetros das câmaras', 'Registrar desvios', 'Etiquetar com data de validade'] },
  ],
}
