import {
  User,
  Promoter,
  Bank,
  BankPromoter,
  Partner,
  Product,
  Client,
  ProposalStatus,
  Proposal,
  ProposalRelation,
  ProposalStatusHistory,
  Comment,
  Pending,
  Holiday,
  Notification,
  AuditLog,
  ExportLog,
  SystemConfig,
  WhiteLabelConfig,
  Alcada,
  SystemExceptionLog,
  SimulationRequest,
  SimulationStatus,
} from '../types';
import { normalizeCpf, formatCpf, extractPartnerCode, calculateBusinessDays, isBusinessDay } from '../lib/utils';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';

function cleanObjectForFirestore<T>(obj: T): T {
  if (obj === undefined) return null as any;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanObjectForFirestore) as any;
  const cleaned: any = {};
  for (const key of Object.keys(obj as any)) {
    const val = (obj as any)[key];
    if (val !== undefined) {
      cleaned[key] = cleanObjectForFirestore(val);
    }
  }
  return cleaned;
}

const STORAGE_KEYS = {
  USERS: 'cg_users',
  ACTIVE_USER: 'cg_active_user',
  PROMOTERS: 'cg_promoters',
  BANKS: 'cg_banks',
  BANK_PROMOTERS: 'cg_bank_promoters',
  PARTNERS: 'cg_partners',
  PRODUCTS: 'cg_products',
  CLIENTS: 'cg_clients',
  STATUSES: 'cg_statuses',
  PROPOSALS: 'cg_proposals',
  PROPOSAL_RELATIONS: 'cg_proposal_relations',
  HISTORY: 'cg_history',
  COMMENTS: 'cg_comments',
  PENDINGS: 'cg_pendings',
  HOLIDAYS: 'cg_holidays',
  NOTIFICATIONS: 'cg_notifications',
  AUDIT_LOGS: 'cg_audit_logs',
  EXPORT_LOGS: 'cg_export_logs',
  EXCEPTIONS: 'cg_system_exceptions',
  SIMULATION_REQUESTS: 'cg_simulation_requests',
  CONFIG: 'cg_config',
};

const INITIAL_EXCEPTIONS: SystemExceptionLog[] = [
  {
    id: 'exc-sample-1',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    severity: 'WARNING',
    operation: 'IMPORT_EXCEL',
    title: 'Interpretação de modelo legado aplicada',
    message: 'Coluna de Banco/Promotora "C6 - DG" foi desmembrada com sucesso em Banco: C6 Bank e Promotora: DG.',
    details: 'Linha 4 do arquivo LOTE_DIGITACAO_PORTABILIDADES.xlsx processada com mapeamento automático de regras legadas.',
    contextData: {
      fileName: 'LOTE_DIGITACAO_PORTABILIDADES.xlsx',
      rowNumber: 4,
      originalBankString: 'C6 - DG',
      detectedBank: 'C6 Bank',
      detectedPromoter: 'DG',
    },
    userName: 'Ana Beatriz (Digitadora)',
    userRole: 'DIGITADOR',
    resolved: true,
    resolvedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    resolvedBy: 'Lucas Ferreira (Suporte)',
  },
  {
    id: 'exc-sample-2',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    severity: 'ERROR',
    operation: 'IMPORT_EXCEL',
    title: 'Falha de validação de CPF e Login de Parceiro',
    message: 'A linha 12 continha CPF com dígitos insuficientes e o login informado "DESCONHECIDO@9999" não existe no cadastro mestre.',
    details: 'CPF informado: "123.456.78" (8 dígitos). O sistema rejeitou a linha para manter a integridade cadastral.',
    contextData: {
      fileName: 'IMPORT_PORTABILIDADE_REFIM_MARCO.xlsx',
      rowNumber: 12,
      rawCpf: '123.456.78',
      rawPartner: 'DESCONHECIDO@9999',
      rejectionReason: 'CPF_INVALID_AND_PARTNER_NOT_FOUND',
    },
    userName: 'Carlos Mendes (Gestor)',
    userRole: 'GESTOR',
    resolved: false,
  },
];

// Initial system users
const INITIAL_USERS: User[] = [
  {
    id: 'u-master',
    name: 'Kauai Gouveia',
    email: 'kauaigouveia@gmail.com',
    role: 'MASTER',
    active: true,
    password: '120@Jocyane',
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'u-gestor',
    name: 'Carlos Mendes',
    email: 'gestor@creditgestao.com.br',
    role: 'GESTOR',
    active: true,
    password: '120@Jocyane',
    createdAt: '2026-01-02T08:00:00.000Z',
    updatedAt: '2026-01-02T08:00:00.000Z',
  },
  {
    id: 'u-gerente',
    name: 'Juliana Rocha',
    email: 'gerente@creditgestao.com.br',
    role: 'GERENTE',
    active: true,
    password: '120@Jocyane',
    createdAt: '2026-01-03T08:00:00.000Z',
    updatedAt: '2026-01-03T08:00:00.000Z',
  },
  {
    id: 'u-suporte',
    name: 'Lucas Ferreira',
    email: 'suporte@creditgestao.com.br',
    role: 'SUPORTE',
    active: true,
    password: '120@Jocyane',
    createdAt: '2026-01-04T08:00:00.000Z',
    updatedAt: '2026-01-04T08:00:00.000Z',
  },
  {
    id: 'u-digitador',
    name: 'Ana Beatriz',
    email: 'digitador@creditgestao.com.br',
    role: 'DIGITADOR',
    active: true,
    password: '120@Jocyane',
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
  },
  {
    id: 'u-simulacao',
    name: 'Canal de Simulação',
    email: 'simulacao@creditgestao.com.br',
    role: 'SIMULACAO',
    active: true,
    password: '120@Jocyane',
    createdAt: '2026-01-06T08:00:00.000Z',
    updatedAt: '2026-01-06T08:00:00.000Z',
  },
];

// Initial Promoters
const INITIAL_PROMOTERS: Promoter[] = [
  { id: 'prom-dg', name: 'DG', active: true, observation: 'Promotora DG Oficial', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prom-prospecta', name: 'PROSPECTA', active: true, observation: 'Prospecta Promotora', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prom-master', name: 'CREDITPRO', active: true, observation: 'CreditPro Promotora Master', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// Initial Banks
const INITIAL_BANKS: Bank[] = [
  { id: 'bank-c6', name: 'C6 BANK', code: '336', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bank-brb', name: 'BRB', code: '070', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bank-daycoval', name: 'DAYCOVAL', code: '707', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bank-facta', name: 'FACTA FINANCEIRA', code: '149', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bank-crefisa', name: 'CREFISA', code: '069', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bank-icred', name: 'ICRED', code: '811', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// BankPromoter Associations (Matrix)
const INITIAL_BANK_PROMOTERS: BankPromoter[] = [
  { id: 'bp-c6-dg', bankId: 'bank-c6', promoterId: 'prom-dg', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp-c6-prospecta', bankId: 'bank-c6', promoterId: 'prom-prospecta', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp-brb-dg', bankId: 'bank-brb', promoterId: 'prom-dg', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp-brb-evolve', bankId: 'bank-brb', promoterId: 'prom-evolve', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp-daycoval-dg', bankId: 'bank-daycoval', promoterId: 'prom-dg', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp-facta-dg', bankId: 'bank-facta', promoterId: 'prom-dg', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp-crefisa-dg', bankId: 'bank-crefisa', promoterId: 'prom-dg', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'bp-icred-dg', bankId: 'bank-icred', promoterId: 'prom-dg', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// Initial Partners (Only: fullName, login, promoterId)
const INITIAL_PARTNERS: Partner[] = [
  {
    id: 'part-kauai',
    fullName: 'KAUAI AMORIM GOUVEIA',
    login: 'KAUAI@16740', // extracted code: 16740
    promoterId: 'prom-dg',
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'part-franco',
    fullName: 'FRANCISCO DA SILVA',
    login: 'FRANCO@16690', // extracted code: 16690
    promoterId: 'prom-dg',
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'part-fox',
    fullName: 'FOX AGENTE FINANCEIRO',
    login: 'FOX@16715', // extracted code: 16715
    promoterId: 'prom-dg',
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

// Initial Products
const INITIAL_PRODUCTS: Product[] = [
  { id: 'prod-novo', name: 'NOVO', description: 'Contrato novo consignado', type: 'CONSIGNADO', allowsMultipleAde: true, requiresPortabilityRelation: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-refin', name: 'REFIN', description: 'Refinanciamento de contrato ativo', type: 'CONSIGNADO', allowsMultipleAde: true, requiresPortabilityRelation: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-cartao', name: 'CARTÃO', description: 'Cartão de crédito consignado RMC/RCC', type: 'CARTAO', allowsMultipleAde: true, requiresPortabilityRelation: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-saque', name: 'SAQUE COMPLEMENTAR', description: 'Saque complementar de limite', type: 'CARTAO', allowsMultipleAde: true, requiresPortabilityRelation: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-port', name: 'PORTABILIDADE', description: 'Portabilidade de contrato', type: 'PORTABILIDADE', allowsMultipleAde: true, requiresPortabilityRelation: false, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-refin-port', name: 'REFIN DA PORTABILIDADE', description: 'Refinanciamento atrelado a portabilidade', type: 'PORTABILIDADE', allowsMultipleAde: true, requiresPortabilityRelation: true, active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// Initial Statuses
const INITIAL_STATUSES: ProposalStatus[] = [
  { id: 'st-1', name: 'AGUARDAR FORMALIZAÇÃO', code: 'AGUARDAR_FORMALIZACAO', order: 1, responsibleGroup: 'CLIENTE', responsible: 'CLIENTE', active: true, slaHours: 24, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#64748b' },
  { id: 'st-2', name: 'AGUARDA LIBERAÇÃO CORBAN', code: 'AGUARDA_LIBERACAO_CORBAN', order: 2, responsibleGroup: 'NOSSA EQUIPE', responsible: 'NOSSA EQUIPE', active: true, slaHours: 12, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#eab308' },
  { id: 'st-3', name: 'AGUARDAR RETORNO CIP', code: 'AGUARDAR_RETORNO_CIP', order: 3, responsibleGroup: 'BANCO', responsible: 'BANCO', active: true, slaHours: 120, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#3b82f6' },
  { id: 'st-4', name: 'AGUARDAR PORTABILIDADE', code: 'AGUARDAR_PORTABILIDADE', order: 4, responsibleGroup: 'SISTEMA', responsible: 'SISTEMA', active: true, slaHours: 120, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#8b5cf6' },
  { id: 'st-5', name: 'SALDO RETORNADO', code: 'SALDO_RETORNADO', order: 5, responsibleGroup: 'SISTEMA', responsible: 'SISTEMA', active: true, slaHours: 24, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#10b981' },
  { id: 'st-6', name: 'PENDENTE ENVIO DE DOCUMENTAÇÃO', code: 'PENDENTE_ENVIO_DOCUMENTACAO', order: 6, responsibleGroup: 'PARCEIRO', responsible: 'PARCEIRO', active: true, slaHours: 48, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#ef4444' },
  { id: 'st-7', name: 'PENDENTE ANEXO DOCUMENTAÇÃO', code: 'PENDENTE_ANEXO_DOCUMENTACAO', order: 7, responsibleGroup: 'NOSSA EQUIPE', responsible: 'NOSSA EQUIPE', active: true, slaHours: 24, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#f97316' },
  { id: 'st-8', name: 'INTEGRADO', code: 'INTEGRADO', order: 8, responsibleGroup: 'SISTEMA', responsible: 'SISTEMA', active: true, slaHours: 12, finalStatus: false, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#06b6d4' },
  { id: 'st-9', name: 'PAGO', code: 'PAGO', order: 9, responsibleGroup: 'SISTEMA', responsible: 'SISTEMA', active: true, slaHours: 0, finalStatus: true, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#22c55e' },
  { id: 'st-10', name: 'CANCELADO', code: 'CANCELADO', order: 10, responsibleGroup: 'SISTEMA', responsible: 'SISTEMA', active: true, slaHours: 0, finalStatus: true, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#94a3b8' },
  { id: 'st-11', name: 'REPROVADO', code: 'REPROVADO', order: 11, responsibleGroup: 'SISTEMA', responsible: 'SISTEMA', active: true, slaHours: 0, finalStatus: true, manualChangeAllowed: true, automaticChangeAllowed: true, color: '#dc2626' },
];

// Initial Holidays (2026 Brazilian holidays)
const INITIAL_HOLIDAYS: Holiday[] = [
  { id: 'h-1', date: '2026-01-01', name: 'Confraternização Universal', active: true },
  { id: 'h-2', date: '2026-02-17', name: 'Carnaval', active: true },
  { id: 'h-3', date: '2026-04-03', name: 'Sexta-feira Santa', active: true },
  { id: 'h-4', date: '2026-04-21', name: 'Tiradentes', active: true },
  { id: 'h-5', date: '2026-05-01', name: 'Dia do Trabalho', active: true },
  { id: 'h-6', date: '2026-06-04', name: 'Corpus Christi', active: true },
  { id: 'h-7', date: '2026-09-07', name: 'Independência do Brasil', active: true },
  { id: 'h-8', date: '2026-10-12', name: 'Nossa Senhora Aparecida', active: true },
  { id: 'h-9', date: '2026-11-02', name: 'Finados', active: true },
  { id: 'h-10', date: '2026-11-15', name: 'Proclamação da República', active: true },
  { id: 'h-11', date: '2026-11-20', name: 'Dia da Consciência Negra', active: true },
  { id: 'h-12', date: '2026-12-25', name: 'Natal', active: true },
];

// Initial Client: MARIA JOSE ALEXANDRE
const INITIAL_CLIENTS: Client[] = [
  {
    id: 'cli-maria-jose',
    cpf: '01138777498', // Clean 11 digits
    fullName: 'MARIA JOSE ALEXANDRE',
    phone: '(11) 98765-4321',
    email: 'mariajose.alexandre@email.com',
    observation: 'Cliente com múltiplas propostas simultâneas',
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'cli-joao-pedro',
    cpf: '54289312004',
    fullName: 'JOÃO PEDRO DE ALMEIDA',
    phone: '(21) 99812-3344',
    email: 'joao.pedro@email.com',
    observation: 'Servidor público federal',
    createdAt: '2026-09-02T14:30:00Z',
    updatedAt: '2026-09-02T14:30:00Z',
  },
  {
    id: 'cli-antonia-souza',
    cpf: '38190244018',
    fullName: 'ANTONIA SOUZA SANTOS',
    phone: '(31) 97123-8899',
    email: 'antonia.souza@email.com',
    observation: 'Aposentada INSS',
    createdAt: '2026-09-03T09:15:00Z',
    updatedAt: '2026-09-03T09:15:00Z',
  },
];

// Date helpers for realistic initial proposals
const now = new Date();
const fourBusinessDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

// Initial Proposals matching prompt sections 21 & 25
const INITIAL_PROPOSALS: Proposal[] = [
  {
    id: 'prop-833085808',
    proposalNumber: '833085808',
    clientId: 'cli-maria-jose',
    productId: 'prod-port',
    bankId: 'bank-c6',
    promoterId: 'prom-dg',
    partnerId: 'part-kauai',
    digitizerId: 'u-digitador',
    statusId: 'st-3', // AGUARDAR RETORNO CIP (alçada BANCO)
    currentResponsible: 'BANCO',
    portabilitySlaStartedAt: fourBusinessDaysAgo,
    notes: 'Portabilidade C6 Bank - DG via parceiro KAUAI@16740',
    createdAt: fourBusinessDaysAgo,
    updatedAt: fourBusinessDaysAgo,
  },
  {
    id: 'prop-833085811',
    proposalNumber: '833085811',
    clientId: 'cli-maria-jose',
    productId: 'prod-refin-port',
    bankId: 'bank-c6',
    promoterId: 'prom-dg',
    partnerId: 'part-kauai',
    digitizerId: 'u-digitador',
    statusId: 'st-4', // AGUARDAR PORTABILIDADE (relacionada com 833085808!)
    currentResponsible: 'SISTEMA',
    notes: 'Refin da Portabilidade vinculado à ADE 833085808',
    createdAt: fourBusinessDaysAgo,
    updatedAt: fourBusinessDaysAgo,
  },
  {
    id: 'prop-1db778ec',
    proposalNumber: '1db778ec-e383-496c-b074-d1b79d9b98b6',
    clientId: 'cli-maria-jose',
    productId: 'prod-port',
    bankId: 'bank-icred',
    promoterId: 'prom-dg',
    partnerId: 'part-kauai',
    digitizerId: 'u-digitador',
    statusId: 'st-1', // AGUARDAR FORMALIZAÇÃO
    currentResponsible: 'CLIENTE',
    notes: 'Portabilidade ICRED - DG',
    createdAt: twoDaysAgo,
    updatedAt: twoDaysAgo,
  },
  {
    id: 'prop-835c3392',
    proposalNumber: '835c3392-a1b2-48f4-a991-c91837db11e0',
    clientId: 'cli-maria-jose',
    productId: 'prod-refin-port',
    bankId: 'bank-icred',
    promoterId: 'prom-dg',
    partnerId: 'part-kauai',
    digitizerId: 'u-digitador',
    statusId: 'st-1', // AGUARDAR FORMALIZAÇÃO
    currentResponsible: 'CLIENTE',
    notes: 'Refin vinculado a 1db778ec...',
    createdAt: twoDaysAgo,
    updatedAt: twoDaysAgo,
  },
  {
    id: 'prop-1902975450',
    proposalNumber: '1902975450',
    clientId: 'cli-joao-pedro',
    productId: 'prod-novo',
    bankId: 'bank-brb',
    promoterId: 'prom-dg',
    partnerId: 'part-franco',
    digitizerId: 'u-digitador',
    statusId: 'st-7', // PENDENTE ANEXO DOCUMENTAÇÃO
    currentResponsible: 'NOSSA EQUIPE',
    notes: 'Aguardando comprovante de residência atualizado',
    createdAt: twoDaysAgo,
    updatedAt: oneDayAgo,
  },
  {
    id: 'prop-991823741',
    proposalNumber: '991823741',
    clientId: 'cli-antonia-souza',
    productId: 'prod-cartao',
    bankId: 'bank-daycoval',
    promoterId: 'prom-dg',
    partnerId: 'part-fox',
    digitizerId: 'u-digitador',
    statusId: 'st-9', // PAGO
    currentResponsible: 'SISTEMA',
    paidAt: oneDayAgo,
    notes: 'Cartão consignado emitido e pago',
    createdAt: fourBusinessDaysAgo,
    updatedAt: oneDayAgo,
  },
];

// Initial Proposal Relations (Portabilidade -> Refin)
const INITIAL_PROPOSAL_RELATIONS: ProposalRelation[] = [
  {
    id: 'rel-1',
    portabilityProposalId: 'prop-833085808',
    refinProposalId: 'prop-833085811',
    createdAt: fourBusinessDaysAgo,
  },
  {
    id: 'rel-2',
    portabilityProposalId: 'prop-1db778ec',
    refinProposalId: 'prop-835c3392',
    createdAt: twoDaysAgo,
  },
];

// Initial History
const INITIAL_HISTORY: ProposalStatusHistory[] = [
  {
    id: 'hist-1',
    proposalId: 'prop-833085808',
    userId: 'u-digitador',
    userName: 'Ana Beatriz (Digitadora)',
    newStatusId: 'st-1',
    newStatusName: 'AGUARDAR FORMALIZAÇÃO',
    action: 'Criação da proposta',
    origin: 'MANUAL',
    createdAt: fourBusinessDaysAgo,
  },
  {
    id: 'hist-2',
    proposalId: 'prop-833085808',
    userId: 'u-suporte',
    userName: 'Lucas Ferreira (Suporte)',
    previousStatusId: 'st-1',
    previousStatusName: 'AGUARDAR FORMALIZAÇÃO',
    newStatusId: 'st-3',
    newStatusName: 'AGUARDAR RETORNO CIP',
    action: 'Envio para CIP confirmado pelo banco',
    observation: 'CIP iniciado com sucesso',
    origin: 'MANUAL',
    createdAt: fourBusinessDaysAgo,
  },
  {
    id: 'hist-3',
    proposalId: 'prop-833085811',
    userId: 'u-digitador',
    userName: 'Ana Beatriz (Digitadora)',
    newStatusId: 'st-1',
    newStatusName: 'AGUARDAR FORMALIZAÇÃO',
    action: 'Criação do refin vinculado',
    origin: 'MANUAL',
    createdAt: fourBusinessDaysAgo,
  },
  {
    id: 'hist-4',
    proposalId: 'prop-833085811',
    userName: 'Sistema Automatizado',
    previousStatusId: 'st-1',
    previousStatusName: 'AGUARDAR FORMALIZAÇÃO',
    newStatusId: 'st-4',
    newStatusName: 'AGUARDAR PORTABILIDADE',
    action: 'Automação: Portabilidade principal enviada para CIP',
    observation: 'Portabilidade ADE 833085808 entrou em AGUARDAR RETORNO CIP',
    origin: 'SISTEMA',
    createdAt: fourBusinessDaysAgo,
  },
];

// Initial Pendings
const INITIAL_PENDINGS: Pending[] = [
  {
    id: 'pend-1',
    proposalId: 'prop-1902975450',
    clientId: 'cli-joao-pedro',
    responsibleUserName: 'Equipe de Suporte',
    responsibleGroup: 'NOSSA EQUIPE',
    type: 'DOCUMENTACAO',
    description: 'Documento de identificação com corte na foto. Solicitar reenvio do RG legível.',
    openedAt: oneDayAgo,
    status: 'ABERTA',
  },
];

// Initial Notifications
const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-1',
    proposalId: 'prop-833085808',
    title: 'Portabilidade Próxima do Prazo (4º dia)',
    message: 'A portabilidade da cliente MARIA JOSE ALEXANDRE (ADE: 833085808) está no 4º dia útil em CIP.',
    type: 'PORTABILIDADE_PROXIMA',
    priority: 'ATENCAO',
    read: false,
    createdAt: oneDayAgo,
  },
  {
    id: 'notif-2',
    proposalId: 'prop-1902975450',
    title: 'Nova Pendência Aberta',
    message: 'Pendência de documentação aberta para a proposta 1902975450.',
    type: 'NOVA_PENDENCIA',
    priority: 'NORMAL',
    read: false,
    createdAt: oneDayAgo,
  },
];

// Initial Audit Logs
const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-1',
    userId: 'u-digitador',
    userName: 'Ana Beatriz (Digitadora)',
    userRole: 'DIGITADOR',
    action: 'CADASTRO_PROPOSTA',
    entity: 'Proposal',
    entityId: 'prop-833085808',
    newData: JSON.stringify({ proposalNumber: '833085808', client: 'MARIA JOSE ALEXANDRE', bank: 'C6 BANK' }),
    createdAt: fourBusinessDaysAgo,
  },
  {
    id: 'audit-2',
    userId: 'u-suporte',
    userName: 'Lucas Ferreira (Suporte)',
    userRole: 'SUPORTE',
    action: 'ALTERACAO_STATUS',
    entity: 'Proposal',
    entityId: 'prop-833085808',
    previousData: JSON.stringify({ status: 'AGUARDAR FORMALIZAÇÃO' }),
    newData: JSON.stringify({ status: 'AGUARDAR RETORNO CIP' }),
    createdAt: fourBusinessDaysAgo,
  },
];

const INITIAL_SIMULATION_REQUESTS: SimulationRequest[] = [
  {
    id: 'sim-1',
    cpf: '01138777498', // Maria José
    partnerId: 'part-kauai', // KAUAI@16740
    createdById: 'u-digitador',
    status: 'DIGITADA PELA MESA',
    matchedProposalId: 'prop-833085808',
    matchedProposalNumber: '833085808',
    matchedDigitizerId: 'u-digitador',
    matchedDigitizerName: 'Ana Beatriz (Digitadora)',
    matchedAt: fourBusinessDaysAgo,
    createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: fourBusinessDaysAgo,
  },
  {
    id: 'sim-2',
    cpf: '54289312004', // João Pedro
    partnerId: 'part-franco', // FRANCO@16690
    createdById: 'u-digitador',
    status: 'SIMULAÇÃO ENVIADA',
    createdAt: oneDayAgo,
    updatedAt: oneDayAgo,
  },
  {
    id: 'sim-3',
    cpf: '38190244018', // Antonia Souza
    partnerId: 'part-fox', // FOX@16715
    createdById: 'u-master',
    status: 'NÃO PASSÍVEL DE CONTRATAÇÃO',
    createdAt: twoDaysAgo,
    updatedAt: twoDaysAgo,
  },
  {
    id: 'sim-4',
    cpf: '92847510293',
    partnerId: 'part-kauai',
    createdById: 'u-digitador',
    status: 'SIMULAÇÃO ENVIADA',
    createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
  },
];

export class StorageService {
  private static KEY_TO_COLLECTION: Record<string, string> = {
    'cg_users': 'users',
    'cg_promoters': 'promoters',
    'cg_banks': 'banks',
    'cg_bank_promoters': 'bank_promoters',
    'cg_partners': 'partners',
    'cg_products': 'products',
    'cg_clients': 'clients',
    'cg_statuses': 'statuses',
    'cg_proposals': 'proposals',
    'cg_proposal_relations': 'proposal_relations',
    'cg_history': 'history',
    'cg_pendings': 'pendings',
    'cg_holidays': 'holidays',
    'cg_notifications': 'notifications',
    'cg_audit_logs': 'audit_logs',
    'cg_simulation_requests': 'simulation_requests',
  };

  public static getCurrentPartnerId(): string {
    try {
      const activeUserStr = localStorage.getItem('cg_active_user');
      if (activeUserStr) {
        const activeUser = JSON.parse(activeUserStr);
        if (activeUser && activeUser.partnerId) {
          return activeUser.partnerId;
        }
      }
    } catch {}

    try {
      const configStr = localStorage.getItem('cg_config');
      if (configStr) {
        const config = JSON.parse(configStr);
        if (config && config.whiteLabel && config.whiteLabel.companyName) {
          return config.whiteLabel.companyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        }
      }
    } catch {}

    return 'sentinel_consig';
  }

  private static get<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(key);
      if (!data || data === 'undefined' || data === 'null') {
        if (Array.isArray(defaultValue)) {
          const currentPartnerId = this.getCurrentPartnerId();
          const stamped = defaultValue.map(item => {
            if (item && typeof item === 'object') {
              return { ...item, partnerId: item.partnerId || currentPartnerId };
            }
            return item;
          });
          return stamped as unknown as T;
        }
        return defaultValue;
      }
      const parsed = JSON.parse(data);
      if (parsed === null || parsed === undefined) return defaultValue;
      if (Array.isArray(defaultValue)) {
        if (!Array.isArray(parsed)) return defaultValue;
        const currentPartnerId = this.getCurrentPartnerId();
        return parsed.filter(item => {
          if (item && typeof item === 'object') {
            return !item.partnerId || item.partnerId === currentPartnerId;
          }
          return true;
        }) as unknown as T;
      }
      return parsed;
    } catch {
      return defaultValue;
    }
  }

  private static set<T>(key: string, value: T): void {
    try {
      let finalValue = value;
      const currentPartnerId = this.getCurrentPartnerId();

      if (Array.isArray(value)) {
        const rawStored = localStorage.getItem(key);
        let allItems: any[] = [];
        try {
          if (rawStored) {
            const parsed = JSON.parse(rawStored);
            if (Array.isArray(parsed)) {
              allItems = parsed;
            }
          }
        } catch {}

        const newArray = (value as any[]).map(item => {
          if (item && typeof item === 'object') {
            return { ...item, partnerId: item.partnerId || currentPartnerId };
          }
          return item;
        });

        const otherPartnersItems = allItems.filter(item => {
          if (item && typeof item === 'object') {
            return item.partnerId && item.partnerId !== currentPartnerId;
          }
          return false;
        });

        finalValue = [...otherPartnersItems, ...newArray] as unknown as T;
      }

      localStorage.setItem(key, JSON.stringify(finalValue));

      const colName = this.KEY_TO_COLLECTION[key];
      if (colName && Array.isArray(value)) {
        const oldArray = this.get<any[]>(key, []);
        const newArray = value as any[];

        const oldMap = new Map<string, any>(oldArray.map(item => [item.id, item]));
        const newMap = new Map<string, any>(newArray.map(item => [item.id, item]));

        for (const newItem of newArray) {
          if (newItem && newItem.id) {
            const stampedItem = { ...newItem, partnerId: newItem.partnerId || currentPartnerId };
            const oldItem = oldMap.get(newItem.id);
            if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(stampedItem)) {
              const cleaned = cleanObjectForFirestore(stampedItem);
              setDoc(doc(db, colName, newItem.id), cleaned).catch(err => {
                console.warn(`Firestore sync write error on ${colName}/${newItem.id}:`, err);
              });
            }
          }
        }

        for (const oldItem of oldArray) {
          if (oldItem && oldItem.id && oldItem.partnerId === currentPartnerId && !newMap.has(oldItem.id)) {
            deleteDoc(doc(db, colName, oldItem.id)).catch(err => {
              console.warn(`Firestore sync delete error on ${colName}/${oldItem.id}:`, err);
            });
          }
        }
      }

      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    } catch (e) {
      console.error(`Failed to write to localStorage for key ${key}:`, e);
    }
  }

  public static initialize(): void {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this.resetToInitial();
    }
    this.loadFromFirestore().catch(err => {
      console.error("Failed to initialize state from Firestore:", err);
    });
  }

  public static async loadFromFirestore(): Promise<void> {
    let hasData = false;
    const collectionsToLoad = Object.entries(this.KEY_TO_COLLECTION);
    const currentPartnerId = this.getCurrentPartnerId();

    for (const [key, colName] of collectionsToLoad) {
      try {
        const q = query(collection(db, colName), where('partnerId', '==', currentPartnerId));
        const querySnapshot = await getDocs(q);
        
        const items: any[] = [];
        if (!querySnapshot.empty) {
          querySnapshot.forEach((doc) => {
            items.push(doc.data());
          });
          hasData = true;
        }

        const rawStored = localStorage.getItem(key);
        let otherItems: any[] = [];
        if (rawStored) {
          try {
            const parsed = JSON.parse(rawStored);
            if (Array.isArray(parsed)) {
              otherItems = parsed.filter(item => item && item.partnerId && item.partnerId !== currentPartnerId);
            }
          } catch {}
        }

        const merged = [...otherItems, ...items];
        localStorage.setItem(key, JSON.stringify(merged));

      } catch (err) {
        console.error(`Failed to load collection ${colName} from Firestore:`, err);
      }
    }

    if (hasData) {
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    } else {
      console.log("Firestore has no records for this partner. Seeding initial data with current partnerId...");
      await this.seedFirestoreFromLocal();
    }
  }

  public static async seedFirestoreFromLocal(): Promise<void> {
    const currentPartnerId = this.getCurrentPartnerId();
    for (const [key, colName] of Object.entries(this.KEY_TO_COLLECTION)) {
      try {
        const localData = this.get<any[]>(key, []);
        if (localData.length > 0) {
          console.log(`Seeding ${colName} with ${localData.length} records for partner ${currentPartnerId}...`);
          for (const item of localData) {
            if (item && item.id) {
              const stamped = { ...item, partnerId: item.partnerId || currentPartnerId };
              await setDoc(doc(db, colName, item.id), cleanObjectForFirestore(stamped));
            }
          }
        }
      } catch (err) {
        console.error(`Failed to seed collection ${colName} to Firestore:`, err);
      }
    }
  }

  public static resetToInitial(): void {
    this.set(STORAGE_KEYS.USERS, INITIAL_USERS);
    this.set(STORAGE_KEYS.ACTIVE_USER, INITIAL_USERS[0]); // Master as active
    this.set(STORAGE_KEYS.PROMOTERS, INITIAL_PROMOTERS);
    this.set(STORAGE_KEYS.BANKS, INITIAL_BANKS);
    this.set(STORAGE_KEYS.BANK_PROMOTERS, INITIAL_BANK_PROMOTERS);
    this.set(STORAGE_KEYS.PARTNERS, INITIAL_PARTNERS);
    this.set(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    this.set(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS);
    this.set(STORAGE_KEYS.STATUSES, INITIAL_STATUSES);
    this.set(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    this.set(STORAGE_KEYS.PROPOSAL_RELATIONS, INITIAL_PROPOSAL_RELATIONS);
    this.set(STORAGE_KEYS.HISTORY, INITIAL_HISTORY);
    this.set(STORAGE_KEYS.COMMENTS, []);
    this.set(STORAGE_KEYS.PENDINGS, INITIAL_PENDINGS);
    this.set(STORAGE_KEYS.HOLIDAYS, INITIAL_HOLIDAYS);
    this.set(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    this.set(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
    this.set(STORAGE_KEYS.EXPORT_LOGS, []);
    this.set(STORAGE_KEYS.SIMULATION_REQUESTS, INITIAL_SIMULATION_REQUESTS);
    this.set(
      STORAGE_KEYS.CONFIG,
      { portabilityBalanceDays: 5, autoCronIntervalMinutes: 15 }
    );
  }

  // Active User & Auth
  public static isAuthenticated(): boolean {
    const isAuth = localStorage.getItem('cg_is_authenticated');
    if (isAuth === null) {
      // Default to false. Everyone must log in manually first!
      localStorage.setItem('cg_is_authenticated', 'false');
      return false;
    }
    return isAuth === 'true';
  }

  public static loginUser(user: User): void {
    localStorage.setItem('cg_is_authenticated', 'true');
    this.setActiveUser(user);
    this.addAuditLog({
      action: 'LOGIN_SISTEMA',
      entity: 'User',
      entityId: user.id,
      newData: JSON.stringify({ email: user.email, name: user.name, role: user.role }),
    });
    window.dispatchEvent(new Event('credit_gestao_storage_update'));
  }

  public static logout(): void {
    localStorage.setItem('cg_is_authenticated', 'false');
    const active = this.getActiveUser();
    this.addAuditLog({
      action: 'LOGOUT_SISTEMA',
      entity: 'User',
      entityId: active.id,
      previousData: JSON.stringify({ email: active.email, name: active.name, role: active.role }),
    });
    window.dispatchEvent(new Event('credit_gestao_storage_update'));
  }

  public static getActiveUser(): User {
    let user = this.get<User>(STORAGE_KEYS.ACTIVE_USER, INITIAL_USERS[0]);
    if (user.id === 'u-master' || user.role === 'MASTER') {
      if (user.name !== 'Kauai Gouveia' || user.email !== 'kauaigouveia@gmail.com') {
        user = { ...user, name: 'Kauai Gouveia', email: 'kauaigouveia@gmail.com' };
        this.set(STORAGE_KEYS.ACTIVE_USER, user);
      }
    }
    if (user.name && user.name.includes('(')) {
      user = { ...user, name: user.name.replace(/\s*\([^)]*\)/g, '').trim() };
      this.set(STORAGE_KEYS.ACTIVE_USER, user);
    }
    return user;
  }

  public static setActiveUser(user: User): void {
    this.set(STORAGE_KEYS.ACTIVE_USER, user);
    this.addAuditLog({
      action: 'LOGIN_SIMULADO',
      entity: 'User',
      entityId: user.id,
      newData: JSON.stringify({ email: user.email, role: user.role }),
    });
  }

  public static getUsers(): User[] {
    let users = this.get<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    let modified = false;

    // Clean up any old parenthetical role tags from existing stored names
    users = users.map(u => {
      if (u.name && u.name.includes('(')) {
        modified = true;
        return { ...u, name: u.name.replace(/\s*\([^)]*\)/g, '').trim() };
      }
      return u;
    });

    const masterIdx = users.findIndex(u => u.id === 'u-master' || u.role === 'MASTER');
    if (masterIdx !== -1) {
      if (users[masterIdx].name !== 'Kauai Gouveia' || users[masterIdx].email !== 'kauaigouveia@gmail.com') {
        users[masterIdx] = {
          ...users[masterIdx],
          name: 'Kauai Gouveia',
          email: 'kauaigouveia@gmail.com',
        };
        modified = true;
      }
    }

    if (modified) {
      this.set(STORAGE_KEYS.USERS, users);
    }
    return users;
  }

  public static generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let rand = 'Ev@';
    for (let i = 0; i < 5; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return rand;
  }

  public static createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      throw new Error(`Já existe um usuário cadastrado com o e-mail: ${data.email}`);
    }

    const tempPassword = data.password || this.generateTemporaryPassword();
    const newUser: User = {
      ...data,
      id: `u-${Date.now()}`,
      password: tempPassword,
      mustChangePassword: data.mustChangePassword !== undefined ? data.mustChangePassword : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.push(newUser);
    this.set(STORAGE_KEYS.USERS, users);
    this.addAuditLog({
      action: 'CRIAR_USUARIO',
      entity: 'User',
      entityId: newUser.id,
      newData: JSON.stringify({ name: newUser.name, email: newUser.email, role: newUser.role, mustChangePassword: newUser.mustChangePassword }),
    });
    return newUser;
  }

  public static updateUserPassword(userId: string, newPassword: string): User {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('Usuário não encontrado');
    
    const updatedUser = {
      ...users[idx],
      password: newPassword,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    };
    users[idx] = updatedUser;
    this.set(STORAGE_KEYS.USERS, users);

    const active = this.getActiveUser();
    if (active.id === userId) {
      this.set(STORAGE_KEYS.ACTIVE_USER, updatedUser);
    }

    this.addAuditLog({
      action: 'ALTERAR_SENHA',
      entity: 'User',
      entityId: userId,
      newData: JSON.stringify({ email: updatedUser.email }),
    });

    return updatedUser;
  }

  public static resetUserPassword(userId: string): { user: User; tempPassword: string } {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('Usuário não encontrado');

    const tempPassword = this.generateTemporaryPassword();
    const updatedUser = {
      ...users[idx],
      password: tempPassword,
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    };
    users[idx] = updatedUser;
    this.set(STORAGE_KEYS.USERS, users);

    this.addAuditLog({
      action: 'RESETAR_SENHA_TEMPORARIA',
      entity: 'User',
      entityId: userId,
      newData: JSON.stringify({ email: updatedUser.email, tempPassword }),
    });

    return { user: updatedUser, tempPassword };
  }

  public static updateUser(id: string, updates: Partial<User>): User {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('Usuário não encontrado');
    const old = users[idx];
    users[idx] = { ...old, ...updates, updatedAt: new Date().toISOString() };
    this.set(STORAGE_KEYS.USERS, users);
    this.addAuditLog({
      action: 'EDITAR_USUARIO',
      entity: 'User',
      entityId: id,
      previousData: JSON.stringify(old),
      newData: JSON.stringify(users[idx]),
    });
    return users[idx];
  }

  public static deleteUser(id: string): void {
    const active = this.getActiveUser();
    if (active.id === id) {
      throw new Error('Você não pode excluir o seu próprio usuário logado.');
    }
    const users = this.getUsers();
    const target = users.find(u => u.id === id);
    if (!target) throw new Error('Usuário não encontrado.');
    if (target.id === 'u-master' || target.email === 'kauaigouveia@gmail.com' || target.role === 'MASTER') {
      throw new Error('Não é permitido excluir o usuário Master principal.');
    }
    const updated = users.filter(u => u.id !== id);
    this.set(STORAGE_KEYS.USERS, updated);
    this.addAuditLog({
      action: 'EXCLUIR_USUARIO',
      entity: 'User',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // Partners
  public static getPartners(): Partner[] {
    return this.get<Partner[]>(STORAGE_KEYS.PARTNERS, INITIAL_PARTNERS);
  }

  public static createPartner(data: { fullName: string; login: string; promoterId: string }): Partner {
    const partners = this.getPartners();
    const cleanLogin = data.login.trim().toUpperCase();

    // Validate unique login
    if (partners.some(p => p.login.toUpperCase() === cleanLogin)) {
      throw new Error('Este login de parceiro já está cadastrado.');
    }

    const newPartner: Partner = {
      id: `part-${Date.now()}`,
      fullName: data.fullName.trim().toUpperCase(),
      login: cleanLogin,
      promoterId: data.promoterId,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    partners.push(newPartner);
    this.set(STORAGE_KEYS.PARTNERS, partners);
    this.addAuditLog({
      action: 'CRIAR_PARCEIRO',
      entity: 'Partner',
      entityId: newPartner.id,
      newData: JSON.stringify(newPartner),
    });
    return newPartner;
  }

  public static createPartnersBatch(items: { fullName: string; login: string; promoterId: string }[]): {
    createdCount: number;
    errors: string[];
    createdPartners: Partner[];
  } {
    const partners = this.getPartners();
    const existingLoginsSet = new Set(partners.map(p => p.login.toUpperCase()));
    const errors: string[] = [];
    const createdPartners: Partner[] = [];

    const nowIso = new Date().toISOString();

    items.forEach((item, index) => {
      const rowNum = index + 1;
      const fullName = item.fullName.trim().toUpperCase();
      let login = item.login.trim().toUpperCase();

      if (!fullName) {
        errors.push(`Linha ${rowNum}: Nome completo é obrigatório.`);
        return;
      }

      if (!login) {
        errors.push(`Linha ${rowNum}: Login é obrigatório.`);
        return;
      }

      // Format login if no @ exists (e.g. "KAUAI" + "16740" or "16740")
      if (!login.includes('@')) {
        const cleanNamePart = fullName.split(' ')[0] || 'PARCEIRO';
        login = `${cleanNamePart}@${login}`;
      }

      if (existingLoginsSet.has(login)) {
        errors.push(`Linha ${rowNum}: Login '${login}' já cadastrado.`);
        return;
      }

      const newPartner: Partner = {
        id: `part-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fullName,
        login,
        promoterId: item.promoterId,
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      partners.push(newPartner);
      existingLoginsSet.add(login);
      createdPartners.push(newPartner);
    });

    if (createdPartners.length > 0) {
      this.set(STORAGE_KEYS.PARTNERS, partners);
      const activeUser = this.getActiveUser();
      this.addAuditLog({
        action: 'IMPORTACAO_EM_MASSA_PARCEIROS',
        entity: 'Partner',
        entityId: `batch-${Date.now()}`,
        newData: JSON.stringify({
          count: createdPartners.length,
          importedBy: activeUser.name,
          logins: createdPartners.map(p => p.login),
        }),
      });
    }

    return {
      createdCount: createdPartners.length,
      errors,
      createdPartners,
    };
  }

  public static updatePartner(id: string, updates: Partial<Partner>): Partner {
    const partners = this.getPartners();
    const idx = partners.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Parceiro não encontrado');
    const old = partners[idx];
    if (updates.login && updates.login !== old.login) {
      if (partners.some(p => p.id !== id && p.login.toUpperCase() === updates.login!.toUpperCase())) {
        throw new Error('Este login de parceiro já está cadastrado.');
      }
    }
    partners[idx] = { ...old, ...updates, updatedAt: new Date().toISOString() };
    this.set(STORAGE_KEYS.PARTNERS, partners);
    this.addAuditLog({
      action: 'EDITAR_PARCEIRO',
      entity: 'Partner',
      entityId: id,
      previousData: JSON.stringify(old),
      newData: JSON.stringify(partners[idx]),
    });
    return partners[idx];
  }

  public static deletePartner(id: string): void {
    const list = this.getPartners();
    const target = list.find(p => p.id === id);
    if (!target) throw new Error('Parceiro não encontrado.');
    const updated = list.filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PARTNERS, updated);
    this.addAuditLog({
      action: 'EXCLUIR_PARCEIRO',
      entity: 'Partner',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // Promoters
  public static getPromoters(): Promoter[] {
    return this.get<Promoter[]>(STORAGE_KEYS.PROMOTERS, INITIAL_PROMOTERS);
  }

  public static createPromoter(nameOrObj: string | { name: string; observation?: string }, observation?: string): Promoter {
    const promoters = this.getPromoters();
    const rawName = typeof nameOrObj === 'string' ? nameOrObj : nameOrObj.name;
    const rawObs = typeof nameOrObj === 'string' ? observation : nameOrObj.observation;
    const cleanName = rawName.trim().toUpperCase();
    if (promoters.some(p => p.name.toUpperCase() === cleanName)) {
      throw new Error(`Promotora ${cleanName} já existe.`);
    }
    const newPromoter: Promoter = {
      id: `prom-${Date.now()}`,
      name: cleanName,
      observation: rawObs,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    promoters.push(newPromoter);
    this.set(STORAGE_KEYS.PROMOTERS, promoters);
    this.addAuditLog({
      action: 'CRIAR_PROMOTORA',
      entity: 'Promoter',
      entityId: newPromoter.id,
      newData: JSON.stringify(newPromoter),
    });
    return newPromoter;
  }

  public static deletePromoter(id: string): void {
    const list = this.getPromoters();
    const target = list.find(p => p.id === id);
    if (!target) throw new Error('Promotora não encontrada.');
    const updated = list.filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PROMOTERS, updated);

    // Clean bank promoter matrix
    const matrix = this.get<BankPromoter[]>(STORAGE_KEYS.BANK_PROMOTERS, INITIAL_BANK_PROMOTERS).filter(
      bp => bp.promoterId !== id
    );
    this.set(STORAGE_KEYS.BANK_PROMOTERS, matrix);

    this.addAuditLog({
      action: 'EXCLUIR_PROMOTORA',
      entity: 'Promoter',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // Banks
  public static getBanks(): Bank[] {
    return this.get<Bank[]>(STORAGE_KEYS.BANKS, INITIAL_BANKS);
  }

  public static createBank(nameOrObj: string | { name: string; code?: string; observation?: string }, code?: string, observation?: string): Bank {
    const banks = this.getBanks();
    const rawName = typeof nameOrObj === 'string' ? nameOrObj : nameOrObj.name;
    const rawCode = typeof nameOrObj === 'string' ? code : nameOrObj.code;
    const rawObs = typeof nameOrObj === 'string' ? observation : nameOrObj.observation;
    const cleanName = rawName.trim().toUpperCase();
    if (banks.some(b => b.name.toUpperCase() === cleanName)) {
      throw new Error(`Banco ${cleanName} já cadastrado.`);
    }
    const newBank: Bank = {
      id: `bank-${Date.now()}`,
      name: cleanName,
      code: rawCode,
      observation: rawObs,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    banks.push(newBank);
    this.set(STORAGE_KEYS.BANKS, banks);
    this.addAuditLog({
      action: 'CRIAR_BANCO',
      entity: 'Bank',
      entityId: newBank.id,
      newData: JSON.stringify(newBank),
    });
    return newBank;
  }

  public static deleteBank(id: string): void {
    const list = this.getBanks();
    const target = list.find(b => b.id === id);
    if (!target) throw new Error('Banco não encontrado.');
    const updated = list.filter(b => b.id !== id);
    this.set(STORAGE_KEYS.BANKS, updated);

    // Clean bank promoter matrix
    const matrix = this.get<BankPromoter[]>(STORAGE_KEYS.BANK_PROMOTERS, INITIAL_BANK_PROMOTERS).filter(
      bp => bp.bankId !== id
    );
    this.set(STORAGE_KEYS.BANK_PROMOTERS, matrix);

    this.addAuditLog({
      action: 'EXCLUIR_BANCO',
      entity: 'Bank',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // BankPromoter Associations
  public static getBankPromoters(): BankPromoter[] {
    return this.get<BankPromoter[]>(STORAGE_KEYS.BANK_PROMOTERS, INITIAL_BANK_PROMOTERS);
  }

  public static toggleBankPromoter(bankId: string, promoterId: string, explicitValue?: boolean): boolean {
    const current = this.isBankPromoterAllowed(bankId, promoterId);
    const target = explicitValue !== undefined ? explicitValue : !current;
    this.setBankPromoter(bankId, promoterId, target);
    return target;
  }

  public static setBankPromoter(bankId: string, promoterId: string, active: boolean): void {
    const list = this.getBankPromoters();
    const existingIdx = list.findIndex(bp => bp.bankId === bankId && bp.promoterId === promoterId);
    if (existingIdx >= 0) {
      list[existingIdx].active = active;
      list[existingIdx].updatedAt = new Date().toISOString();
    } else {
      list.push({
        id: `bp-${Date.now()}`,
        bankId,
        promoterId,
        active,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    this.set(STORAGE_KEYS.BANK_PROMOTERS, list);
    this.addAuditLog({
      action: 'ATUALIZAR_VINCULO_BANCO_PROMOTORA',
      entity: 'BankPromoter',
      entityId: `${bankId}_${promoterId}`,
      newData: JSON.stringify({ bankId, promoterId, active }),
    });
  }

  public static isBankPromoterAllowed(bankId: string, promoterId: string): boolean {
    const list = this.getBankPromoters();
    return list.some(bp => bp.bankId === bankId && bp.promoterId === promoterId && bp.active);
  }

  public static getPromotersForBank(bankId: string): Promoter[] {
    const bps = this.getBankPromoters().filter(bp => bp.bankId === bankId && bp.active);
    const promoters = this.getPromoters();
    return promoters.filter(p => p.active && bps.some(bp => bp.promoterId === p.id));
  }

  // Products
  public static getProducts(): Product[] {
    return this.get<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
  }

  public static createProduct(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product {
    const products = this.getProducts();
    const newProduct: Product = {
      ...data,
      id: `prod-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    products.push(newProduct);
    this.set(STORAGE_KEYS.PRODUCTS, products);
    this.addAuditLog({
      action: 'CRIAR_PRODUTO',
      entity: 'Product',
      entityId: newProduct.id,
      newData: JSON.stringify(newProduct),
    });
    return newProduct;
  }

  public static deleteProduct(id: string): void {
    const list = this.getProducts();
    const target = list.find(p => p.id === id);
    if (!target) throw new Error('Produto não encontrado.');
    const updated = list.filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PRODUCTS, updated);
    this.addAuditLog({
      action: 'EXCLUIR_PRODUTO',
      entity: 'Product',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // Statuses
  public static getStatuses(): ProposalStatus[] {
    const list = this.get<ProposalStatus[]>(STORAGE_KEYS.STATUSES, INITIAL_STATUSES);
    return list.slice().sort((a, b) => a.order - b.order);
  }

  public static getStatusById(id: string): ProposalStatus | undefined {
    return this.getStatuses().find(s => s.id === id);
  }

  public static getStatusByCode(code: string): ProposalStatus | undefined {
    return this.getStatuses().find(s => s.code === code);
  }

  public static saveStatuses(statuses: ProposalStatus[]): void {
    this.set(STORAGE_KEYS.STATUSES, statuses);
    window.dispatchEvent(new Event('credit_gestao_storage_update'));
  }

  public static addStatus(data: {
    name: string;
    code?: string;
    responsibleGroup: Alcada;
    slaHours?: number;
    color?: string;
    active?: boolean;
    finalStatus?: boolean;
    manualChangeAllowed?: boolean;
    automaticChangeAllowed?: boolean;
  }): ProposalStatus {
    const statuses = this.getStatuses();
    const nameUpper = data.name.trim().toUpperCase();
    const cleanCode = (data.code || nameUpper.replace(/[^A-Z0-9]/g, '_')).trim().toUpperCase();

    if (statuses.some(s => s.code === cleanCode)) {
      throw new Error(`Já existe um status com o código "${cleanCode}". Escolha um código diferente.`);
    }

    const nextOrder = statuses.length > 0 ? Math.max(...statuses.map(s => s.order)) + 1 : 1;

    const newStatus: ProposalStatus = {
      id: `st-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: nameUpper,
      code: cleanCode as any,
      active: data.active ?? true,
      order: nextOrder,
      responsibleGroup: data.responsibleGroup,
      responsible: data.responsibleGroup,
      slaHours: Number(data.slaHours) || 0,
      finalStatus: !!data.finalStatus,
      manualChangeAllowed: data.manualChangeAllowed ?? true,
      automaticChangeAllowed: data.automaticChangeAllowed ?? true,
      color: data.color || '#3b82f6',
    };

    statuses.push(newStatus);
    statuses.sort((a, b) => a.order - b.order);
    this.saveStatuses(statuses);

    this.addAuditLog({
      action: 'CRIAR_STATUS',
      entity: 'ProposalStatus',
      entityId: newStatus.id,
      newData: JSON.stringify(newStatus),
    });

    return newStatus;
  }

  public static updateStatus(id: string, updates: Partial<ProposalStatus>): ProposalStatus {
    const statuses = this.getStatuses();
    const idx = statuses.findIndex(s => s.id === id);
    if (idx === -1) {
      throw new Error('Status não encontrado.');
    }

    const old = statuses[idx];

    if (updates.code && updates.code.toUpperCase() !== old.code.toUpperCase()) {
      const cleanCode = updates.code.trim().toUpperCase();
      if (statuses.some(s => s.id !== id && s.code.toUpperCase() === cleanCode)) {
        throw new Error(`Já existe outro status cadastrado com o código "${cleanCode}".`);
      }
    }

    const respGroup = updates.responsibleGroup || updates.responsible || old.responsibleGroup;

    const updated: ProposalStatus = {
      ...old,
      ...updates,
      name: updates.name ? updates.name.trim().toUpperCase() : old.name,
      code: updates.code ? (updates.code.trim().toUpperCase() as any) : old.code,
      responsibleGroup: respGroup,
      responsible: respGroup,
    };

    statuses[idx] = updated;
    statuses.sort((a, b) => a.order - b.order);
    this.saveStatuses(statuses);

    this.addAuditLog({
      action: 'ATUALIZAR_STATUS',
      entity: 'ProposalStatus',
      entityId: id,
      previousData: JSON.stringify(old),
      newData: JSON.stringify(updated),
    });

    return updated;
  }

  public static deleteStatus(id: string, targetFallbackStatusId?: string): void {
    const statuses = this.getStatuses();
    const idx = statuses.findIndex(s => s.id === id);
    if (idx === -1) {
      throw new Error('Status não encontrado.');
    }

    const statusToDelete = statuses[idx];

    if (statuses.length <= 1) {
      throw new Error('Não é possível excluir todos os status. O sistema necessita de pelo menos 1 status ativo.');
    }

    // Check proposals bound to this status
    const proposals = this.getProposals();
    const affected = proposals.filter(p => p.statusId === id);

    if (affected.length > 0) {
      if (!targetFallbackStatusId) {
        throw new Error(`Existem ${affected.length} propostas com o status "${statusToDelete.name}". Selecione um status de destino para migrar estas propostas antes de excluir.`);
      }

      const fallback = statuses.find(s => s.id === targetFallbackStatusId && s.id !== id);
      if (!fallback) {
        throw new Error('Status de destino para migração não encontrado.');
      }

      // Migrate proposals
      proposals.forEach(p => {
        if (p.statusId === id) {
          p.statusId = fallback.id;
          p.currentResponsible = fallback.responsibleGroup;
          p.updatedAt = new Date().toISOString();
        }
      });
      this.set(STORAGE_KEYS.PROPOSALS, proposals);
    }

    statuses.splice(idx, 1);

    // Re-index order
    statuses.forEach((s, index) => {
      s.order = index + 1;
    });

    this.saveStatuses(statuses);

    this.addAuditLog({
      action: 'EXCLUIR_STATUS',
      entity: 'ProposalStatus',
      entityId: id,
      previousData: JSON.stringify(statusToDelete),
    });
  }

  public static moveStatusOrder(id: string, direction: 'UP' | 'DOWN'): void {
    const statuses = this.getStatuses();
    const idx = statuses.findIndex(s => s.id === id);
    if (idx === -1) return;

    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= statuses.length) return;

    // Swap orders
    const tempOrder = statuses[idx].order;
    statuses[idx].order = statuses[targetIdx].order;
    statuses[targetIdx].order = tempOrder;

    statuses.sort((a, b) => a.order - b.order);
    this.saveStatuses(statuses);
  }

  // Clients
  public static getClients(): Client[] {
    return this.get<Client[]>(STORAGE_KEYS.CLIENTS, INITIAL_CLIENTS);
  }

  public static findClientByCpf(cpf: string): Client | undefined {
    const clean = normalizeCpf(cpf);
    if (!clean) return undefined;
    return this.getClients().find(c => normalizeCpf(c.cpf) === clean);
  }

  public static getOrCreateClient(data: { cpf: string; fullName: string; phone?: string; email?: string; observation?: string }): Client {
    const cleanCpf = normalizeCpf(data.cpf);
    if (cleanCpf.length !== 11) {
      throw new Error('CPF deve conter exatamente 11 dígitos numéricos.');
    }
    const cleanName = data.fullName ? data.fullName.trim().toUpperCase() : '';
    const clients = this.getClients();
    const existingIndex = clients.findIndex(c => normalizeCpf(c.cpf) === cleanCpf);
    if (existingIndex !== -1) {
      const existing = clients[existingIndex];
      let updated = false;
      if (cleanName && cleanName !== 'CLIENTE NÃO NOMEADO' && cleanName !== existing.fullName) {
        existing.fullName = cleanName;
        updated = true;
      }
      if (data.phone && data.phone !== existing.phone) {
        existing.phone = data.phone;
        updated = true;
      }
      if (data.email && data.email !== existing.email) {
        existing.email = data.email;
        updated = true;
      }
      if (updated) {
        existing.updatedAt = new Date().toISOString();
        clients[existingIndex] = existing;
        this.set(STORAGE_KEYS.CLIENTS, clients);
      }
      return existing;
    }

    const newClient: Client = {
      id: `cli-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      cpf: cleanCpf,
      fullName: cleanName || 'CLIENTE NÃO NOMEADO',
      phone: data.phone,
      email: data.email,
      observation: data.observation,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    clients.push(newClient);
    this.set(STORAGE_KEYS.CLIENTS, clients);
    this.addAuditLog({
      action: 'CRIAR_CLIENTE',
      entity: 'Client',
      entityId: newClient.id,
      newData: JSON.stringify(newClient),
    });
    return newClient;
  }

  // Proposals
  public static getProposals(): Proposal[] {
    const list = this.get<Proposal[]>(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    const relations = this.getProposalRelations();
    const pendings = this.getPendings();
    return list.map(p => {
      const rel = relations.find(r => r.refinProposalId === p.id);
      return {
        ...p,
        relatedPortabilityId: rel?.portabilityProposalId,
        pendencies: pendings.filter(pen => pen.proposalId === p.id),
      };
    });
  }

  public static getProposalById(id: string): Proposal | undefined {
    const p = this.get<Proposal[]>(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS).find(prop => prop.id === id);
    if (!p) return undefined;
    const rel = this.getProposalRelations().find(r => r.refinProposalId === id);
    return {
      ...p,
      relatedPortabilityId: rel?.portabilityProposalId,
      pendencies: this.getPendings(p.id),
      statusHistory: this.getStatusHistory(p.id),
      comments: this.getComments(p.id),
    };
  }

  public static getProposalByNumber(number: string): Proposal | undefined {
    const clean = number.trim().toUpperCase();
    return this.getProposals().find(p => p.proposalNumber.trim().toUpperCase() === clean);
  }

  public static getProposalsByClientId(clientId: string): Proposal[] {
    return this.getProposals().filter(p => p.clientId === clientId);
  }

  public static getProposalRelations(): ProposalRelation[] {
    return this.get<ProposalRelation[]>(STORAGE_KEYS.PROPOSAL_RELATIONS, INITIAL_PROPOSAL_RELATIONS);
  }

  public static getRelatedRefinProposal(portabilityProposalId: string): Proposal | undefined {
    const rel = this.getProposalRelations().find(r => r.portabilityProposalId === portabilityProposalId);
    if (!rel) return undefined;
    return this.getProposalById(rel.refinProposalId);
  }

  public static getRelatedPortabilityProposal(refinProposalId: string): Proposal | undefined {
    const rel = this.getProposalRelations().find(r => r.refinProposalId === refinProposalId);
    if (!rel) return undefined;
    return this.getProposalById(rel.portabilityProposalId);
  }

  public static createProposalRelation(portabilityId: string, refinId: string): void {
    const relations = this.getProposalRelations();
    if (relations.some(r => r.portabilityProposalId === portabilityId && r.refinProposalId === refinId)) {
      return;
    }
    const newRel: ProposalRelation = {
      id: `rel-${Date.now()}`,
      portabilityProposalId: portabilityId,
      refinProposalId: refinId,
      createdAt: new Date().toISOString(),
    };
    relations.push(newRel);
    this.set(STORAGE_KEYS.PROPOSAL_RELATIONS, relations);
  }

  /**
   * Creates a new proposal.
   * Enforces:
   * 1. Duplicate ADE check: "Esta proposta já está cadastrada."
   * 2. Bank × Promoter validation: "Esta promotora não está habilitada para este banco."
   */
  public static createProposal(
    data: {
      proposalNumber: string;
      clientId: string;
      productId: string;
      bankId: string;
      promoterId: string;
      partnerId: string;
      digitizerId?: string;
      statusId?: string;
      notes?: string;
      relatedPortabilityId?: string; // If creating a refin linked to a portabilidade
    },
    origin: 'MANUAL' | 'IMPORTACAO' = 'MANUAL'
  ): Proposal {
    const activeUser = this.getActiveUser();
    const proposals = this.getProposals();

    const cleanNumber = data.proposalNumber.trim();
    if (!cleanNumber) {
      throw new Error('O número da ADE/Proposta é obrigatório.');
    }

    // Duplicate check on proposalNumber (ADE)
    const existing = proposals.find(p => p.proposalNumber.toLowerCase() === cleanNumber.toLowerCase());
    if (existing) {
      const client = this.getClients().find(c => c.id === existing.clientId);
      const bank = this.getBanks().find(b => b.id === existing.bankId);
      const promoter = this.getPromoters().find(pr => pr.id === existing.promoterId);
      const partner = this.getPartners().find(pt => pt.id === existing.partnerId);
      const status = this.getStatusById(existing.statusId);
      throw new Error(
        `Esta proposta já está cadastrada.\nADE: ${existing.proposalNumber} | Cliente: ${client?.fullName || '-'} | Banco: ${bank?.name || '-'} / ${promoter?.name || '-'} | Parceiro: ${partner?.login || '-'} | Status: ${status?.name || '-'}`
      );
    }

    // Bank + Promoter check
    if (!this.isBankPromoterAllowed(data.bankId, data.promoterId)) {
      const bank = this.getBanks().find(b => b.id === data.bankId);
      const promoter = this.getPromoters().find(p => p.id === data.promoterId);
      throw new Error(`A promotora ${promoter?.name || ''} não está habilitada para o banco ${bank?.name || ''}.`);
    }

    const defaultStatus = this.getStatusByCode('AGUARDAR_FORMALIZACAO') || this.getStatuses()[0];
    const statusId = data.statusId || defaultStatus.id;
    const statusObj = this.getStatusById(statusId) || defaultStatus;

    const newProposal: Proposal = {
      id: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      proposalNumber: cleanNumber,
      clientId: data.clientId,
      productId: data.productId,
      bankId: data.bankId,
      promoterId: data.promoterId,
      partnerId: data.partnerId,
      digitizerId: data.digitizerId || activeUser.id,
      statusId: statusId,
      currentResponsible: statusObj.responsibleGroup,
      notes: data.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (statusObj.code === 'AGUARDAR_RETORNO_CIP') {
      newProposal.portabilitySlaStartedAt = new Date().toISOString();
    }

    proposals.push(newProposal);
    this.set(STORAGE_KEYS.PROPOSALS, proposals);

    // If related to a portability proposal, create the ProposalRelation
    if (data.relatedPortabilityId) {
      this.createProposalRelation(data.relatedPortabilityId, newProposal.id);
    }

    // Record history
    this.addStatusHistory({
      proposalId: newProposal.id,
      userId: activeUser.id,
      userName: activeUser.name,
      newStatusId: statusId,
      newStatusName: statusObj.name,
      action: 'Cadastro de Proposta',
      observation: data.notes,
      origin: origin,
    });

    this.addAuditLog({
      action: 'CRIAR_PROPOSTA',
      entity: 'Proposal',
      entityId: newProposal.id,
      newData: JSON.stringify({
        proposalNumber: newProposal.proposalNumber,
        clientId: newProposal.clientId,
        bankId: newProposal.bankId,
        promoterId: newProposal.promoterId,
      }),
    });

    // Automatic matching: Check if any SimulationRequest matches CPF + Partner
    this.processSimulationMatching(newProposal);

    return newProposal;
  }

  /**
   * Updates proposal status with business rules and automations:
   * 1. Updates currentResponsible based on status.responsibleGroup
   * 2. When PORTABILIDADE status becomes AGUARDAR_RETORNO_CIP:
   *    - Records portabilitySlaStartedAt
   *    - Automatically transitions related REFIN DA PORTABILIDADE to AGUARDAR_PORTABILIDADE
   * 3. Sets completion/paid/cancelled/rejected timestamps
   */
  public static updateProposalStatus(
    proposalId: string,
    newStatusId: string,
    observation?: string,
    customUser?: User,
    origin: 'MANUAL' | 'SISTEMA' | 'ALTERACAO_EM_LOTE' = 'MANUAL'
  ): Proposal {
    const proposals = this.getProposals();
    const idx = proposals.findIndex(p => p.id === proposalId);
    if (idx === -1) throw new Error('Proposta não encontrada.');

    const proposal = proposals[idx];
    const prevStatus = this.getStatusById(proposal.statusId);
    const newStatus = this.getStatusById(newStatusId);
    if (!newStatus) throw new Error('Status inválido.');

    const user = customUser || this.getActiveUser();
    const nowIso = new Date().toISOString();

    const oldProposalCopy = { ...proposal };

    proposal.statusId = newStatus.id;
    proposal.currentResponsible = newStatus.responsibleGroup;
    proposal.updatedAt = nowIso;

    // Specific status timestamps
    if (newStatus.code === 'AGUARDAR_RETORNO_CIP') {
      proposal.portabilitySlaStartedAt = nowIso;
    } else if (newStatus.code === 'PAGO') {
      proposal.paidAt = nowIso;
      proposal.completedAt = nowIso;
    } else if (newStatus.code === 'CANCELADO') {
      proposal.cancelledAt = nowIso;
    } else if (newStatus.code === 'REPROVADO') {
      proposal.rejectedAt = nowIso;
    }

    proposals[idx] = proposal;
    this.set(STORAGE_KEYS.PROPOSALS, proposals);

    // Record History for this proposal
    this.addStatusHistory({
      proposalId: proposal.id,
      userId: user.id,
      userName: user.name,
      previousStatusId: prevStatus?.id,
      previousStatusName: prevStatus?.name,
      newStatusId: newStatus.id,
      newStatusName: newStatus.name,
      action: 'Alteração de Status',
      observation: observation,
      origin: origin,
    });

    this.addAuditLog({
      action: 'ALTERAR_STATUS',
      entity: 'Proposal',
      entityId: proposal.id,
      previousData: JSON.stringify({ status: prevStatus?.name }),
      newData: JSON.stringify({ status: newStatus.name, observation }),
    });

    // BUSINESS AUTOMATION: REFIN DA PORTABILIDADE
    // "Quando uma PORTABILIDADE mudar para AGUARDAR RETORNO CIP,
    // o REFIN DA PORTABILIDADE relacionado deverá automaticamente mudar para AGUARDAR PORTABILIDADE"
    if (newStatus.code === 'AGUARDAR_RETORNO_CIP') {
      const product = this.getProducts().find(pr => pr.id === proposal.productId);
      if (product?.type === 'PORTABILIDADE' || product?.name.toUpperCase().includes('PORTABILIDADE')) {
        const relatedRefin = this.getRelatedRefinProposal(proposal.id);
        if (relatedRefin) {
          const aguardarPortStatus = this.getStatusByCode('AGUARDAR_PORTABILIDADE');
          if (aguardarPortStatus && relatedRefin.statusId !== aguardarPortStatus.id) {
            this.updateProposalStatus(
              relatedRefin.id,
              aguardarPortStatus.id,
              `Automação do Sistema: Portabilidade principal (ADE ${proposal.proposalNumber}) entrou em AGUARDAR RETORNO CIP`,
              {
                id: 'system',
                name: 'Sistema Automatizado',
                email: 'system@creditgestao.com.br',
                role: 'MASTER',
                active: true,
                createdAt: nowIso,
                updatedAt: nowIso,
              },
              'SISTEMA'
            );
          }
        }
      }
    }

    return proposal;
  }

  /**
   * Bulk updates status for multiple proposals
   */
  public static bulkUpdateProposalStatus(
    proposalIds: string[],
    newStatusId: string,
    observation?: string
  ): { updatedCount: number; errors: string[] } {
    const errors: string[] = [];
    let updatedCount = 0;
    const user = this.getActiveUser();

    for (const id of proposalIds) {
      try {
        this.updateProposalStatus(id, newStatusId, observation, user, 'ALTERACAO_EM_LOTE');
        updatedCount++;
      } catch (err: any) {
        errors.push(`Proposta ${id}: ${err.message}`);
      }
    }

    this.addAuditLog({
      action: 'ALTERACAO_STATUS_EM_LOTE',
      entity: 'Proposal',
      entityId: `batch-${proposalIds.length}`,
      newData: JSON.stringify({ count: updatedCount, newStatusId, observation }),
    });

    return { updatedCount, errors };
  }

  public static deleteProposal(id: string): void {
    const list = this.get<Proposal[]>(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    const target = list.find(p => p.id === id);
    if (!target) throw new Error('Proposta não encontrada.');

    const updated = list.filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PROPOSALS, updated);

    // Clean relations
    const relations = this.getProposalRelations().filter(
      r => r.portabilityProposalId !== id && r.refinProposalId !== id
    );
    this.set(STORAGE_KEYS.PROPOSAL_RELATIONS, relations);

    // Clean pendings
    const pendings = this.getPendings().filter(p => p.proposalId !== id);
    this.set(STORAGE_KEYS.PENDINGS, pendings);

    // Clean comments
    const comments = this.get<Comment[]>(STORAGE_KEYS.COMMENTS, []).filter(c => c.proposalId !== id);
    this.set(STORAGE_KEYS.COMMENTS, comments);

    // Clean histories
    const histories = this.get<ProposalStatusHistory[]>(STORAGE_KEYS.HISTORY, INITIAL_HISTORY).filter(h => h.proposalId !== id);
    this.set(STORAGE_KEYS.HISTORY, histories);

    this.addAuditLog({
      action: 'EXCLUIR_PROPOSTA',
      entity: 'Proposal',
      entityId: id,
      previousData: JSON.stringify({ proposalNumber: target.proposalNumber }),
    });
  }

  public static deleteProposals(ids: string[]): { deletedCount: number } {
    if (!ids || ids.length === 0) return { deletedCount: 0 };
    const idSet = new Set(ids);
    const list = this.get<Proposal[]>(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    const targetProposals = list.filter(p => idSet.has(p.id));
    const targetAdes = targetProposals.map(p => p.proposalNumber);
    const updated = list.filter(p => !idSet.has(p.id));
    const deletedCount = list.length - updated.length;
    this.set(STORAGE_KEYS.PROPOSALS, updated);

    const relations = this.getProposalRelations().filter(
      r => !idSet.has(r.portabilityProposalId) && !idSet.has(r.refinProposalId)
    );
    this.set(STORAGE_KEYS.PROPOSAL_RELATIONS, relations);

    const pendings = this.getPendings().filter(p => !idSet.has(p.proposalId));
    this.set(STORAGE_KEYS.PENDINGS, pendings);

    const comments = this.get<Comment[]>(STORAGE_KEYS.COMMENTS, []).filter(c => !idSet.has(c.proposalId));
    this.set(STORAGE_KEYS.COMMENTS, comments);

    const histories = this.get<ProposalStatusHistory[]>(STORAGE_KEYS.HISTORY, INITIAL_HISTORY).filter(h => !idSet.has(h.proposalId));
    this.set(STORAGE_KEYS.HISTORY, histories);

    this.addAuditLog({
      action: 'EXCLUIR_PROPOSTAS_EM_LOTE',
      entity: 'Proposal',
      entityId: `batch-${ids.length}`,
      newData: JSON.stringify({
        count: deletedCount,
        requestedCount: ids.length,
        failedCount: Math.max(0, ids.length - deletedCount),
        deletedAdes: targetAdes,
        ids,
      }),
    });

    return { deletedCount };
  }

  // Status History
  public static getHistory(): ProposalStatusHistory[] {
    return this.get<ProposalStatusHistory[]>(STORAGE_KEYS.HISTORY, INITIAL_HISTORY);
  }

  public static getStatusHistory(proposalId: string): ProposalStatusHistory[] {
    const list = this.getHistory();
    return list
      .filter(h => h.proposalId === proposalId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private static addStatusHistory(entry: Omit<ProposalStatusHistory, 'id' | 'createdAt'>): void {
    const list = this.getHistory();
    list.push({
      ...entry,
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    });
    this.set(STORAGE_KEYS.HISTORY, list);
  }

  // Comments
  public static getAllComments(): Comment[] {
    return this.get<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  }

  public static getComments(proposalId?: string): Comment[] {
    const list = this.getAllComments();
    if (!proposalId) return list;
    return list
      .filter(c => c.proposalId === proposalId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public static addComment(
    proposalIdOrData: string | { proposalId: string; text?: string; comment?: string },
    commentText?: string
  ): Comment {
    const user = this.getActiveUser();
    const list = this.get<Comment[]>(STORAGE_KEYS.COMMENTS, []);
    const proposalId = typeof proposalIdOrData === 'string' ? proposalIdOrData : proposalIdOrData.proposalId;
    const rawComment = typeof proposalIdOrData === 'string' ? commentText || '' : proposalIdOrData.text || proposalIdOrData.comment || '';

    const newComment: Comment = {
      id: `comm-${Date.now()}`,
      proposalId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      comment: rawComment.trim(),
      createdAt: new Date().toISOString(),
    };
    list.push(newComment);
    this.set(STORAGE_KEYS.COMMENTS, list);
    this.addAuditLog({
      action: 'ADICIONAR_COMENTARIO',
      entity: 'Comment',
      entityId: newComment.id,
      newData: JSON.stringify({ proposalId, comment: rawComment }),
    });
    return newComment;
  }

  // Pendings
  public static getPendings(proposalId?: string): Pending[] {
    const list = this.get<Pending[]>(STORAGE_KEYS.PENDINGS, INITIAL_PENDINGS);
    if (proposalId) {
      return list.filter(p => p.proposalId === proposalId);
    }
    return list;
  }

  public static addPendency(data: {
    proposalId: string;
    clientId?: string;
    type: any;
    description: string;
    priority?: any;
    deadline?: string;
    responsibleGroup?: Alcada;
  }): Pending {
    const prop = this.getProposalById(data.proposalId);
    return this.createPending({
      proposalId: data.proposalId,
      clientId: data.clientId || prop?.clientId || '',
      responsibleGroup: data.responsibleGroup || 'PARCEIRO',
      type: data.type,
      description: data.description,
      deadline: data.deadline,
    });
  }

  public static resolvePendency(pendingId: string, notes?: string): Pending {
    return this.resolvePending(pendingId);
  }

  public static createPending(data: {
    proposalId: string;
    clientId: string;
    responsibleGroup: Alcada;
    type: any;
    description: string;
    deadline?: string;
  }): Pending {
    const user = this.getActiveUser();
    const list = this.getPendings();
    const newPending: Pending = {
      id: `pend-${Date.now()}`,
      proposalId: data.proposalId,
      clientId: data.clientId,
      responsibleUserName: user.name,
      responsibleGroup: data.responsibleGroup,
      type: data.type,
      description: data.description,
      openedAt: new Date().toISOString(),
      deadline: data.deadline,
      status: 'ABERTA',
    };
    list.push(newPending);
    this.set(STORAGE_KEYS.PENDINGS, list);

    this.addNotification({
      proposalId: data.proposalId,
      title: 'Nova Pendência Aberta',
      message: `Pendência [${data.type}] para grupo ${data.responsibleGroup}: ${data.description}`,
      type: 'NOVA_PENDENCIA',
      priority: 'ATENCAO',
    });

    this.addAuditLog({
      action: 'CRIAR_PENDENCIA',
      entity: 'Pending',
      entityId: newPending.id,
      newData: JSON.stringify(newPending),
    });

    return newPending;
  }

  public static resolvePending(pendingId: string): Pending {
    const user = this.getActiveUser();
    const list = this.getPendings();
    const idx = list.findIndex(p => p.id === pendingId);
    if (idx === -1) throw new Error('Pendência não encontrada.');
    list[idx].status = 'RESOLVIDA';
    list[idx].resolvedAt = new Date().toISOString();
    list[idx].resolvedByUserId = user.id;
    list[idx].resolvedByUserName = user.name;
    this.set(STORAGE_KEYS.PENDINGS, list);

    this.addAuditLog({
      action: 'RESOLVER_PENDENCIA',
      entity: 'Pending',
      entityId: pendingId,
      newData: JSON.stringify({ status: 'RESOLVIDA', resolvedBy: user.name }),
    });

    return list[idx];
  }

  public static deletePendency(pendingId: string): void {
    const list = this.getPendings();
    const target = list.find(p => p.id === pendingId);
    if (!target) throw new Error('Pendência não encontrada.');
    const updated = list.filter(p => p.id !== pendingId);
    this.set(STORAGE_KEYS.PENDINGS, updated);
    this.addAuditLog({
      action: 'EXCLUIR_PENDENCIA',
      entity: 'Pending',
      entityId: pendingId,
      previousData: JSON.stringify(target),
    });
  }

  // Holidays
  public static getHolidays(): Holiday[] {
    return this.get<Holiday[]>(STORAGE_KEYS.HOLIDAYS, INITIAL_HOLIDAYS);
  }

  public static addHoliday(dateOrObj: string | { date: string; name: string }, name?: string): Holiday {
    const list = this.getHolidays();
    const date = typeof dateOrObj === 'string' ? dateOrObj : dateOrObj.date;
    const holidayName = typeof dateOrObj === 'string' ? (name || '') : dateOrObj.name;
    if (list.some(h => h.date === date)) {
      throw new Error(`Feriado na data ${date} já cadastrado.`);
    }
    const newHoliday: Holiday = {
      id: `h-${Date.now()}`,
      date,
      name: holidayName,
      active: true,
    };
    list.push(newHoliday);
    this.set(STORAGE_KEYS.HOLIDAYS, list);
    this.addAuditLog({
      action: 'CRIAR_FERIADO',
      entity: 'Holiday',
      entityId: newHoliday.id,
      newData: JSON.stringify(newHoliday),
    });
    return newHoliday;
  }

  public static createHoliday(dateOrObj: string | { date: string; name: string }, name?: string): Holiday {
    return this.addHoliday(dateOrObj, name);
  }

  public static deleteHoliday(id: string): void {
    const list = this.getHolidays().filter(h => h.id !== id);
    this.set(STORAGE_KEYS.HOLIDAYS, list);
  }

  public static toggleHoliday(id: string): void {
    const list = this.getHolidays();
    const item = list.find(h => h.id === id);
    if (item) {
      item.active = !item.active;
      this.set(STORAGE_KEYS.HOLIDAYS, list);
    }
  }

  // System Config & White Label
  public static getConfig(): SystemConfig {
    const defaultConfig: SystemConfig = {
      portabilityBalanceDays: 5,
      autoCronIntervalMinutes: 15,
      whiteLabel: {
        companyName: 'SENTINEL CONSIG',
        tradeName: 'Gestão de Produção de Consignado',
        logoUrl: '/sentinel_logo.png',
        primaryColor: '#2563eb',
        supportEmail: 'suporte@sentinelconsig.com.br',
        footerText: 'SENTINEL CONSIG © 2026 - Central de Produção de Consignado',
      },
    };
    const stored = this.get<SystemConfig>(STORAGE_KEYS.CONFIG, defaultConfig);
    const wl: Partial<WhiteLabelConfig> = { ...(stored.whiteLabel || {}) };

    if (!wl.companyName || wl.companyName === 'EVOLVE GESTÃO' || wl.companyName === 'CREDITPRO GESTÃO') {
      wl.companyName = 'SENTINEL CONSIG';
    }
    if (!wl.logoUrl || wl.logoUrl === '/evolve_logo.png' || wl.logoUrl === '/app_logo.png') {
      wl.logoUrl = '/sentinel_logo.png';
    }
    if (!wl.supportEmail || wl.supportEmail.includes('evolvegestao') || wl.supportEmail.includes('creditpro')) {
      wl.supportEmail = 'suporte@sentinelconsig.com.br';
    }
    if (!wl.footerText || wl.footerText.includes('EVOLVE GESTÃO') || wl.footerText.includes('CreditPro')) {
      wl.footerText = 'SENTINEL CONSIG © 2026 - Central de Produção de Consignado';
    }

    return {
      ...defaultConfig,
      ...stored,
      whiteLabel: {
        ...defaultConfig.whiteLabel,
        ...wl,
      },
    };
  }

  public static getWhiteLabel(): WhiteLabelConfig {
    return this.getConfig().whiteLabel || {
      companyName: 'SENTINEL CONSIG',
      tradeName: 'Gestão de Produção de Consignado',
      logoUrl: '/sentinel_logo.png',
      primaryColor: '#2563eb',
      supportEmail: 'suporte@sentinelconsig.com.br',
      footerText: 'SENTINEL CONSIG © 2026 - Central de Produção de Consignado',
    };
  }

  public static updateWhiteLabel(updates: Partial<WhiteLabelConfig>): WhiteLabelConfig {
    const currentWl = this.getWhiteLabel();
    const updatedWl = { ...currentWl, ...updates };
    this.updateConfig({ whiteLabel: updatedWl });
    return updatedWl;
  }

  // Refactored Client Lookup & Pending Data Search by CPF
  public static lookupClientAndPendingData(cpf: string): {
    client?: Client;
    pendingProposals: Proposal[];
    pendingSimulations: SimulationRequest[];
    suggestedName?: string;
    suggestedPhone?: string;
    suggestedEmail?: string;
  } {
    const cleanCpf = normalizeCpf(cpf);
    if (cleanCpf.length !== 11) {
      return { pendingProposals: [], pendingSimulations: [] };
    }

    const client = this.findClientByCpf(cleanCpf);
    const allProposals = this.getProposals();
    const allSimulations = this.getSimulationRequests();

    const pendingProposals = client
      ? allProposals.filter(p => p.clientId === client.id)
      : [];

    const pendingSimulations = allSimulations.filter(s => normalizeCpf(s.cpf) === cleanCpf);

    let suggestedName = client?.fullName && client.fullName !== 'CLIENTE NÃO NOMEADO' ? client.fullName : undefined;
    let suggestedPhone = client?.phone || undefined;
    let suggestedEmail = client?.email || undefined;

    if (!suggestedName) {
      for (const sim of pendingSimulations) {
        if (sim.matchedProposalId) {
          const prop = allProposals.find(p => p.id === sim.matchedProposalId);
          if (prop) {
            const cl = this.getClientById(prop.clientId);
            if (cl?.fullName && cl.fullName !== 'CLIENTE NÃO NOMEADO') {
              suggestedName = cl.fullName;
              if (!suggestedPhone && cl.phone) suggestedPhone = cl.phone;
              if (!suggestedEmail && cl.email) suggestedEmail = cl.email;
              break;
            }
          }
        }
      }
    }

    return {
      client,
      pendingProposals,
      pendingSimulations,
      suggestedName,
      suggestedPhone,
      suggestedEmail,
    };
  }

  public static updateConfig(updates: Partial<SystemConfig>): void {
    const cfg = { ...this.getConfig(), ...updates };
    this.set(STORAGE_KEYS.CONFIG, cfg);
    this.addAuditLog({
      action: 'CONFIGURAR_SISTEMA',
      entity: 'SystemConfig',
      entityId: 'default',
      newData: JSON.stringify(cfg),
    });
  }

  // Notifications
  public static getNotifications(): Notification[] {
    const list = this.get<Notification[]>(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static addNotification(data: Omit<Notification, 'id' | 'read' | 'createdAt'>): Notification {
    const list = this.getNotifications();
    const item: Notification = {
      ...data,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    list.unshift(item);
    this.set(STORAGE_KEYS.NOTIFICATIONS, list);
    return item;
  }

  public static markNotificationAsRead(id: string): void {
    const list = this.getNotifications();
    const item = list.find(n => n.id === id);
    if (item) {
      item.read = true;
      this.set(STORAGE_KEYS.NOTIFICATIONS, list);
    }
  }

  public static markNotificationRead(id: string): void {
    this.markNotificationAsRead(id);
  }

  public static markAllNotificationsAsRead(): void {
    const list = this.getNotifications();
    list.forEach(n => (n.read = true));
    this.set(STORAGE_KEYS.NOTIFICATIONS, list);
  }

  public static markAllNotificationsRead(): void {
    this.markAllNotificationsAsRead();
  }

  // Audit Logs
  public static getAuditLogs(): AuditLog[] {
    const list = this.get<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public static addAuditLog(data: {
    action: string;
    entity: string;
    entityId: string;
    previousData?: string;
    newData?: string;
  }): void {
    const user = this.getActiveUser();
    const list = this.get<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
    list.unshift({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      previousData: data.previousData ?? '',
      newData: data.newData ?? '',
      createdAt: new Date().toISOString(),
    });
    // Keep last 500 logs
    if (list.length > 500) list.length = 500;
    this.set(STORAGE_KEYS.AUDIT_LOGS, list);
  }

  // Export Logs
  public static getExportLogs(): ExportLog[] {
    return this.get<ExportLog[]>(STORAGE_KEYS.EXPORT_LOGS, []);
  }

  public static addExportLog(data: {
    productName: string;
    filters: string;
    quantity: number;
    fileName: string;
  }): void {
    const user = this.getActiveUser();
    const list = this.getExportLogs();
    list.unshift({
      id: `exp-${Date.now()}`,
      userId: user.id,
      userName: user.name,
      productName: data.productName,
      filters: data.filters,
      quantity: data.quantity,
      fileName: data.fileName,
      createdAt: new Date().toISOString(),
    });
    this.set(STORAGE_KEYS.EXPORT_LOGS, list);
    this.addAuditLog({
      action: 'EXPORTAR_PROPOSTAS',
      entity: 'ExportLog',
      entityId: data.fileName,
      newData: JSON.stringify(data),
    });
  }

  // Security Verification for Deletions
  public static getMasterPassword(): string {
    return '120@Jocyane';
  }

  public static verifySecurityAuth(input: string): boolean {
    const clean = (input || '').trim();
    if (!clean) return false;
    return clean === '120@Jocyane' || clean.toUpperCase() === 'EXCLUIR' || clean === this.getMasterPassword();
  }

  // System Exception & Error Logs (for mass operations and support troubleshooting)
  public static getSystemExceptionLogs(): SystemExceptionLog[] {
    const list = this.get<SystemExceptionLog[]>(STORAGE_KEYS.EXCEPTIONS, INITIAL_EXCEPTIONS);
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public static addSystemExceptionLog(data: Omit<SystemExceptionLog, 'id' | 'timestamp'>): SystemExceptionLog {
    const user = this.getActiveUser();
    const list = this.getSystemExceptionLogs();
    const entry: SystemExceptionLog = {
      id: `exc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      userId: data.userId || user.id,
      userName: data.userName || user.name,
      userRole: data.userRole || user.role,
      severity: data.severity,
      operation: data.operation,
      title: data.title,
      message: data.message,
      details: data.details,
      contextData: data.contextData,
      resolved: data.resolved ?? false,
    };
    list.unshift(entry);
    // Keep max 500 exceptions
    if (list.length > 500) list.length = 500;
    this.set(STORAGE_KEYS.EXCEPTIONS, list);
    return entry;
  }

  public static resolveSystemExceptionLog(id: string, note?: string): void {
    const user = this.getActiveUser();
    const list = this.getSystemExceptionLogs();
    const idx = list.findIndex(e => e.id === id);
    if (idx !== -1) {
      list[idx].resolved = true;
      list[idx].resolvedAt = new Date().toISOString();
      list[idx].resolvedBy = `${user.name} (${user.role})${note ? ` - ${note}` : ''}`;
      this.set(STORAGE_KEYS.EXCEPTIONS, list);
    }
  }

  public static clearSystemExceptionLogs(): void {
    this.set(STORAGE_KEYS.EXCEPTIONS, []);
  }

  // ==========================================
  // CONTROLE DE SOLICITAÇÕES DE SIMULAÇÃO
  // ==========================================

  public static syncAllSimulationMatching(): number {
    const requests = this.get<SimulationRequest[]>(STORAGE_KEYS.SIMULATION_REQUESTS, INITIAL_SIMULATION_REQUESTS);
    const pendingRequests = requests.filter(sim => sim.status === 'SIMULAÇÃO ENVIADA');
    if (pendingRequests.length === 0) return 0;

    const proposals = this.getProposals();
    const clients = this.getClients();
    const users = this.getUsers();

    let matchedCount = 0;
    const updatedRequests = requests.map(sim => {
      if (sim.status !== 'SIMULAÇÃO ENVIADA') return sim;

      const simCpf = normalizeCpf(sim.cpf);
      if (!simCpf) return sim;

      // Find any proposal matching this CPF
      const matchingProposal = proposals.find(p => {
        const client = clients.find(c => c.id === p.clientId);
        return client && client.cpf && normalizeCpf(client.cpf) === simCpf;
      });

      if (matchingProposal) {
        matchedCount++;
        const digitizer = users.find(u => u.id === matchingProposal.digitizerId);
        const matchedAt = new Date().toISOString();
        return {
          ...sim,
          status: 'DIGITADA PELA MESA' as SimulationStatus,
          matchedProposalId: matchingProposal.id,
          matchedProposalNumber: matchingProposal.proposalNumber,
          matchedDigitizerId: matchingProposal.digitizerId,
          matchedDigitizerName: digitizer?.name || 'Digitador',
          matchedAt,
          updatedAt: matchedAt,
        };
      }

      return sim;
    });

    if (matchedCount > 0) {
      this.set(STORAGE_KEYS.SIMULATION_REQUESTS, updatedRequests);
    }

    return matchedCount;
  }

  public static getSimulationRequests(): SimulationRequest[] {
    const requests = this.get<SimulationRequest[]>(STORAGE_KEYS.SIMULATION_REQUESTS, INITIAL_SIMULATION_REQUESTS);
    const nowMs = Date.now();
    const MAX_PENDING_MS = 72 * 60 * 60 * 1000; // 72 hours

    let modified = false;
    const updatedRequests = requests.map(sim => {
      if (sim.status === 'SIMULAÇÃO ENVIADA') {
        const createdMs = new Date(sim.createdAt).getTime();
        if (nowMs - createdMs >= MAX_PENDING_MS) {
          modified = true;
          const updated: SimulationRequest = {
            ...sim,
            status: 'PERDIDA (NÃO DIGITADA)',
            updatedAt: new Date().toISOString(),
          };

          this.addAuditLog({
            action: 'EXPIRACAO_AUTOMATICA_SIMULACAO_72H',
            entity: 'SimulationRequest',
            entityId: sim.id,
            previousData: JSON.stringify({ status: sim.status }),
            newData: JSON.stringify({
              origin: 'SYSTEM/AUTOMATIC',
              status: 'PERDIDA (NÃO DIGITADA)',
              reason: 'Simulação expirou o prazo máximo de 72 horas sem digitação de proposta pela mesa',
              expiredAt: new Date().toISOString(),
            }),
          });

          return updated;
        }
      }
      return sim;
    });

    if (modified) {
      this.set(STORAGE_KEYS.SIMULATION_REQUESTS, updatedRequests);
    }

    // Auto-sync matching simulations with proposals by CPF
    this.syncAllSimulationMatching();

    return this.get<SimulationRequest[]>(STORAGE_KEYS.SIMULATION_REQUESTS, INITIAL_SIMULATION_REQUESTS);
  }

  public static getSimulationRequestById(id: string): SimulationRequest | undefined {
    return this.getSimulationRequests().find(s => s.id === id);
  }

  /**
   * Cria uma nova solicitação de simulação.
   * Regras:
   * - CPF normalizado (11 dígitos numéricos).
   * - Parceiro obrigatório (selecionado do cadastro).
   * - Responsável: preenchido automaticamente com o usuário logado (activeUser).
   * - Status inicial: SIMULAÇÃO ENVIADA.
   * - Não duplicar ou criar estruturas desnecessárias.
   */
  public static createSimulationRequest(data: {
    cpf: string;
    partnerId: string;
    status?: SimulationStatus;
    rejectionReason?: string;
  }): SimulationRequest {
    const rawCpf = data.cpf || '';
    const cleanCpf = normalizeCpf(rawCpf);
    if (!cleanCpf || cleanCpf.length !== 11) {
      throw new Error('CPF do cliente inválido. O CPF deve conter exatamente 11 dígitos.');
    }

    const partner = this.getPartners().find(p => p.id === data.partnerId);
    if (!partner) {
      throw new Error('Parceiro selecionado não encontrado no cadastro mestre.');
    }

    const activeUser = this.getActiveUser();
    const requests = this.getSimulationRequests();

    let initialStatus: SimulationStatus = data.status || 'SIMULAÇÃO ENVIADA';
    let matchedData: Partial<SimulationRequest> = {};

    // Automatic check: if creating as 'SIMULAÇÃO ENVIADA', check if a proposal already exists for this CPF
    if (initialStatus === 'SIMULAÇÃO ENVIADA') {
      const existingProposals = this.getProposals();
      const matchingProposal = existingProposals.find(p => {
        const client = this.getClientById(p.clientId);
        return client && normalizeCpf(client.cpf) === cleanCpf;
      });

      if (matchingProposal) {
        const digitizer = this.getUserById(matchingProposal.digitizerId);
        initialStatus = 'DIGITADA PELA MESA';
        matchedData = {
          matchedProposalId: matchingProposal.id,
          matchedProposalNumber: matchingProposal.proposalNumber,
          matchedDigitizerId: matchingProposal.digitizerId,
          matchedDigitizerName: digitizer?.name || 'Digitador',
          matchedAt: new Date().toISOString(),
        };
      }
    }

    const newRequest: SimulationRequest = {
      id: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      cpf: cleanCpf,
      partnerId: partner.id,
      createdById: activeUser.id,
      status: initialStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...matchedData,
    };

    requests.unshift(newRequest);
    this.set(STORAGE_KEYS.SIMULATION_REQUESTS, requests);

    this.addAuditLog({
      action: 'CRIAR_SOLICITACAO_SIMULACAO',
      entity: 'SimulationRequest',
      entityId: newRequest.id,
      newData: JSON.stringify({
        cpf: cleanCpf,
        partnerId: partner.id,
        partnerLogin: partner.login,
        createdById: activeUser.id,
        createdByName: activeUser.name,
        status: newRequest.status,
        rejectionReason: data.rejectionReason,
        ...matchedData,
      }),
    });

    return newRequest;
  }

  public static createSimulationsBatch(items: { cpf: string; partnerIdentifier: string; defaultPartnerId?: string }[]): {
    createdCount: number;
    errors: string[];
    createdSimulations: SimulationRequest[];
  } {
    const partners = this.getPartners();
    const activeUser = this.getActiveUser();
    const requests = this.getSimulationRequests();
    const errors: string[] = [];
    const createdSimulations: SimulationRequest[] = [];
    const nowIso = new Date().toISOString();

    items.forEach((item, index) => {
      const rowNum = index + 1;
      const cleanCpf = normalizeCpf(item.cpf || '');
      if (!cleanCpf || cleanCpf.length !== 11) {
        errors.push(`Linha ${rowNum}: CPF '${item.cpf}' é inválido (deve conter 11 dígitos).`);
        return;
      }

      const identifier = (item.partnerIdentifier || '').trim().toUpperCase();
      let partner = partners.find(
        p => p.id === identifier ||
             p.login.toUpperCase() === identifier ||
             extractPartnerCode(p.login) === identifier ||
             p.fullName.toUpperCase().includes(identifier)
      );

      if (!partner && item.defaultPartnerId) {
        partner = partners.find(p => p.id === item.defaultPartnerId);
      }

      if (!partner) {
        errors.push(`Linha ${rowNum}: Parceiro '${item.partnerIdentifier}' não encontrado.`);
        return;
      }

      const newSim: SimulationRequest = {
        id: `sim-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${index}`,
        cpf: cleanCpf,
        partnerId: partner.id,
        createdById: activeUser.id,
        status: 'SIMULAÇÃO ENVIADA',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      requests.unshift(newSim);
      createdSimulations.push(newSim);
    });

    if (createdSimulations.length > 0) {
      this.set(STORAGE_KEYS.SIMULATION_REQUESTS, requests);
      this.addAuditLog({
        action: 'IMPORTACAO_EM_MASSA_SIMULACOES',
        entity: 'SimulationRequest',
        entityId: `batch-sim-${Date.now()}`,
        newData: JSON.stringify({
          count: createdSimulations.length,
          importedBy: activeUser.name,
        }),
      });
    }

    return {
      createdCount: createdSimulations.length,
      errors,
      createdSimulations,
    };
  }

  /**
   * Atualiza status da simulação pela equipe.
   * Regras:
   * - A equipe pode alterar: SIMULAÇÃO ENVIADA -> NÃO PASSÍVEL DE CONTRATAÇÃO.
   * - A equipe NÃO PODE definir manualmente: DIGITADA PELA MESA.
   */
  public static updateSimulationRequestStatus(
    id: string,
    newStatus: SimulationStatus,
    reasonOrOptions?: string | { reason?: string; proposalNumber?: string; proposalId?: string; digitizerName?: string }
  ): SimulationRequest {
    const options = typeof reasonOrOptions === 'string' ? { reason: reasonOrOptions } : reasonOrOptions || {};

    const requests = this.getSimulationRequests();
    const index = requests.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('Solicitação de simulação não encontrada.');
    }

    const current = requests[index];
    const prevData = JSON.stringify(current);
    const activeUser = this.getActiveUser();

    const updated: SimulationRequest = {
      ...current,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    if (newStatus === 'DIGITADA PELA MESA') {
      updated.matchedProposalNumber = options.proposalNumber || current.matchedProposalNumber || 'DIGITADA';
      updated.matchedProposalId = options.proposalId || current.matchedProposalId;
      updated.matchedDigitizerName = options.digitizerName || current.matchedDigitizerName || activeUser.name;
      updated.matchedAt = new Date().toISOString();
    } else if (newStatus === 'NÃO PASSÍVEL DE CONTRATAÇÃO') {
      updated.rejectionReason = options.reason || 'Inviável / Não passível de contratação';
    }

    requests[index] = updated;
    this.set(STORAGE_KEYS.SIMULATION_REQUESTS, requests);

    this.addAuditLog({
      action: 'ALTERAR_STATUS_SIMULACAO',
      entity: 'SimulationRequest',
      entityId: id,
      previousData: prevData,
      newData: JSON.stringify({
        status: newStatus,
        reason: options.reason || 'Alterado no painel de simulações',
        proposalNumber: updated.matchedProposalNumber,
        updatedBy: activeUser.name,
      }),
    });

    return updated;
  }

  /**
   * Identificação e correspondência automática de simulação com proposta digitada pela mesa.
   * Regra estrita: Correspondência por CPF + PARCEIRO.
   * Quando identificado:
   * - Status vira DIGITADA PELA MESA
   * - Registra matchedProposalId, matchedProposalNumber (ADE), matchedAt, matchedDigitizer
   * - Registra na auditoria com origem SYSTEM/AUTOMATIC
   */
  /**
   * Verifica permissão de alteração de status para NÃO PASSÍVEL DE CONTRATAÇÃO.
   * Regra: Perfis operacionais e gerenciais podem alterar se a simulação estiver em SIMULAÇÃO ENVIADA.
   */
  public static canChangeSimulationStatus(user: User, simulation: SimulationRequest): boolean {
    if (simulation.status === 'DIGITADA PELA MESA' || simulation.status === 'PERDIDA (NÃO DIGITADA)') return false;
    return ['MASTER', 'GESTOR', 'GERENTE', 'SUPORTE', 'DIGITADOR'].includes(user.role);
  }

  /**
   * Verifica permissão para exclusão de simulação.
   * Regra: MASTER, GESTOR e GERENTE podem excluir qualquer simulação.
   * DIGITADOR/SUPORTE podem excluir apenas solicitações criadas por eles próprios e que ainda não foram digitadas.
   */
  public static canDeleteSimulationRequest(user: User, simulation: SimulationRequest): boolean {
    if (['MASTER', 'GESTOR', 'GERENTE'].includes(user.role)) {
      return true;
    }
    if (['SUPORTE', 'DIGITADOR'].includes(user.role)) {
      return simulation.createdById === user.id && simulation.status !== 'DIGITADA PELA MESA';
    }
    return false;
  }

  /**
   * Exclui uma solicitação de simulação com validação e auditoria.
   */
  /**
   * Verifica se já existe uma solicitação pendente para o mesmo CPF + Parceiro com status SIMULAÇÃO ENVIADA.
   */
  public static checkExistingPendingSimulation(cpf: string, partnerId: string): SimulationRequest | undefined {
    const cleanCpf = normalizeCpf(cpf);
    if (!cleanCpf) return undefined;
    return this.getSimulationRequests().find(
      s => normalizeCpf(s.cpf) === cleanCpf && s.partnerId === partnerId && s.status === 'SIMULAÇÃO ENVIADA'
    );
  }

  /**
   * Exclui uma solicitação de simulação com validação e auditoria.
   */
  public static deleteSimulationRequest(id: string, reason?: string): boolean {
    const requests = this.getSimulationRequests();
    const index = requests.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error('Solicitação de simulação não encontrada.');
    }

    const sim = requests[index];
    const activeUser = this.getActiveUser();

    if (!this.canDeleteSimulationRequest(activeUser, sim)) {
      throw new Error('Você não possui permissão para excluir esta solicitação de simulação.');
    }

    const deletedData = JSON.stringify(sim);
    requests.splice(index, 1);
    this.set(STORAGE_KEYS.SIMULATION_REQUESTS, requests);

    this.addAuditLog({
      action: 'EXCLUIR_SOLICITACAO_SIMULACAO',
      entity: 'SimulationRequest',
      entityId: id,
      previousData: deletedData,
      newData: JSON.stringify({
        deletedBy: activeUser.name,
        userRole: activeUser.role,
        reason: reason || 'Exclusão solicitada pelo usuário',
        deletedAt: new Date().toISOString(),
      }),
    });

    return true;
  }

  /**
   * Exclusão em massa de solicitações de simulação com validação individual de permissão e auditoria.
   */
  public static bulkDeleteSimulationRequests(
    ids: string[],
    reason?: string
  ): { successCount: number; errors: string[] } {
    if (!ids || ids.length === 0) {
      return { successCount: 0, errors: [] };
    }

    const activeUser = this.getActiveUser();
    let requests = this.getSimulationRequests();
    const errors: string[] = [];
    let successCount = 0;

    const idsToDeleteSet = new Set(ids);
    const remainingRequests: SimulationRequest[] = [];

    for (const sim of requests) {
      if (idsToDeleteSet.has(sim.id)) {
        if (!this.canDeleteSimulationRequest(activeUser, sim)) {
          errors.push(`Sem permissão para excluir simulação CPF ${formatCpf(sim.cpf)} (${sim.id}).`);
          remainingRequests.push(sim);
        } else {
          successCount++;
          this.addAuditLog({
            action: 'EXCLUSAO_EM_MASSA_SIMULACAO',
            entity: 'SimulationRequest',
            entityId: sim.id,
            previousData: JSON.stringify(sim),
            newData: JSON.stringify({
              deletedBy: activeUser.name,
              userRole: activeUser.role,
              reason: reason || 'Exclusão em massa solicitada pelo usuário',
              deletedAt: new Date().toISOString(),
            }),
          });
        }
      } else {
        remainingRequests.push(sim);
      }
    }

    if (successCount > 0) {
      this.set(STORAGE_KEYS.SIMULATION_REQUESTS, remainingRequests);
    }

    return { successCount, errors };
  }

  public static getClientById(id: string): Client | undefined {
    if (!id) return undefined;
    const found = this.getClients().find(c => c.id === id);
    if (found) {
      if (!found.fullName || !found.fullName.trim()) {
        found.fullName = 'CLIENTE NÃO NOMEADO';
      }
      return found;
    }
    return undefined;
  }

  public static getUserById(id: string): User | undefined {
    return this.getUsers().find(u => u.id === id);
  }

  /**
   * Identificação e correspondência automática de simulação com proposta digitada pela mesa.
   * Regra estrita: Correspondência por CPF + PARCEIRO.
   * Se houver várias solicitações pendentes, vincula a mais antiga (createdAt ascendente).
   * Quando identificado:
   * - Status vira DIGITADA PELA MESA
   * - Registra matchedProposalId, matchedProposalNumber (ADE), matchedAt, matchedDigitizer
   * - Registra na auditoria com origem SYSTEM
   */
  public static processSimulationMatching(proposal: Proposal): number {
    const client = this.getClientById(proposal.clientId);
    if (!client || !client.cpf) return 0;

    const normalizedProposalCpf = normalizeCpf(client.cpf);
    if (!normalizedProposalCpf) return 0;

    const partnerId = proposal.partnerId;
    const proposalPartner = this.getPartners().find(p => p.id === partnerId);
    const proposalPartnerCode = proposalPartner ? extractPartnerCode(proposalPartner.login) : '';

    const requests = this.getSimulationRequests();

    // Find all matching pending requests (status = 'SIMULAÇÃO ENVIADA' and normalized CPF matches)
    const pendingMatches = requests
      .filter(sim => {
        if (sim.status !== 'SIMULAÇÃO ENVIADA') return false;
        const simCpf = normalizeCpf(sim.cpf);
        if (simCpf !== normalizedProposalCpf) return false;

        // Partner matching logic: exact partnerId OR matching partner code OR match by CPF
        if (sim.partnerId === partnerId) return true;

        if (proposalPartnerCode) {
          const simPartner = this.getPartners().find(p => p.id === sim.partnerId);
          const simPartnerCode = simPartner ? extractPartnerCode(simPartner.login) : '';
          if (simPartnerCode && simPartnerCode === proposalPartnerCode) return true;
        }

        // Default match if CPF is identical and pending simulation exists
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (pendingMatches.length === 0) return 0;

    // Rule 10: Prefer oldest pending request
    const targetSim = pendingMatches[0];
    const matchedAt = new Date().toISOString();
    const digitizer = this.getUserById(proposal.digitizerId);

    const updatedRequests = requests.map(sim => {
      if (sim.id === targetSim.id) {
        return {
          ...sim,
          status: 'DIGITADA PELA MESA' as SimulationStatus,
          matchedProposalId: proposal.id,
          matchedProposalNumber: proposal.proposalNumber,
          matchedDigitizerId: proposal.digitizerId,
          matchedDigitizerName: digitizer?.name || 'Digitador',
          matchedAt,
          updatedAt: matchedAt,
        };
      }
      return sim;
    });

    this.set(STORAGE_KEYS.SIMULATION_REQUESTS, updatedRequests);

    // Register audit log with SYSTEM origin and exact required text
    this.addAuditLog({
      action: 'SIMULAÇÃO VINCULADA AUTOMATICAMENTE À PROPOSTA',
      entity: 'SimulationRequest',
      entityId: targetSim.id,
      previousData: JSON.stringify({ status: targetSim.status }),
      newData: JSON.stringify({
        origin: 'SYSTEM',
        status: 'DIGITADA PELA MESA',
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        digitizerId: proposal.digitizerId,
        digitizerName: digitizer?.name || 'Digitador',
        matchedAt,
      }),
    });

    return 1;
  }

  public static matchSimulationRequestsForProposal(proposal: Proposal): number {
    return this.processSimulationMatching(proposal);
  }
}

/**
 * Função utilitária standalone exportada para processamento de correspondência de simulações.
 */
export function processSimulationMatching(proposal: Proposal): number {
  return StorageService.processSimulationMatching(proposal);
}

