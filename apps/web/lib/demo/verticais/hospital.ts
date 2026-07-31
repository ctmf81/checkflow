// Template de demo — HOSPITAL.
import type { VerticalTemplate } from '../tipos'

export const hospital: VerticalTemplate = {
  id: 'hospital',
  nome: 'Hospital',
  labelGrupo: 'Setor',
  labelSubgrupo: 'Unidade',
  unidade: 'Hospital',

  estrutura: [
    { grupo: 'Assistência', subgrupos: ['UTI', 'Enfermaria', 'Centro Cirúrgico'] },
    { grupo: 'Apoio', subgrupos: ['Farmácia', 'Higienização'] },
  ],

  catalogos: [
    {
      nome: 'Equipamentos Médicos',
      campoChave: 'Código',
      atributos: ['Tipo', 'Setor'],
      itens: [
        { 'Código': 'EM-01', 'Tipo': 'Monitor multiparâmetros', 'Setor': 'UTI' },
        { 'Código': 'EM-02', 'Tipo': 'Bomba de infusão', 'Setor': 'UTI' },
        { 'Código': 'EM-03', 'Tipo': 'Ventilador pulmonar', 'Setor': 'UTI' },
        { 'Código': 'EM-04', 'Tipo': 'Desfibrilador', 'Setor': 'Emergência' },
        { 'Código': 'EM-05', 'Tipo': 'Foco cirúrgico', 'Setor': 'Centro Cirúrgico' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Checklist de Leito (UTI)',
      grupo: 'Assistência', subgrupo: 'UTI',
      porDiaMin: 2, porDiaMax: 4,
      pesos: { aprovada: 58, reprovada_sem_plano: 8, plano_aberto_n1: 12, plano_aberto_n2: 5, plano_corrigido: 14, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Segurança do paciente', atividades: [
        { nome: 'Monitor multiparâmetros funcionando', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Fonte de oxigênio disponível e conferida', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Bomba de infusão calibrada', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Higienização das mãos realizada', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Segurança Cirúrgica',
      grupo: 'Assistência', subgrupo: 'Centro Cirúrgico',
      porDiaMin: 1, porDiaMax: 3,
      pesos: { aprovada: 60, reprovada_sem_plano: 8, plano_aberto_n1: 12, plano_corrigido: 14, plano_nao_corrigido: 6 },
      secoes: [{ nome: 'Checklist de cirurgia segura', atividades: [
        { nome: 'Identificação do paciente conferida', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Sítio cirúrgico demarcado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Materiais estéreis conferidos', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Contagem de compressas correta', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Controle de Medicamentos',
      grupo: 'Apoio', subgrupo: 'Farmácia',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 62, reprovada_sem_plano: 8, plano_aberto_n1: 11, plano_corrigido: 15, plano_nao_corrigido: 4 },
      secoes: [{ nome: 'Farmácia', atividades: [
        { nome: 'Temperatura da geladeira de medicamentos (°C)', tipo: 'numero', faixa: { min: 2, max: 8, unidade: '°C' } },
        { nome: 'Controle de psicotrópicos em dia', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Medicamentos dentro da validade', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Armazenamento conforme padrão', tipo: 'multipla_escolha', opcoes: ['Conforme', 'Ajuste pontual', 'Não conforme'], opcoesConformes: ['Conforme'] },
      ] }],
    },
    {
      nome: 'Higienização Hospitalar',
      grupo: 'Apoio', subgrupo: 'Higienização',
      porDiaMin: 2, porDiaMax: 3,
      pesos: { aprovada: 63, reprovada_sem_plano: 8, plano_aberto_n1: 11, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Controle de infecção', atividades: [
        { nome: 'Superfícies desinfetadas', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Descarte de resíduos', tipo: 'multipla_escolha', opcoes: ['Correto', 'Parcial', 'Incorreto'], opcoesConformes: ['Correto'] },
        { nome: 'Dispensadores de álcool abastecidos', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'EPI disponível para a equipe', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Rounds de Enfermagem',
      grupo: 'Assistência', subgrupo: 'Enfermaria',
      porDiaMin: 2, porDiaMax: 3,
      pesos: { aprovada: 61, reprovada_sem_plano: 9, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Cuidado ao paciente', atividades: [
        { nome: 'Equipamento verificado', tipo: 'catalogo', catalogo: 'Equipamentos Médicos' },
        { nome: 'Prontuário atualizado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Sinais vitais registrados', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Risco de queda avaliado', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
  ],

  usuarios: [
    { nome: 'João Pedro Ferreira', cpf: '592.846.170-55', papel: 'operador' },
    { nome: 'Karina Alves Batista', cpf: '603.957.281-66', papel: 'coordenador' },
    { nome: 'Leonardo Dias Pereira', cpf: '714.068.392-77', papel: 'gestor' },
    { nome: 'Mariana Teixeira Rocha', cpf: '825.179.403-88', papel: 'admin' },
  ],

  motivosNaoConformidade: ['Equipamento sem calibração', 'Falha de higienização', 'Registro ausente', 'Medicamento vencido', 'Desvio de protocolo'],
  causasRaiz: ['Manutenção preventiva pendente', 'Falha no cumprimento do protocolo', 'Falta de treinamento', 'Insumo em falta', 'Sobrecarga da equipe'],
  tickets: [
    { titulo: 'Bomba de infusão da UTI com alarme recorrente', descricao: 'Equipamento apresentando falha intermitente. Substituir e enviar para manutenção.' },
    { titulo: 'Geladeira de medicamentos acima de 8°C', descricao: 'Temperatura fora da faixa na Farmácia. Verificar refrigeração e integridade dos itens.' },
  ],
  tarefas: [
    { titulo: 'Conferência diária de carrinho de emergência', itens: ['Checar lacre', 'Conferir validade dos itens', 'Testar desfibrilador', 'Registrar'] },
    { titulo: 'Auditoria semanal de higienização', itens: ['Coletar swabs', 'Avaliar superfícies', 'Registrar não conformidades'] },
  ],
}
