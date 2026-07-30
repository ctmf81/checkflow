// Template de demo — GESTÃO DE CONDOMÍNIOS.
// Rotinas de zeladoria/portaria/manutenção predial: ronda de portaria, inspeção
// de piscina, limpeza de áreas comuns, vistoria de garagem e manutenção
// preventiva. Gabarito de conformidade em cada atividade que valida.

import type { VerticalTemplate } from '../tipos'

export const condominio: VerticalTemplate = {
  id: 'condominio',
  nome: 'Gestão de Condomínios',
  labelGrupo: 'Bloco',
  labelSubgrupo: 'Área',
  unidade: 'Condomínio Residencial',

  estrutura: [
    { grupo: 'Torre A', subgrupos: ['Áreas Comuns', 'Garagem'] },
    { grupo: 'Torre B', subgrupos: ['Áreas Comuns'] },
    { grupo: 'Lazer & Manutenção', subgrupos: ['Piscina', 'Portaria & Segurança'] },
  ],

  catalogos: [
    {
      nome: 'Equipamentos Prediais',
      campoChave: 'Código',
      atributos: ['Tipo', 'Local'],
      itens: [
        { 'Código': 'EQ-01', 'Tipo': 'Bomba d’água', 'Local': 'Casa de máquinas' },
        { 'Código': 'EQ-02', 'Tipo': 'Gerador', 'Local': 'Subsolo' },
        { 'Código': 'EQ-03', 'Tipo': 'Elevador', 'Local': 'Torre A' },
        { 'Código': 'EQ-04', 'Tipo': 'Portão automático', 'Local': 'Garagem' },
        { 'Código': 'EQ-05', 'Tipo': 'Pressurizador', 'Local': 'Cobertura' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Ronda de Portaria',
      grupo: 'Lazer & Manutenção',
      subgrupo: 'Portaria & Segurança',
      porDiaMin: 2,
      porDiaMax: 4,
      pesos: { aprovada: 62, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Segurança',
          atividades: [
            { nome: 'Câmeras de segurança funcionando', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Interfone testado', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Acesso de visitantes registrado', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Portão de pedestres travando corretamente', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Ocorrências do turno', tipo: 'texto', valores: ['Sem ocorrências', 'Visitante aguardando liberação', 'Entrega recebida'] },
          ],
        },
      ],
    },
    {
      nome: 'Inspeção de Piscina',
      grupo: 'Lazer & Manutenção',
      subgrupo: 'Piscina',
      porDiaMin: 1,
      porDiaMax: 2,
      pesos: { aprovada: 55, reprovada_sem_plano: 10, plano_aberto_n1: 15, plano_aberto_n2: 5, plano_corrigido: 12, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Tratamento da água',
          atividades: [
            { nome: 'pH da água', tipo: 'numero', faixa: { min: 72, max: 78, unidade: 'pH x10' } },
            { nome: 'Cloro livre (ppm)', tipo: 'numero', faixa: { min: 1, max: 3, unidade: 'ppm' } },
            { nome: 'Borda e deck limpos', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Boia salva-vidas no local', tipo: 'sim_nao', simConforme: 'sim' },
          ],
        },
      ],
    },
    {
      nome: 'Limpeza de Áreas Comuns',
      grupo: 'Torre A',
      subgrupo: 'Áreas Comuns',
      porDiaMin: 2,
      porDiaMax: 3,
      pesos: { aprovada: 66, reprovada_sem_plano: 8, plano_aberto_n1: 10, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Higiene e conservação',
          atividades: [
            { nome: 'Hall e corredores higienizados', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Elevadores limpos e operando', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Lixeiras esvaziadas', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Iluminação dos corredores', tipo: 'multipla_escolha', opcoes: ['Todas OK', 'Falha pontual', 'Várias falhas'], opcoesConformes: ['Todas OK'] },
          ],
        },
      ],
    },
    {
      nome: 'Vistoria de Garagem',
      grupo: 'Torre A',
      subgrupo: 'Garagem',
      porDiaMin: 1,
      porDiaMax: 2,
      pesos: { aprovada: 60, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Segurança e conservação',
          atividades: [
            { nome: 'Demarcação de vagas visível', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Extintores dentro da validade', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Vazamento de óleo no piso', tipo: 'sim_nao', simConforme: 'nao' },
            { nome: 'Portão da garagem operando', tipo: 'sim_nao', simConforme: 'sim' },
          ],
        },
      ],
    },
    {
      nome: 'Manutenção Predial Preventiva',
      grupo: 'Torre B',
      subgrupo: 'Áreas Comuns',
      porDiaMin: 1,
      porDiaMax: 2,
      pesos: { aprovada: 58, reprovada_sem_plano: 9, plano_aberto_n1: 12, plano_aberto_n2: 5, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [
        {
          nome: 'Equipamentos',
          atividades: [
            { nome: 'Equipamento inspecionado', tipo: 'catalogo', catalogo: 'Equipamentos Prediais' },
            { nome: 'Bombas d’água operando', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Gerador testado (partida)', tipo: 'sim_nao', simConforme: 'sim' },
            { nome: 'Nível do reservatório', tipo: 'multipla_escolha', opcoes: ['Cheio', 'Médio', 'Baixo'], opcoesConformes: ['Cheio', 'Médio'] },
            { nome: 'Luz de emergência funcionando', tipo: 'sim_nao', simConforme: 'sim' },
          ],
        },
      ],
    },
  ],

  usuarios: [
    { nome: 'Sérgio Barbosa Pinto', cpf: '712.905.436-88', perfil: 'operacao' },
    { nome: 'Tânia Rezende Moura', cpf: '824.617.093-21', perfil: 'nivel_1' },
    { nome: 'Ubirajara Costa Neves', cpf: '935.208.741-05', perfil: 'nivel_2' },
    { nome: 'Vanessa Duarte Rocha', cpf: '046.813.259-77', perfil: 'gestor' },
  ],

  motivosNaoConformidade: [
    'Equipamento inoperante',
    'Falha de limpeza',
    'Acesso não registrado',
    'Parâmetro fora do padrão',
    'Manutenção vencida',
    'Vazamento identificado',
  ],

  causasRaiz: [
    'Falta de manutenção preventiva',
    'Falha operacional da equipe',
    'Equipamento no fim da vida útil',
    'Falta de material/insumo',
    'Fornecedor não compareceu',
  ],

  tickets: [
    { titulo: 'Elevador da Torre A parado', descricao: 'Elevador social da Torre A fora de operação desde a manhã. Acionar empresa de manutenção com urgência.' },
    { titulo: 'Vazamento na garagem do subsolo', descricao: 'Infiltração próxima às vagas 20–24. Verificar impermeabilização e drenagem.' },
    { titulo: 'Câmera da portaria offline', descricao: 'Câmera do acesso principal sem imagem. Comprometendo a segurança — priorizar.' },
  ],

  tarefas: [
    { titulo: 'Limpeza semanal da piscina', itens: ['Aspirar o fundo', 'Limpar a linha d’água', 'Corrigir pH e cloro', 'Registrar parâmetros'] },
    { titulo: 'Teste mensal do gerador', itens: ['Partida em carga', 'Checar nível de combustível', 'Registrar horímetro', 'Anotar anomalias'] },
  ],
}
