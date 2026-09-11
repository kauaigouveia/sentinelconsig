/**
 * Prisma Seed Script for EVOLVE GESTÃO
 * Execute via: npx prisma db seed
 */

export const SEED_DATA = {
  promoters: [
    { name: 'DG', observation: 'DG Promotora', active: true },
    { name: 'PROSPECTA', observation: 'Prospecta Promotora', active: true },
    { name: 'EVOLVE', observation: 'Grupo Evolve', active: true },
  ],
  banks: [
    { name: 'C6 BANK', code: '336', active: true },
    { name: 'BRB', code: '070', active: true },
    { name: 'DAYCOVAL', code: '707', active: true },
    { name: 'FACTA FINANCEIRA', code: '149', active: true },
    { name: 'CREFISA', code: '069', active: true },
    { name: 'ICRED', code: '811', active: true },
  ],
  // Matriz de Promotoras Habilitadas por Banco
  bankPromoters: [
    { bankName: 'C6 BANK', promoterName: 'DG' },
    { bankName: 'C6 BANK', promoterName: 'PROSPECTA' },
    { bankName: 'BRB', promoterName: 'DG' },
    { bankName: 'BRB', promoterName: 'EVOLVE' },
    { bankName: 'DAYCOVAL', promoterName: 'DG' },
    { bankName: 'FACTA FINANCEIRA', promoterName: 'DG' },
    { bankName: 'CREFISA', promoterName: 'DG' },
    { bankName: 'ICRED', promoterName: 'DG' },
  ],
  products: [
    {
      name: 'NOVO',
      type: 'CONSIGNADO',
      description: 'Contrato novo de empréstimo consignado',
      allowsMultipleAde: true,
      requiresPortabilityRelation: false,
    },
    {
      name: 'REFIN',
      type: 'CONSIGNADO',
      description: 'Refinanciamento de contrato ativo',
      allowsMultipleAde: true,
      requiresPortabilityRelation: false,
    },
    {
      name: 'CARTÃO',
      type: 'CARTAO_RMC_RCC',
      description: 'Cartão de crédito consignado ou benefício',
      allowsMultipleAde: true,
      requiresPortabilityRelation: false,
    },
    {
      name: 'SAQUE COMPLEMENTAR',
      type: 'CARTAO_RMC_RCC',
      description: 'Saque complementar de limite',
      allowsMultipleAde: true,
      requiresPortabilityRelation: false,
    },
    {
      name: 'PORTABILIDADE',
      type: 'PORTABILIDADE',
      description: 'Portabilidade de dívida entre bancos',
      allowsMultipleAde: true,
      requiresPortabilityRelation: false,
    },
    {
      name: 'REFIN DA PORTABILIDADE',
      type: 'PORTABILIDADE',
      description: 'Refinanciamento vinculado à portabilidade principal',
      allowsMultipleAde: true,
      requiresPortabilityRelation: true,
    },
  ],
  statuses: [
    {
      name: 'AGUARDAR FORMALIZAÇÃO',
      code: 'AGUARDAR_FORMALIZACAO',
      order: 1,
      responsibleGroup: 'CLIENTE',
      slaHours: 24,
      finalStatus: false,
      color: '#64748b',
    },
    {
      name: 'AGUARDA LIBERAÇÃO CORBAN',
      code: 'AGUARDA_LIBERACAO_CORBAN',
      order: 2,
      responsibleGroup: 'NOSSA_EQUIPE',
      slaHours: 12,
      finalStatus: false,
      color: '#f59e0b',
    },
    {
      name: 'AGUARDAR RETORNO CIP',
      code: 'AGUARDAR_RETORNO_CIP',
      order: 3,
      responsibleGroup: 'BANCO',
      slaHours: 120, // 5 dias úteis (120h)
      finalStatus: false,
      color: '#3b82f6',
    },
    {
      name: 'AGUARDAR PORTABILIDADE',
      code: 'AGUARDAR_PORTABILIDADE',
      order: 4,
      responsibleGroup: 'SISTEMA',
      slaHours: 120,
      finalStatus: false,
      color: '#8b5cf6',
    },
    {
      name: 'SALDO RETORNADO',
      code: 'SALDO_RETORNADO',
      order: 5,
      responsibleGroup: 'SISTEMA',
      slaHours: 24,
      finalStatus: false,
      color: '#10b981',
    },
    {
      name: 'PENDENTE ENVIO DE DOCUMENTAÇÃO',
      code: 'PENDENTE_ENVIO_DOCUMENTACAO',
      order: 6,
      responsibleGroup: 'PARCEIRO',
      slaHours: 48,
      finalStatus: false,
      color: '#ef4444',
    },
    {
      name: 'PENDENTE ANEXO DOCUMENTAÇÃO',
      code: 'PENDENTE_ANEXO_DOCUMENTACAO',
      order: 7,
      responsibleGroup: 'NOSSA_EQUIPE',
      slaHours: 24,
      finalStatus: false,
      color: '#f97316',
    },
    {
      name: 'INTEGRADO',
      code: 'INTEGRADO',
      order: 8,
      responsibleGroup: 'SISTEMA',
      slaHours: 12,
      finalStatus: false,
      color: '#06b6d4',
    },
    {
      name: 'PAGO',
      code: 'PAGO',
      order: 9,
      responsibleGroup: 'SISTEMA',
      slaHours: 0,
      finalStatus: true,
      color: '#22c55e',
    },
    {
      name: 'CANCELADO',
      code: 'CANCELADO',
      order: 10,
      responsibleGroup: 'SISTEMA',
      slaHours: 0,
      finalStatus: true,
      color: '#94a3b8',
    },
    {
      name: 'REPROVADO',
      code: 'REPROVADO',
      order: 11,
      responsibleGroup: 'SISTEMA',
      slaHours: 0,
      finalStatus: true,
      color: '#dc2626',
    },
  ],
  partners: [
    {
      fullName: 'KAUAI AMORIM GOUVEIA',
      login: 'KAUAI@16740', // Código derivado: 16740
      promoterName: 'DG',
      active: true,
    },
    {
      fullName: 'FRANCISCO DA SILVA',
      login: 'FRANCO@16690', // Código derivado: 16690
      promoterName: 'DG',
      active: true,
    },
    {
      fullName: 'FOX AGENTE FINANCEIRO',
      login: 'FOX@16715', // Código derivado: 16715
      promoterName: 'DG',
      active: true,
    },
  ],
  holidays: [
    { date: '2026-01-01', name: 'Confraternização Universal' },
    { date: '2026-02-17', name: 'Carnaval' },
    { date: '2026-04-03', name: 'Sexta-feira Santa' },
    { date: '2026-04-21', name: 'Tiradentes' },
    { date: '2026-05-01', name: 'Dia do Trabalho' },
    { date: '2026-06-04', name: 'Corpus Christi' },
    { date: '2026-09-07', name: 'Independência do Brasil' },
    { date: '2026-10-12', name: 'Nossa Senhora Aparecida' },
    { date: '2026-11-02', name: 'Finados' },
    { date: '2026-11-15', name: 'Proclamação da República' },
    { date: '2026-11-20', name: 'Dia da Consciência Negra' },
    { date: '2026-12-25', name: 'Natal' },
  ],
  users: [
    {
      name: 'Kauai Gouveia',
      email: 'kauaigouveia@gmail.com',
      password: '120@Jocyane',
      role: 'MASTER',
      active: true,
    },
  ],
};

export async function main() {
  console.log('--- Iniciando Seed do EVOLVE GESTÃO ---');
  // Em produção com Prisma Client:
  // const prisma = new PrismaClient();
  // ...
  console.log('Seed estruturado com sucesso.');
}
