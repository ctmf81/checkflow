// Template de demo — REDE DE LOJAS (varejo).
import type { VerticalTemplate } from '../tipos'

export const redeLojas: VerticalTemplate = {
  id: 'rede_lojas',
  nome: 'Rede de Lojas',
  labelGrupo: 'Região',
  labelSubgrupo: 'Loja',
  unidade: 'Rede Varejo',

  estrutura: [
    { grupo: 'Região Sul', subgrupos: ['Loja Centro', 'Loja Shopping'] },
    { grupo: 'Região Norte', subgrupos: ['Loja Praia'] },
    { grupo: 'Padrões & Prevenção', subgrupos: ['Prevenção de Perdas', 'Visual Merchandising'] },
  ],

  catalogos: [
    {
      nome: 'Lojas',
      campoChave: 'Código',
      atributos: ['Cidade', 'Formato'],
      itens: [
        { 'Código': 'LJ-01', 'Cidade': 'Porto Alegre', 'Formato': 'Rua' },
        { 'Código': 'LJ-02', 'Cidade': 'Porto Alegre', 'Formato': 'Shopping' },
        { 'Código': 'LJ-03', 'Cidade': 'Florianópolis', 'Formato': 'Praia' },
        { 'Código': 'LJ-04', 'Cidade': 'Curitiba', 'Formato': 'Shopping' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Abertura de Loja',
      grupo: 'Região Sul', subgrupo: 'Loja Centro',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 66, reprovada_sem_plano: 8, plano_aberto_n1: 10, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Checagem de abertura', atividades: [
        { nome: 'Iluminação e climatização ligadas', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Caixa/fundo de troco conferido', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Vitrine e frente de loja montadas', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Equipe uniformizada e presente', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Observações da abertura', tipo: 'texto', valores: ['Sem ocorrências', 'Falta 1 operador', 'Ar-condicionado com ruído'] },
      ] }],
    },
    {
      nome: 'Ronda de Prevenção de Perdas',
      grupo: 'Padrões & Prevenção', subgrupo: 'Prevenção de Perdas',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 58, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_aberto_n2: 4, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Prevenção', atividades: [
        { nome: 'Loja auditada', tipo: 'catalogo', catalogo: 'Lojas' },
        { nome: 'Câmeras de segurança operando', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Antifurto testado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Saídas de emergência desobstruídas', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Divergência aparente de estoque', tipo: 'sim_nao', simConforme: 'nao' },
      ] }],
    },
    {
      nome: 'Padrão Visual (Merchandising)',
      grupo: 'Padrões & Prevenção', subgrupo: 'Visual Merchandising',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 62, reprovada_sem_plano: 9, plano_aberto_n1: 11, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Padronização', atividades: [
        { nome: 'Precificação correta e visível', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Planograma seguido', tipo: 'multipla_escolha', opcoes: ['Conforme', 'Parcial', 'Fora do padrão'], opcoesConformes: ['Conforme'] },
        { nome: 'Limpeza e organização da área', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Iluminação de destaque funcionando', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Conferência de Estoque',
      grupo: 'Região Sul', subgrupo: 'Loja Shopping',
      porDiaMin: 1, porDiaMax: 3,
      pesos: { aprovada: 60, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Estoque', atividades: [
        { nome: 'Produtos dentro da validade', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Temperatura do refrigerado (°C)', tipo: 'numero', faixa: { min: 0, max: 8, unidade: '°C' } },
        { nome: 'Depósito organizado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'FIFO respeitado (primeiro a vencer, primeiro a sair)', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Atendimento e Fila',
      grupo: 'Região Norte', subgrupo: 'Loja Praia',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 64, reprovada_sem_plano: 9, plano_aberto_n1: 10, plano_corrigido: 14, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Experiência', atividades: [
        { nome: 'Tempo de fila', tipo: 'multipla_escolha', opcoes: ['Adequado', 'Aceitável', 'Excessivo'], opcoesConformes: ['Adequado', 'Aceitável'] },
        { nome: 'PDVs abertos suficientes', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Pesquisa de satisfação coletada', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
  ],

  usuarios: [
    { nome: 'Fábio Moreira Antunes', cpf: '158.402.736-11', papel: 'operador' },
    { nome: 'Gabriela Souza Martins', cpf: '269.513.847-22', papel: 'coordenador' },
    { nome: 'Henrique Vieira Lopes', cpf: '370.624.958-33', papel: 'gestor' },
    { nome: 'Isabela Castro Ramos', cpf: '481.735.069-44', papel: 'admin' },
  ],

  motivosNaoConformidade: ['Ruptura de estoque', 'Preço divergente', 'Falha de padrão visual', 'Divergência de inventário', 'Equipamento de segurança inoperante'],
  causasRaiz: ['Falha no processo de reposição', 'Erro de cadastro/preço', 'Falta de treinamento', 'Equipamento com defeito', 'Falta de conferência'],
  tickets: [
    { titulo: 'Antifurto da Loja Centro inoperante', descricao: 'Sistema antifurto sem sinal. Risco de perda — acionar manutenção com urgência.' },
    { titulo: 'Refrigerador da Loja Shopping fora da temperatura', descricao: 'Temperatura acima de 8°C no refrigerado. Verificar equipamento e realocar produtos.' },
  ],
  tarefas: [
    { titulo: 'Inventário rotativo semanal', itens: ['Contar corredor A', 'Contar corredor B', 'Registrar divergências', 'Ajustar sistema'] },
    { titulo: 'Troca de vitrine mensal', itens: ['Retirar peças da campanha anterior', 'Montar nova vitrine', 'Conferir precificação'] },
  ],
}
