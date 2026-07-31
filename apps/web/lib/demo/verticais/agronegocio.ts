// Template de demo — AGRONEGÓCIO (recebimento, armazenagem e expedição de grãos).
import type { VerticalTemplate } from '../tipos'

export const agronegocio: VerticalTemplate = {
  id: 'agronegocio',
  nome: 'Agronegócio',
  labelGrupo: 'Unidade',
  labelSubgrupo: 'Área',
  unidade: 'Complexo Agroindustrial',

  estrutura: [
    { grupo: 'Recebimento & Classificação', subgrupos: ['Balança', 'Classificação'] },
    { grupo: 'Armazenagem', subgrupos: ['Silos', 'Secagem'] },
    { grupo: 'Expedição', subgrupos: ['Carregamento'] },
  ],

  catalogos: [
    {
      nome: 'Silos',
      campoChave: 'Código',
      atributos: ['Produto', 'Capacidade'],
      itens: [
        { 'Código': 'SL-01', 'Produto': 'Soja', 'Capacidade': '5.000 t' },
        { 'Código': 'SL-02', 'Produto': 'Milho', 'Capacidade': '8.000 t' },
        { 'Código': 'SL-03', 'Produto': 'Trigo', 'Capacidade': '3.000 t' },
        { 'Código': 'SL-04', 'Produto': 'Soja', 'Capacidade': '10.000 t' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Recebimento de Grãos',
      grupo: 'Recebimento & Classificação', subgrupo: 'Balança',
      porDiaMin: 2, porDiaMax: 4,
      pesos: { aprovada: 60, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Conferência da carga', atividades: [
        { nome: 'Umidade do grão (%)', tipo: 'numero', faixa: { min: 12, max: 16, unidade: '%' } },
        { nome: 'Impurezas (%)', tipo: 'numero', faixa: { min: 0, max: 2, unidade: '%' } },
        { nome: 'Peso conferido na balança', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Placa do veículo', tipo: 'texto', valores: ['LQR2A34', 'MST7B10', 'NCW9C21'] },
      ] }],
    },
    {
      nome: 'Classificação de Lote',
      grupo: 'Recebimento & Classificação', subgrupo: 'Classificação',
      porDiaMin: 1, porDiaMax: 3,
      pesos: { aprovada: 57, reprovada_sem_plano: 10, plano_aberto_n1: 13, plano_aberto_n2: 4, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Qualidade do grão', atividades: [
        { nome: 'Grãos avariados (%)', tipo: 'numero', faixa: { min: 0, max: 6, unidade: '%' } },
        { nome: 'Presença de pragas', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Aspecto do lote', tipo: 'multipla_escolha', opcoes: ['Bom', 'Regular', 'Ruim'], opcoesConformes: ['Bom', 'Regular'] },
        { nome: 'Amostra coletada e identificada', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Inspeção de Silo',
      grupo: 'Armazenagem', subgrupo: 'Silos',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 62, reprovada_sem_plano: 8, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Armazenagem', atividades: [
        { nome: 'Silo monitorado', tipo: 'catalogo', catalogo: 'Silos' },
        { nome: 'Temperatura da massa de grãos (°C)', tipo: 'numero', faixa: { min: 15, max: 28, unidade: '°C' } },
        { nome: 'Aeração operando', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Foco de insetos identificado', tipo: 'sim_nao', simConforme: 'nao' },
      ] }],
    },
    {
      nome: 'Secagem',
      grupo: 'Armazenagem', subgrupo: 'Secagem',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 60, reprovada_sem_plano: 9, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 4 },
      secoes: [{ nome: 'Processo de secagem', atividades: [
        { nome: 'Temperatura do secador (°C)', tipo: 'numero', faixa: { min: 60, max: 110, unidade: '°C' } },
        { nome: 'Umidade de saída (%)', tipo: 'numero', faixa: { min: 12, max: 14, unidade: '%' } },
        { nome: 'Queimador operando com segurança', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Carregamento para Expedição',
      grupo: 'Expedição', subgrupo: 'Carregamento',
      porDiaMin: 1, porDiaMax: 3,
      pesos: { aprovada: 63, reprovada_sem_plano: 8, plano_aberto_n1: 11, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Expedição', atividades: [
        { nome: 'Lona e amarração conferidas', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Lacre aplicado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Documentação (NF/romaneio) conferida', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Balança de saída conferida', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
  ],

  usuarios: [
    { nome: 'Nelson Ribeiro Costa', cpf: '936.280.514-99', papel: 'operador' },
    { nome: 'Olívia Fernandes Melo', cpf: '047.391.625-10', papel: 'coordenador' },
    { nome: 'Paulo Henrique Araújo', cpf: '158.402.736-21', papel: 'gestor' },
    { nome: 'Renata Cardoso Lima', cpf: '269.513.847-32', papel: 'admin' },
  ],

  motivosNaoConformidade: ['Umidade fora do padrão', 'Presença de pragas', 'Impureza acima do limite', 'Falha de aeração', 'Documentação incompleta'],
  causasRaiz: ['Colheita/manejo inadequado', 'Falha de equipamento', 'Falta de expurgo', 'Erro operacional', 'Manutenção pendente'],
  tickets: [
    { titulo: 'Aeração do silo SL-02 parada', descricao: 'Sistema de aeração inoperante com temperatura da massa subindo. Risco de perda — priorizar.' },
    { titulo: 'Secador oscilando temperatura', descricao: 'Temperatura do secador acima do padrão, risco de queima do grão. Verificar queimador.' },
  ],
  tarefas: [
    { titulo: 'Termometria semanal dos silos', itens: ['Ler sensores', 'Registrar temperaturas', 'Acionar aeração se necessário'] },
    { titulo: 'Expurgo preventivo mensal', itens: ['Isolar o silo', 'Aplicar fosfina conforme norma', 'Sinalizar', 'Registrar'] },
  ],
}
