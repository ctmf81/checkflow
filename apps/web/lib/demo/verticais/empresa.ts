// Template de demo — EMPRESA (genérica, por setores).
// Cenário universal para vídeos/demonstração: cada SETOR é um grupo
// (Logística, Comercial, Tecnologia, Administrativo) e cada ÁREA é um subgrupo.
import type { VerticalTemplate } from '../tipos'

export const empresa: VerticalTemplate = {
  id: 'empresa',
  nome: 'Empresa',
  labelGrupo: 'Setor',
  labelSubgrupo: 'Área',
  unidade: 'Matriz',

  estrutura: [
    { grupo: 'Logística', subgrupos: ['Expedição', 'Recebimento'] },
    { grupo: 'Comercial', subgrupos: ['Vendas', 'Atendimento'] },
    { grupo: 'Tecnologia', subgrupos: ['Infraestrutura', 'Suporte'] },
    { grupo: 'Administrativo', subgrupos: ['Financeiro', 'RH'] },
  ],

  catalogos: [
    {
      nome: 'Ativos de TI',
      campoChave: 'Patrimônio',
      atributos: ['Tipo', 'Local'],
      itens: [
        { 'Patrimônio': 'TI-001', 'Tipo': 'Servidor', 'Local': 'Data Center' },
        { 'Patrimônio': 'TI-002', 'Tipo': 'Notebook', 'Local': 'Comercial' },
        { 'Patrimônio': 'TI-003', 'Tipo': 'Switch', 'Local': 'Rack Principal' },
        { 'Patrimônio': 'TI-004', 'Tipo': 'Nobreak', 'Local': 'Data Center' },
        { 'Patrimônio': 'TI-005', 'Tipo': 'Impressora', 'Local': 'Administrativo' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Conferência de Expedição',
      grupo: 'Logística', subgrupo: 'Expedição',
      porDiaMin: 2, porDiaMax: 4,
      pesos: { aprovada: 62, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Separação e carga', atividades: [
        { nome: 'Pedido conferido contra a nota', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Volume e peso corretos', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Embalagem sem avarias', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Etiqueta de transporte aplicada', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Observações da expedição', tipo: 'texto', valores: ['Sem ocorrências', 'Aguardando coleta', 'Falta 1 volume'] },
      ] }],
    },
    {
      nome: 'Recebimento de Mercadorias',
      grupo: 'Logística', subgrupo: 'Recebimento',
      porDiaMin: 1, porDiaMax: 3,
      pesos: { aprovada: 60, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_aberto_n2: 4, plano_corrigido: 11, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Conferência', atividades: [
        { nome: 'Nota fiscal confere com o pedido', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Quantidade recebida correta', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Produto dentro da validade', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Avaria no recebimento', tipo: 'sim_nao', simConforme: 'nao' },
      ] }],
    },
    {
      nome: 'Padrão de Atendimento ao Cliente',
      grupo: 'Comercial', subgrupo: 'Atendimento',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 64, reprovada_sem_plano: 9, plano_aberto_n1: 11, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Qualidade do atendimento', atividades: [
        { nome: 'Tempo de primeira resposta (min)', tipo: 'numero', faixa: { min: 0, max: 10, unidade: 'min' } },
        { nome: 'Script de abordagem seguido', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Registro no CRM atualizado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Satisfação do cliente', tipo: 'multipla_escolha', opcoes: ['Satisfeito', 'Neutro', 'Insatisfeito'], opcoesConformes: ['Satisfeito', 'Neutro'] },
      ] }],
    },
    {
      nome: 'Inspeção de Infraestrutura de TI',
      grupo: 'Tecnologia', subgrupo: 'Infraestrutura',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 58, reprovada_sem_plano: 10, plano_aberto_n1: 13, plano_aberto_n2: 5, plano_corrigido: 11, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Data center', atividades: [
        { nome: 'Ativo inspecionado', tipo: 'catalogo', catalogo: 'Ativos de TI' },
        { nome: 'Temperatura da sala (°C)', tipo: 'numero', faixa: { min: 18, max: 24, unidade: '°C' } },
        { nome: 'Backup do dia concluído', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Nobreak operando', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Alertas de monitoramento', tipo: 'multipla_escolha', opcoes: ['Nenhum', 'Aviso', 'Crítico'], opcoesConformes: ['Nenhum'] },
      ] }],
    },
    {
      nome: 'Abertura do Escritório',
      grupo: 'Administrativo', subgrupo: 'RH',
      porDiaMin: 1, porDiaMax: 1,
      pesos: { aprovada: 68, reprovada_sem_plano: 8, plano_aberto_n1: 10, plano_corrigido: 11, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Rotina de abertura', atividades: [
        { nome: 'Recepção organizada', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Ar-condicionado e iluminação OK', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Copa abastecida', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Salas de reunião prontas', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
  ],

  usuarios: [
    { nome: 'AndréLuiz Barreto', cpf: '305.418.672-90', papel: 'operador' },
    { nome: 'Beatriz Camargo Dias', cpf: '416.529.783-01', papel: 'coordenador' },
    { nome: 'Carlos Eduardo Pinho', cpf: '527.630.894-12', papel: 'gestor' },
    { nome: 'Daniela Freitas Rocha', cpf: '638.741.905-23', papel: 'admin' },
  ],

  motivosNaoConformidade: [
    'Divergência de pedido',
    'Avaria no produto',
    'Falha de atendimento',
    'Equipamento inoperante',
    'Parâmetro fora do padrão',
    'Falha de processo',
  ],

  causasRaiz: [
    'Falta de treinamento da equipe',
    'Falha de processo/rotina',
    'Equipamento com defeito',
    'Falta de material/insumo',
    'Fornecedor não cumpriu o combinado',
  ],

  tickets: [
    { titulo: 'Servidor principal fora do ar', descricao: 'Servidor do data center sem resposta. Impacto no sistema comercial — acionar TI com urgência.' },
    { titulo: 'Divergência recorrente na expedição', descricao: 'Pedidos saindo com volume a menos nas últimas cargas. Revisar conferência da Expedição.' },
    { titulo: 'Reclamação de atendimento', descricao: 'Cliente relatou demora e falta de retorno. Verificar registro no CRM e o script de abordagem.' },
  ],

  tarefas: [
    { titulo: 'Fechamento logístico semanal', itens: ['Conferir pendências de expedição', 'Revisar avarias', 'Atualizar indicadores', 'Reportar à gestão'] },
    { titulo: 'Manutenção mensal de TI', itens: ['Testar backups', 'Checar nobreaks', 'Atualizar sistemas', 'Registrar no inventário'] },
  ],
}
