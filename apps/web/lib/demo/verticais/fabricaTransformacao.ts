// Template de demo — FÁBRICA DE TRANSFORMAÇÃO (usinagem + injeção).
import type { VerticalTemplate } from '../tipos'

export const fabricaTransformacao: VerticalTemplate = {
  id: 'fabrica_transformacao',
  nome: 'Fábrica de Transformação',
  labelGrupo: 'Setor',
  labelSubgrupo: 'Linha',
  unidade: 'Planta de Transformação',

  estrutura: [
    { grupo: 'Usinagem', subgrupos: ['Torno CNC', 'Fresa'] },
    { grupo: 'Injeção', subgrupos: ['Injetora 1', 'Injetora 2'] },
    { grupo: 'Qualidade & Manutenção', subgrupos: ['Metrologia', 'Manutenção'] },
  ],

  catalogos: [
    {
      nome: 'Máquinas',
      campoChave: 'Código',
      atributos: ['Tipo', 'Setor'],
      itens: [
        { 'Código': 'MQ-01', 'Tipo': 'Torno CNC', 'Setor': 'Usinagem' },
        { 'Código': 'MQ-02', 'Tipo': 'Centro de usinagem', 'Setor': 'Usinagem' },
        { 'Código': 'MQ-03', 'Tipo': 'Injetora 250t', 'Setor': 'Injeção' },
        { 'Código': 'MQ-04', 'Tipo': 'Injetora 400t', 'Setor': 'Injeção' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Setup de Máquina',
      grupo: 'Usinagem', subgrupo: 'Torno CNC',
      porDiaMin: 1, porDiaMax: 3,
      pesos: { aprovada: 60, reprovada_sem_plano: 9, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 4 },
      secoes: [{ nome: 'Preparação', atividades: [
        { nome: 'Máquina do setup', tipo: 'catalogo', catalogo: 'Máquinas' },
        { nome: 'Programa correto carregado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Ferramenta conforme a ordem', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Zero-peça conferido', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Inspeção Dimensional',
      grupo: 'Qualidade & Manutenção', subgrupo: 'Metrologia',
      porDiaMin: 2, porDiaMax: 4,
      pesos: { aprovada: 56, reprovada_sem_plano: 10, plano_aberto_n1: 13, plano_aberto_n2: 5, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Metrologia', atividades: [
        { nome: 'Cota principal (mm)', tipo: 'numero', faixa: { min: 49, max: 51, unidade: 'mm' } },
        { nome: 'Rugosidade', tipo: 'multipla_escolha', opcoes: ['Dentro', 'Limite', 'Fora'], opcoesConformes: ['Dentro', 'Limite'] },
        { nome: 'Presença de rebarba', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Instrumento calibrado (selo válido)', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Injeção de Peças',
      grupo: 'Injeção', subgrupo: 'Injetora 1',
      porDiaMin: 2, porDiaMax: 4,
      pesos: { aprovada: 58, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 5 },
      secoes: [{ nome: 'Processo de injeção', atividades: [
        { nome: 'Temperatura do molde (°C)', tipo: 'numero', faixa: { min: 40, max: 80, unidade: '°C' } },
        { nome: 'Ciclo dentro do padrão', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Peça com rechupe/deformação', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Refugo dentro do limite', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Manutenção Preventiva',
      grupo: 'Qualidade & Manutenção', subgrupo: 'Manutenção',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 62, reprovada_sem_plano: 8, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Preventiva', atividades: [
        { nome: 'Nível de óleo adequado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Lubrificação realizada', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Ruído/vibração anormal', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Proteções de segurança no lugar', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: '5S da Linha',
      grupo: 'Injeção', subgrupo: 'Injetora 2',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 66, reprovada_sem_plano: 8, plano_aberto_n1: 10, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Organização', atividades: [
        { nome: 'Área organizada e sem excessos', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Ferramentas no lugar demarcado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Piso limpo e sinalizado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Identificação visual', tipo: 'multipla_escolha', opcoes: ['Completa', 'Parcial', 'Ausente'], opcoesConformes: ['Completa'] },
      ] }],
    },
  ],

  usuarios: [
    { nome: 'Sandro Oliveira Pinto', cpf: '370.624.958-43', papel: 'operador' },
    { nome: 'Tatiane Gomes Ferreira', cpf: '481.735.069-54', papel: 'coordenador' },
    { nome: 'Vitor Hugo Machado', cpf: '592.846.170-65', papel: 'gestor' },
    { nome: 'Wanda Correia Nunes', cpf: '603.957.281-76', papel: 'admin' },
  ],

  motivosNaoConformidade: ['Cota fora de especificação', 'Rebarba/rechupe', 'Ferramenta desgastada', 'Máquina descalibrada', 'Refugo acima do limite'],
  causasRaiz: ['Ferramenta no fim da vida útil', 'Setup incorreto', 'Falta de manutenção', 'Parâmetro de processo errado', 'Falta de treinamento'],
  tickets: [
    { titulo: 'Injetora MQ-03 com variação de peso', descricao: 'Peças saindo com peso fora do padrão. Verificar dosagem e temperatura do molde.' },
    { titulo: 'Torno CNC com folga no eixo', descricao: 'Cotas com dispersão acima do controle. Solicitar manutenção do fuso.' },
  ],
  tarefas: [
    { titulo: 'Preventiva semanal das injetoras', itens: ['Checar óleo hidráulico', 'Limpar molde', 'Verificar mangueiras', 'Registrar'] },
    { titulo: 'Calibração de instrumentos', itens: ['Enviar paquímetros ao laboratório', 'Registrar certificados', 'Etiquetar validade'] },
  ],
}
