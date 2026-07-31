// Template de demo — HOTELARIA.
// Rotinas de recepção, governança (limpeza de apartamentos), A&B (café da manhã
// e segurança alimentar da cozinha) e manutenção/lazer (piscina, área técnica).
// Cada atividade que valida traz o gabarito de conformidade.

import type { VerticalTemplate } from '../tipos'

export const hotel: VerticalTemplate = {
  id: 'hotel',
  nome: 'Hotelaria',
  labelGrupo: 'Departamento',
  labelSubgrupo: 'Área',
  unidade: 'Hotel',

  estrutura: [
    { grupo: 'Hospedagem', subgrupos: ['Recepção', 'Governança'] },
    { grupo: 'Alimentos & Bebidas', subgrupos: ['Restaurante', 'Cozinha'] },
    { grupo: 'Manutenção & Lazer', subgrupos: ['Piscina & Spa', 'Área Técnica'] },
  ],

  catalogos: [
    {
      nome: 'Unidades Habitacionais',
      campoChave: 'Quarto',
      atributos: ['Categoria', 'Andar'],
      itens: [
        { 'Quarto': '101', 'Categoria': 'Standard', 'Andar': '1' },
        { 'Quarto': '205', 'Categoria': 'Luxo', 'Andar': '2' },
        { 'Quarto': '310', 'Categoria': 'Suíte', 'Andar': '3' },
        { 'Quarto': '402', 'Categoria': 'Standard', 'Andar': '4' },
        { 'Quarto': '510', 'Categoria': 'Suíte Master', 'Andar': '5' },
      ],
    },
  ],

  checklists: [
    {
      nome: 'Abertura da Recepção',
      grupo: 'Hospedagem', subgrupo: 'Recepção',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 64, reprovada_sem_plano: 9, plano_aberto_n1: 11, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Front desk', atividades: [
        { nome: 'Sistema de reservas (PMS) online', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Caixa/fundo de troco conferido', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Chaves/cartões de acesso disponíveis', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Lobby limpo e organizado', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Ocorrências do turno', tipo: 'texto', valores: ['Sem ocorrências', 'Hóspede aguardando early check-in', 'Falta de cartões de acesso'] },
      ] }],
    },
    {
      nome: 'Limpeza de Apartamento (Governança)',
      grupo: 'Hospedagem', subgrupo: 'Governança',
      porDiaMin: 3, porDiaMax: 5,
      pesos: { aprovada: 58, reprovada_sem_plano: 10, plano_aberto_n1: 13, plano_aberto_n2: 4, plano_corrigido: 12, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Camareira', atividades: [
        { nome: 'Apartamento higienizado', tipo: 'catalogo', catalogo: 'Unidades Habitacionais' },
        { nome: 'Roupa de cama trocada', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Banheiro higienizado e reposto', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Frigobar reposto e conferido', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Enxoval e amenities completos', tipo: 'multipla_escolha', opcoes: ['Completo', 'Falta 1 item', 'Vários itens em falta'], opcoesConformes: ['Completo'] },
      ] }],
    },
    {
      nome: 'Café da Manhã (Buffet)',
      grupo: 'Alimentos & Bebidas', subgrupo: 'Restaurante',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 62, reprovada_sem_plano: 9, plano_aberto_n1: 11, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Serviço', atividades: [
        { nome: 'Temperatura do buffet quente (°C)', tipo: 'numero', faixa: { min: 60, max: 75, unidade: '°C' } },
        { nome: 'Temperatura do buffet frio (°C)', tipo: 'numero', faixa: { min: 2, max: 8, unidade: '°C' } },
        { nome: 'Reposição de itens em dia', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Mesas e salão limpos', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
    {
      nome: 'Segurança Alimentar (Cozinha)',
      grupo: 'Alimentos & Bebidas', subgrupo: 'Cozinha',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 55, reprovada_sem_plano: 10, plano_aberto_n1: 14, plano_aberto_n2: 5, plano_corrigido: 13, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Boas práticas', atividades: [
        { nome: 'Temperatura da câmara fria (°C)', tipo: 'numero', faixa: { min: 0, max: 5, unidade: '°C' } },
        { nome: 'Alimentos dentro da validade', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Manipuladores com EPI/uniforme', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Presença de pragas/vetores', tipo: 'sim_nao', simConforme: 'nao' },
        { nome: 'Higienização de bancadas e utensílios', tipo: 'multipla_escolha', opcoes: ['Conforme', 'Parcial', 'Não conforme'], opcoesConformes: ['Conforme'] },
      ] }],
    },
    {
      nome: 'Inspeção de Piscina & Spa',
      grupo: 'Manutenção & Lazer', subgrupo: 'Piscina & Spa',
      porDiaMin: 1, porDiaMax: 2,
      pesos: { aprovada: 60, reprovada_sem_plano: 10, plano_aberto_n1: 12, plano_corrigido: 15, plano_nao_corrigido: 3 },
      secoes: [{ nome: 'Tratamento e segurança', atividades: [
        { nome: 'pH da água', tipo: 'numero', faixa: { min: 72, max: 78, unidade: 'pH x10' } },
        { nome: 'Cloro livre (ppm)', tipo: 'numero', faixa: { min: 1, max: 3, unidade: 'ppm' } },
        { nome: 'Borda e deck limpos', tipo: 'sim_nao', simConforme: 'sim' },
        { nome: 'Boia salva-vidas e sinalização no local', tipo: 'sim_nao', simConforme: 'sim' },
      ] }],
    },
  ],

  usuarios: [
    { nome: 'Wagner Almeida Prado', cpf: '157.902.438-60', papel: 'operador' },
    { nome: 'Ximena Torres Bastos', cpf: '268.013.549-71', papel: 'coordenador' },
    { nome: 'Yuri Mendonça Farias', cpf: '379.124.650-82', papel: 'gestor' },
    { nome: 'Zilda Peixoto Ramires', cpf: '480.235.761-93', papel: 'admin' },
  ],

  motivosNaoConformidade: [
    'Apartamento fora do padrão de limpeza',
    'Temperatura de alimento fora do padrão',
    'Falha de reposição/enxoval',
    'Equipamento inoperante',
    'Parâmetro da piscina fora do padrão',
    'Falha de higienização',
  ],

  causasRaiz: [
    'Falta de treinamento da equipe',
    'Falha de processo/rotina',
    'Equipamento com defeito',
    'Falta de material/insumo',
    'Fornecedor não compareceu',
  ],

  tickets: [
    { titulo: 'Ar-condicionado do apto 310 sem refrigerar', descricao: 'Hóspede reclamou de ar quente na suíte 310. Acionar manutenção antes do próximo check-in.' },
    { titulo: 'Vazamento na cozinha do restaurante', descricao: 'Infiltração sob a pia da cozinha. Risco de contaminação — priorizar reparo.' },
    { titulo: 'Fechadura eletrônica do apto 205 falhando', descricao: 'Cartão de acesso não abre a porta do apto 205. Trocar fechadura/bateria.' },
  ],

  tarefas: [
    { titulo: 'Vistoria semanal de apartamentos', itens: ['Checar enxoval', 'Testar TV e ar-condicionado', 'Conferir frigobar', 'Registrar pendências'] },
    { titulo: 'Manutenção mensal da piscina', itens: ['Aspirar o fundo', 'Corrigir pH e cloro', 'Limpar filtros', 'Registrar parâmetros'] },
  ],
}
