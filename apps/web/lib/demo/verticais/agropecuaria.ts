// Template de demo — AGROPECUÁRIA (pecuária + agricultura).
import type { VerticalTemplate } from '../tipos'

export const agropecuaria: VerticalTemplate = {
  id: 'agropecuaria',
  nome: 'Agropecuária',
  labelGrupo: 'Setor',
  labelSubgrupo: 'Área',
  unidade: 'Fazenda',

  estrutura: [
    { grupo: 'Pecuária', subgrupos: ['Curral', 'Ordenha'] },
    { grupo: 'Agricultura', subgrupos: ['Lavoura', 'Irrigação'] },
    { grupo: 'Suporte', subgrupos: ['Máquinas'] },
  ],

  catalogos: [
    {
      nome: 'Talhões',
      campoChave: 'Código',
      atributos: ['Cultura', 'Área (ha)'],
      itens: [
        { 'Código': 'TL-01', 'Cultura': 'Soja', 'Área (ha)': '120' },
        { 'Código': 'TL-02', 'Cultura': 'Milho', 'Área (ha)': '95' },
        { 'Código': 'TL-03', 'Cultura': 'Pastagem', 'Área (ha)': '200' },
        { 'Código': 'TL-04', 'Cultura': 'Café', 'Área (ha)': '60' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Manejo Sanitário do Rebanho',
      grupo: 'Pecuária', subgrupo: 'Curral',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 60, reprovada_sem_plano: 9, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 4 },
      secoes: [{ nome: 'Sanidade animal', atividades: [
        { nome: 'Vacinação em dia', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Sinais clínicos anormais', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Água limpa disponível', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Escore corporal', tipo: 'multipla_escolha', opcoes: ['Adequado', 'Baixo', 'Crítico'], opcoesConformes: ['Adequado'] },
      ] }],
    },
    {
      nome: 'Ordenha Higiênica',
      grupo: 'Pecuária', subgrupo: 'Ordenha',
      porDiaMin: 2, porDiaMax: 3,
      pesos: { aprovada: 58, reprovada_sem_plano: 9, plano_aberto_n1: 12, plano_aberto_n2: 4, plano_corrigido: 14, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Qualidade do leite', atividades: [
        { nome: 'Pré-dipping realizado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Temperatura do tanque de leite (°C)', tipo: 'numero', faixa: { min: 2, max: 4, unidade: '°C' } },
        { nome: 'Equipamento de ordenha higienizado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Teste da caneca (mastite) sem alteração', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Inspeção de Lavoura',
      grupo: 'Agricultura', subgrupo: 'Lavoura',
      porDiaMin: 1, porDiaMax: 3,
      pesos: { aprovada: 57, reprovada_sem_plano: 10, plano_aberto_n1: 13, plano_corrigido: 14, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Fitossanidade', atividades: [
        { nome: 'Talhão inspecionado', tipo: 'catalogo', catalogo: 'Talhões' },
        { nome: 'Pragas acima do nível de controle', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Estande de plantas', tipo: 'multipla_escolha', opcoes: ['Adequado', 'Falho', 'Crítico'], opcoesConformes: ['Adequado'] },
        { nome: 'Plantas daninhas sob controle', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Irrigação',
      grupo: 'Agricultura', subgrupo: 'Irrigação',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 62, reprovada_sem_plano: 8, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Sistema', atividades: [
        { nome: 'Pressão do sistema (mca)', tipo: 'numero', faixa: { min: 20, max: 40, unidade: 'mca' } },
        { nome: 'Sem vazamentos na linha', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Lâmina aplicada conforme manejo', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Bomba operando normalmente', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Checklist de Máquinas Agrícolas',
      grupo: 'Suporte', subgrupo: 'Máquinas',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 63, reprovada_sem_plano: 8, plano_aberto_n1: 11, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Pré-operação', atividades: [
        { nome: 'Nível de óleo e combustível', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Pneus/rodados em bom estado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Sistema hidráulico com vazamento', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Luzes e sinalização funcionando', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
  ],

  usuarios: [
    { nome: 'Adriano Pires Fontes', cpf: '714.068.392-87', papel: 'operador' },
    { nome: 'Beatriz Moraes Campos', cpf: '825.179.403-98', papel: 'coordenador' },
    { nome: 'Cláudio Barros Teixeira', cpf: '936.280.514-08', papel: 'gestor' },
    { nome: 'Daniela Rocha Siqueira', cpf: '047.391.625-19', papel: 'admin' },
  ],

  motivosNaoConformidade: ['Manejo inadequado', 'Falha sanitária', 'Parâmetro fora do padrão', 'Equipamento com defeito', 'Praga acima do nível'],
  causasRaiz: ['Falha no manejo', 'Falta de manutenção', 'Insumo fora de especificação', 'Clima/condições adversas', 'Falta de treinamento'],
  tickets: [
    { titulo: 'Ordenhadeira com vácuo instável', descricao: 'Variação de vácuo na ordenha, risco de mastite. Solicitar manutenção do sistema.' },
    { titulo: 'Bomba de irrigação do talhão TL-01 parada', descricao: 'Sem pressão na linha; lavoura sem irrigação. Priorizar reparo.' },
  ],
  tarefas: [
    { titulo: 'Monitoramento semanal de pragas', itens: ['Percorrer talhões', 'Registrar contagem', 'Comparar com nível de controle', 'Recomendar manejo'] },
    { titulo: 'Manutenção do trator', itens: ['Trocar óleo e filtros', 'Checar hidráulico', 'Calibrar pneus', 'Registrar horímetro'] },
  ],
}
