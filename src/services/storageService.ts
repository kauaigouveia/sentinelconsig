import { normalizeProposalType } from '../lib/proposalTypeNormalizer';
import {
  User,
  Promoter,
  Bank,
  BankPromoter,
  Partner,
  Product,
  Convenio,
  OperationalRule,
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
  Tenant,
  TenantPlan,
  TenantStatus,
  DocumentItem,
  DocumentType,
  ClientCommunication,
  ClientNote,
  OperationalTask,
  FinancialEntry,
  GamificationAchievement,
  CommercialInsight,
  AIChatMessage,
} from '../types';
import { normalizeCpf, formatCpf, extractPartnerCode, calculateBusinessDays, isBusinessDay } from '../lib/utils';
import { isValidRole } from '../lib/roleUtils';
import { toastService } from '../components/ui/toastService';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where, onSnapshot } from 'firebase/firestore';

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

export function computeSha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isPrime = (n: number) => {
    for (let factor = 2; factor * factor <= n; factor++) {
      if (n % factor === 0) return false;
    }
    return true;
  };

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 1 / 2) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (i = 0; i < ascii[lengthProperty]; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
  }

  for (j = 0; j < words[lengthProperty]; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

const STORAGE_KEYS = {
  USERS: 'cg_users',
  ACTIVE_USER: 'cg_active_user',
  TENANTS: 'cg_tenants',
  CURRENT_TENANT_ID: 'cg_current_tenant_id',
  PROMOTERS: 'cg_promoters',
  BANKS: 'cg_banks',
  BANK_PROMOTERS: 'cg_bank_promoters',
  PARTNERS: 'cg_partners',
  PRODUCTS: 'cg_products',
  CONVENIOS: 'cg_convenios',
  OPERATIONAL_RULES: 'cg_operational_rules',
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
  DOCUMENTS: 'cg_documents',
  COMMUNICATIONS: 'cg_communications',
  CLIENT_NOTES: 'cg_client_notes',
  OPERATIONAL_TASKS: 'cg_operational_tasks',
  FINANCIAL_ENTRIES: 'cg_financial_entries',
  ACHIEVEMENTS: 'cg_achievements',
  BACKUP_SNAPSHOTS: 'cg_backup_snapshots',
  CONFIG: 'cg_config',
};

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: 'tenant_evolve',
    name: 'SENTINEL CONSIG',
    slug: 'evolve',
    customDomain: 'app.sentinelevolve.com.br',
    cnpj: '48.912.456/0001-80',
    razaoSocial: 'Sentinel Consig Tecnologia em Crédito LTDA',
    tradeName: 'Sentinel Consig Operações',
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
    maxUsers: 50,
    storageLimitMb: 5000,
    modules: ['ALL'],
    simulationAccessEnabled: true,
    happySimulationAccessEnabled: true,
    adminEmail: 'platform@creditgestao.com.br',
    adminName: 'Kauai Gouveia',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    whiteLabel: {
      companyName: 'SENTINEL CONSIG',
      tradeName: 'Inteligência que antecipa. Controle que transforma.',
      cnpj: '48.912.456/0001-80',
      logoUrl: '',
      primaryColor: '#2563eb',
      accentColor: '#4f46e5',
      supportEmail: 'suporte@creditgestao.com.br',
      supportPhone: '(11) 98765-4321',
      footerText: 'Sentinel Consig — Inteligência que antecipa. Controle que transforma.',
    },
  },
  {
    id: 'tenant_credmais',
    name: 'CredMais Soluções Financeiras',
    slug: 'credmais',
    customDomain: 'sistema.credmais.com.br',
    cnpj: '33.123.456/0001-90',
    razaoSocial: 'CredMais Correspondente Bancário LTDA',
    tradeName: 'CredMais Consignados',
    plan: 'PRO',
    status: 'ACTIVE',
    maxUsers: 15,
    storageLimitMb: 1500,
    modules: ['ALL'],
    simulationAccessEnabled: true,
    happySimulationAccessEnabled: true,
    adminEmail: 'contato@credmais.com.br',
    adminName: 'Marcos Vinicius',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    whiteLabel: {
      companyName: 'CredMais Finanças',
      tradeName: 'Mesa de Crédito & Portabilidade',
      cnpj: '33.123.456/0001-90',
      logoUrl: '',
      primaryColor: '#059669',
      accentColor: '#0d9488',
      supportEmail: 'suporte@credmais.com.br',
      supportPhone: '(21) 99876-5432',
      footerText: 'CredMais - Soluções Ágeis em Crédito',
    },
  },
];

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
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'u-gestor',
    name: 'Carlos Mendes',
    email: 'gestor@creditgestao.com.br',
    role: 'GESTOR',
    active: true,
    createdAt: '2026-01-02T08:00:00.000Z',
    updatedAt: '2026-01-02T08:00:00.000Z',
  },
  {
    id: 'u-gerente',
    name: 'Juliana Rocha',
    email: 'gerente@creditgestao.com.br',
    role: 'GERENTE',
    active: true,
    createdAt: '2026-01-03T08:00:00.000Z',
    updatedAt: '2026-01-03T08:00:00.000Z',
  },
  {
    id: 'u-suporte',
    name: 'Lucas Ferreira',
    email: 'suporte@creditgestao.com.br',
    role: 'SUPORTE',
    active: true,
    createdAt: '2026-01-04T08:00:00.000Z',
    updatedAt: '2026-01-04T08:00:00.000Z',
  },
  {
    id: 'u-digitador',
    name: 'Ana Beatriz',
    email: 'digitador@creditgestao.com.br',
    role: 'DIGITADOR',
    active: true,
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
  },
  {
    id: 'u-simulacao',
    name: 'Canal de Simulação',
    email: 'simulacao@creditgestao.com.br',
    role: 'SIMULACAO',
    active: true,
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

// Initial Convenios (21 Convênios Globais do Sentinel Consig)
const INITIAL_CONVENIOS: Convenio[] = [
  { id: 'conv-autarquias', name: 'AUTARQUIAS', code: 'AUTARQUIAS', description: 'Servidores e pensionistas de autarquias públicas', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-boleto', name: 'BOLETO', code: 'BOLETO', description: 'Crédito com liquidação via boleto bancário', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-cartao', name: 'CARTAO', code: 'CARTAO', description: 'Operações vinculadas a cartão consignado', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-consorcio', name: 'CONSÓRCIO', code: 'CONSORCIO', description: 'Consórcio e cartas de crédito contempladas', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-conta-simples', name: 'CONTA SIMPLES', code: 'CONTA_SIMPLES', description: 'Convênio de crédito em conta simples', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-credito-pessoal', name: 'CRÉDITO PESSOAL', code: 'CREDITO_PESSOAL', description: 'Crédito pessoal sem consignação em folha', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-debito-conta', name: 'DÉBITO EM CONTA', code: 'DEBITO_CONTA', description: 'Crédito consignado com débito em conta corrente', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-especial', name: 'ESPECIAL', code: 'ESPECIAL', description: 'Convênios especiais e regimes diferenciados', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-estadual', name: 'ESTADUAL', code: 'ESTADUAL', description: 'Servidores públicos estaduais', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-federal', name: 'FEDERAL', code: 'FEDERAL', description: 'Servidores públicos do poder executivo federal', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-fgts', name: 'FGTS', code: 'FGTS', description: 'Antecipação do Saque Aniversário FGTS', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-fit-energia', name: 'FIT ENERGIA', code: 'FIT_ENERGIA', description: 'Crédito associado a concessionárias de energia', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-imobiliario', name: 'IMOBILIÁRIO', code: 'IMOBILIARIO', description: 'Crédito com garantia imobiliária / Home Equity', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-inss', name: 'INSS', code: 'INSS', description: 'Beneficiários e Pensionistas do INSS', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-militar', name: 'MILITAR', code: 'MILITAR', description: 'Forças Armadas e pensionistas militares', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-municipal', name: 'MUNICIPAL', code: 'MUNICIPAL', description: 'Servidores públicos municipais e prefeituras', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-privado', name: 'PRIVADO', code: 'PRIVADO', description: 'Funcionários de empresas privadas com convênio CLT', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-publico', name: 'PUBLICO', code: 'PUBLICO', description: 'Servidores públicos em geral', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-saque-facil', name: 'SAQUE FACIL', code: 'SAQUE_FACIL', description: 'Operação de saque fácil e antecipação de limites', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-seguro', name: 'SEGURO', code: 'SEGURO', description: 'Convênio para contratação de seguros e assistências', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'conv-siape', name: 'SIAPE', code: 'SIAPE', description: 'Servidores Públicos Federais - Sistema SIAPE', scope: 'GLOBAL', active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// Initial Products (13 Produtos Globais do Sentinel Consig)
const INITIAL_PRODUCTS: Product[] = [
  { id: 'prod-agreg-margem', name: 'AGREG. DE MARGEM', code: 'AGREG_MARGEM', description: 'Agregação de margem consignável', type: 'NOVO', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-cartao', name: 'CARTAO', code: 'CARTAO', description: 'Cartão de crédito consignado', type: 'CARTAO_RMC', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-cartao-com-saque', name: 'CARTÃO COM SAQUE', code: 'CARTAO_COM_SAQUE', description: 'Cartão consignado com saque autorizado', type: 'CARTAO_RMC', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-cartao-sem-saque', name: 'CARTÃO SEM SAQUE', code: 'CARTAO_SEM_SAQUE', description: 'Cartão consignado sem operação de saque', type: 'CARTAO_RMC', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-compra', name: 'COMPRA', code: 'COMPRA', description: 'Compra de dívida / portabilidade com troco', type: 'PORTABILIDADE', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-conta-simples', name: 'CONTA SIMPLES', code: 'CONTA_SIMPLES', description: 'Operação de crédito em conta simples', type: 'NOVO', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-novo', name: 'NOVO', code: 'NOVO', description: 'Contrato novo consignado', type: 'NOVO', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-portab-refin', name: 'PORTAB/REFIN', code: 'PORTAB_REFIN', description: 'Portabilidade associada a refinanciamento', type: 'REFIN_PORTABILIDADE', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: true, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-portabilidade', name: 'PORTABILIDADE', code: 'PORTABILIDADE', description: 'Portabilidade de crédito consignado', type: 'PORTABILIDADE', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-refin-recorrente', name: 'REFIN.RECORRENTE', code: 'REFIN_RECORRENTE', description: 'Refinanciamento recorrente de contrato', type: 'REFIN', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-refinanciamento', name: 'REFINANCIAMENTO', code: 'REFINANCIAMENTO', description: 'Refinanciamento de contrato ativo', type: 'REFIN', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-saque-compl', name: 'SAQUE COMPL.', code: 'SAQUE_COMPL', description: 'Saque complementar de limite consignado', type: 'SAQUE_COMPLEMENTAR', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'prod-seguros', name: 'SEGUROS', code: 'SEGUROS', description: 'Proteção financeira e seguro prestamista', type: 'NOVO', scope: 'GLOBAL', allowsMultipleAde: true, requiresPortabilityRelation: false, convenioIds: [], active: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// Initial Operational Rules
const INITIAL_OPERATIONAL_RULES: OperationalRule[] = [
  {
    id: 'rule-inss-padrao',
    name: 'Regra Padrão INSS',
    description: 'Parâmetros operacionais para contratos de convênio INSS',
    scope: 'GLOBAL',
    active: true,
    appliesToAllProducts: true,
    productIds: [],
    appliesToAllConvenios: false,
    convenioIds: ['conv-inss'],
    minInstallments: 12,
    maxInstallments: 84,
    minContractValue: 200,
    maxContractValue: 100000,
    requiresCipBalance: false,
    allowsMultipleAde: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'rule-portabilidade-geral',
    name: 'Regra Geral de Portabilidade',
    description: 'Exige quitação e validação de saldo devedor retornado',
    scope: 'GLOBAL',
    active: true,
    appliesToAllProducts: false,
    productIds: ['prod-port', 'prod-refin-port'],
    appliesToAllConvenios: true,
    convenioIds: [],
    minInstallments: 12,
    maxInstallments: 96,
    minContractValue: 1000,
    maxContractValue: 250000,
    requiresCipBalance: true,
    allowsMultipleAde: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
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
    contractBalance: 14850.00,
    disbursedValue: 0,
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
    disbursedValue: 4320.50,
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
    contractBalance: 8750.00,
    disbursedValue: 0,
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
    disbursedValue: 2150.00,
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
    disbursedValue: 12500.00,
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
    disbursedValue: 8000.00,
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

// Initial Client Documents
const INITIAL_DOCUMENTS: DocumentItem[] = [
  {
    id: 'doc-1',
    tenantId: 'tenant_evolve',
    clientId: 'cli-maria-jose',
    proposalId: 'prop-833085808',
    name: 'RG_Frente_Verso_MariaJose.pdf',
    type: 'RG',
    fileUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&auto=format&fit=crop',
    fileSizeBytes: 1450200,
    uploadedByUserId: 'u-digitador',
    uploadedByUserName: 'Ana Beatriz (Digitadora)',
    createdAt: fourBusinessDaysAgo,
    updatedAt: fourBusinessDaysAgo,
  },
  {
    id: 'doc-2',
    tenantId: 'tenant_evolve',
    clientId: 'cli-maria-jose',
    proposalId: 'prop-833085808',
    name: 'Contracheque_INSS_Agosto_2026.pdf',
    type: 'CONTRACHEQUE',
    fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop',
    fileSizeBytes: 850400,
    uploadedByUserId: 'u-digitador',
    uploadedByUserName: 'Ana Beatriz (Digitadora)',
    createdAt: fourBusinessDaysAgo,
    updatedAt: fourBusinessDaysAgo,
  },
  {
    id: 'doc-3',
    tenantId: 'tenant_evolve',
    clientId: 'cli-maria-jose',
    name: 'Extrato_Bancario_Consignado.pdf',
    type: 'EXTRATO',
    fileUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=600&auto=format&fit=crop',
    fileSizeBytes: 620000,
    uploadedByUserId: 'u-digitador',
    uploadedByUserName: 'Ana Beatriz (Digitadora)',
    createdAt: fourBusinessDaysAgo,
    updatedAt: fourBusinessDaysAgo,
  },
];

// Initial Client Communications
const INITIAL_COMMUNICATIONS: ClientCommunication[] = [
  {
    id: 'comm-1',
    tenantId: 'tenant_evolve',
    clientId: 'cli-maria-jose',
    proposalId: 'prop-833085808',
    channel: 'WHATSAPP',
    templateName: 'Notificação de CIP Iniciado',
    eventType: 'PROPOSTA_CRIADA',
    recipient: '(11) 98765-4321',
    messageContent: 'Olá Maria José! Sua proposta de portabilidade C6 Bank (ADE 833085808) foi formalizada e entrou no processamento da CIP. Acompanhe conosco!',
    status: 'ENVIADO',
    sentByUserId: 'u-digitador',
    sentByUserName: 'Ana Beatriz (Digitadora)',
    createdAt: fourBusinessDaysAgo,
  },
  {
    id: 'comm-2',
    tenantId: 'tenant_evolve',
    clientId: 'cli-maria-jose',
    proposalId: 'prop-833085808',
    channel: 'WHATSAPP',
    templateName: 'Aviso 4º Dia Útil CIP',
    eventType: 'AVULSO',
    recipient: '(11) 98765-4321',
    messageContent: 'Prezada Maria José, sua portabilidade está no 4º dia útil em CIP e estamos monitorando a liberação do saldo devedor.',
    status: 'ENVIADO',
    sentByUserId: 'u-suporte',
    sentByUserName: 'Lucas Ferreira (Suporte)',
    createdAt: oneDayAgo,
  },
];

// Initial Client Notes
const INITIAL_CLIENT_NOTES: ClientNote[] = [
  {
    id: 'note-1',
    tenantId: 'tenant_evolve',
    clientId: 'cli-maria-jose',
    proposalId: 'prop-833085808',
    authorId: 'u-digitador',
    authorName: 'Ana Beatriz (Digitadora)',
    note: 'Cliente confirmou os dados bancários para o pagamento do Refin assim que o saldo CIP retornar.',
    createdAt: fourBusinessDaysAgo,
  },
];

// Initial Operational Tasks
const INITIAL_OPERATIONAL_TASKS: OperationalTask[] = [
  {
    id: 'task-1',
    tenantId: 'tenant_evolve',
    title: 'Monitorar Retorno CIP (5º Dia Útil) - Maria José',
    description: 'Verificar resposta do banco credor para a ADE 833085808 (Portabilidade C6 Bank).',
    category: 'SALDO_CIP',
    priority: 'URGENTE',
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    completed: false,
    assignedUserId: 'u-suporte',
    assignedUserName: 'Lucas Ferreira',
    clientId: 'cli-maria-jose',
    clientName: 'MARIA JOSE ALEXANDRE',
    proposalId: 'prop-833085808',
    proposalNumber: '833085808',
    partnerId: 'part-kauai',
    partnerName: 'KAUAI@16740',
    createdAt: oneDayAgo,
    updatedAt: oneDayAgo,
  },
  {
    id: 'task-2',
    tenantId: 'tenant_evolve',
    title: 'Cobrar reenvio de RG legível - João Pedro',
    description: 'Documento de identificação cortado na proposta 1902975450.',
    category: 'PENDENCIA',
    priority: 'ALTA',
    dueDate: new Date().toISOString().split('T')[0],
    completed: false,
    assignedUserId: 'u-suporte',
    assignedUserName: 'Lucas Ferreira',
    clientId: 'cli-joao-pedro',
    clientName: 'JOÃO PEDRO DE ALMEIDA',
    proposalId: 'prop-1902975450',
    proposalNumber: '1902975450',
    partnerId: 'part-franco',
    partnerName: 'FRANCO@16690',
    createdAt: oneDayAgo,
    updatedAt: oneDayAgo,
  },
  {
    id: 'task-3',
    tenantId: 'tenant_evolve',
    title: 'Confirmar pagamento do cartão - Antonia Souza',
    description: 'Checar crédito em conta do saque complementar da proposta 991823741.',
    category: 'FOLLOW_UP',
    priority: 'MEDIA',
    dueDate: new Date().toISOString().split('T')[0],
    completed: true,
    completedAt: oneDayAgo,
    completedByUserId: 'u-digitador',
    assignedUserId: 'u-digitador',
    assignedUserName: 'Ana Beatriz',
    clientId: 'cli-antonia-souza',
    clientName: 'ANTONIA SOUZA SANTOS',
    proposalId: 'prop-991823741',
    proposalNumber: '991823741',
    createdAt: twoDaysAgo,
    updatedAt: oneDayAgo,
  },
];

// Initial General Financial Entries (Sem cálculo automático de comissão)
const INITIAL_FINANCIAL_ENTRIES: FinancialEntry[] = [
  {
    id: 'fin-1',
    tenantId: 'tenant_evolve',
    type: 'ENTRADA',
    category: 'RECEBIMENTO_OPERACIONAL',
    title: 'Recebimento de Repasse de Produção C6 Bank',
    description: 'Liquidação da fatura de produção quinzenal da mesa',
    amount: 28500.00,
    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paymentDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'REALIZADO',
    bankId: 'bank-c6',
    bankName: 'C6 BANK',
    createdAt: twoDaysAgo,
    updatedAt: twoDaysAgo,
  },
  {
    id: 'fin-2',
    tenantId: 'tenant_evolve',
    type: 'SAIDA',
    category: 'DESPESA_FIXA',
    title: 'Licenças de Telefonia & Discador',
    description: 'Mensalidade do canal de telefonia e discagem automática',
    amount: 3200.00,
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'PREVISTO',
    createdAt: fourBusinessDaysAgo,
    updatedAt: fourBusinessDaysAgo,
  },
  {
    id: 'fin-3',
    tenantId: 'tenant_evolve',
    type: 'SAIDA',
    category: 'SERVICO',
    title: 'Consultas Cadastrais e Motor de Crédito CIP',
    description: 'Pacote de 5.000 consultas de margem e elegibilidade',
    amount: 1850.00,
    dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'PREVISTO',
    createdAt: fourBusinessDaysAgo,
    updatedAt: fourBusinessDaysAgo,
  },
];

// Initial Gamification Achievements
const INITIAL_ACHIEVEMENTS: GamificationAchievement[] = [
  {
    id: 'ach-1',
    code: 'PRIMEIRA_VENDA',
    title: 'Primeira Venda',
    description: 'Primeira proposta com status PAGO cadastrada na mesa.',
    icon: '🚀',
    unlockedAt: oneDayAgo,
    operatorId: 'u-digitador',
    operatorName: 'Ana Beatriz (Digitadora)',
  },
  {
    id: 'ach-2',
    code: 'MELHOR_CONVERSAO',
    title: 'Alta Precisão',
    description: 'Taxa de aprovação e integração superior a 85% no mês.',
    icon: '🎯',
    unlockedAt: twoDaysAgo,
    operatorId: 'u-digitador',
    operatorName: 'Ana Beatriz (Digitadora)',
  },
];

export class StorageService {
  private static KEY_TO_COLLECTION: Record<string, string> = {
    'cg_documents': 'documents',
  };

  private static activeListeners: (() => void)[] = [];

  public static clearBusinessCache(): void {
    const businessKeys = [
      'cg_users',
      'cg_active_user',
      'cg_tenants',
      'cg_current_tenant_id',
      'cg_promoters',
      'cg_banks',
      'cg_bank_promoters',
      'cg_partners',
      'cg_products',
      'cg_clients',
      'cg_statuses',
      'cg_proposals',
      'cg_proposal_relations',
      'cg_history',
      'cg_comments',
      'cg_pendings',
      'cg_holidays',
      'cg_notifications',
      'cg_audit_logs',
      'cg_export_logs',
      'cg_system_exceptions',
      'cg_simulation_requests',
      'cg_documents',
      'cg_communications',
      'cg_client_notes',
      'cg_operational_tasks',
      'cg_financial_entries',
      'cg_achievements',
      'cg_backup_snapshots',
      'cg_config',
      'cg_is_authenticated',
      'cg_session_token',
    ];

    for (const key of businessKeys) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
    try {
      sessionStorage.removeItem('cg_session_token');
    } catch {}
  }

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
        return defaultValue;
      }
      const parsed = JSON.parse(data);
      if (parsed === null || parsed === undefined) return defaultValue;
      return parsed;
    } catch {
      return defaultValue;
    }
  }

  private static set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    } catch (e) {
      console.error(`Failed to write to localStorage for key ${key}:`, e);
    }
  }

  public static initialize(): void {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this.resetToInitial();
    }
    this.syncWithPostgreSQL().catch(err => {
      console.warn("Failed to initialize state from PostgreSQL:", err);
    });
    this.loadFromFirestore().catch(err => {
      console.error("Failed to initialize state from Firestore:", err);
    });
    this.setupRealTimeListeners();
  }

  public static async syncWithPostgreSQL(): Promise<void> {
    try {
      // If executing in Node.js / non-browser without origin, skip relative HTTP fetches
      if (typeof window === 'undefined' || typeof window.location === 'undefined') {
        return;
      }

      // Helper function to fetch and log errors safely
      const safeFetch = async (url: string) => {
        try {
          const res = await fetch(url, { credentials: 'include' });
          if (res.ok) return await res.json();
        } catch (e) {
          console.warn(`[STORAGE] Fail to fetch ${url}`, e);
        }
        return null;
      };

      // 1. Fetch Clients
      const dbClients = await safeFetch('/api/clients');
      if (Array.isArray(dbClients)) {
        const formatted = dbClients.map((c: any) => ({
          id: c.id,
          cpf: c.cpf,
          fullName: c.fullName,
          phone: c.phone || '',
          email: c.email || '',
          observation: '',
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(formatted));
      }

      // 2. Fetch Proposals
      const dbProposals = await safeFetch('/api/proposals');
      if (Array.isArray(dbProposals)) {
        const formattedProps = dbProposals.map((p: any) => ({
          id: p.id,
          proposalNumber: p.proposalNumber,
          clientId: p.clientId,
          productId: p.productId || 'prod-novo',
          convenioId: p.convenioId || undefined,
          bankId: p.bankId || 'bank-c6',
          promoterId: p.promoterId || 'prom-dg',
          partnerId: p.partnerId || 'part-kauai',
          digitizerId: p.createdById || 'u-digitador',
          statusId: p.statusId || 'st-1',
          currentResponsible: p.status?.responsibleGroup || 'CLIENTE',
          disbursedValue: p.releasedValue ? Number(p.releasedValue) : 0,
          contractBalance: p.contractValue ? Number(p.contractValue) : 0,
          notes: p.notes || undefined,
          c6ProposalNumber: p.c6ProposalNumber || p.proposalNumber,
          c6OperationNumber: p.c6OperationNumber || undefined,
          c6SyncStatus: p.c6SyncStatus || 'PENDING',
          c6RawSituation: p.c6RawSituation || undefined,
          c6CurrentActivity: p.c6CurrentActivity || undefined,
          c6ActivityDescription: p.c6ActivityDescription || undefined,
          c6FormalizationStatus: p.c6FormalizationStatus || undefined,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          portabilitySlaStartedAt: p.retentionDeadline || undefined,
          type: p.type || 'NOVO',
          relatedPortabilityId: p.relatedPortabilityId || undefined,
        }));
        localStorage.setItem(STORAGE_KEYS.PROPOSALS, JSON.stringify(formattedProps));
      }

      window.dispatchEvent(new Event('credit_gestao_storage_update'));

      // 3. Fetch Tasks
      const dbTasks = await safeFetch('/api/tasks');
      if (Array.isArray(dbTasks)) {
        const formattedTasks = dbTasks.map((t: any) => ({
          id: t.id,
          tenantId: t.tenantId,
          title: t.title,
          description: t.description || '',
          category: t.category || 'OPERACIONAL',
          priority: t.priority || 'MEDIUM',
          dueDate: t.dueDate ? t.dueDate.split('T')[0] : '',
          completed: t.completed,
          assignedUserId: t.assignedToId || '',
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.OPERATIONAL_TASKS, JSON.stringify(formattedTasks));
      }

      // 3.1 Fetch Notifications
      const dbNotifs = await safeFetch('/api/notifications');
      if (Array.isArray(dbNotifs)) {
        const formattedNotifs = dbNotifs.map((n: any) => ({
          id: n.id,
          proposalId: n.proposalId || undefined,
          title: n.title,
          message: n.message,
          type: n.type || 'SISTEMA',
          priority: n.priority || 'INFO',
          read: n.read,
          createdAt: n.createdAt,
        }));
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(formattedNotifs));
      }

      // 4. Fetch Banks
      const dbBanks = await safeFetch('/api/banks');
      if (Array.isArray(dbBanks)) {
        const formattedBanks = dbBanks.map((b: any) => ({
          id: b.id,
          name: b.name,
          code: b.code || '',
          active: b.status === 'ATIVO',
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.BANKS, JSON.stringify(formattedBanks));
      }

      // 5. Fetch Promoters
      const dbPromoters = await safeFetch('/api/promoters');
      if (Array.isArray(dbPromoters)) {
        const formattedPromoters = dbPromoters.map((p: any) => ({
          id: p.id,
          name: p.name,
          active: p.status === 'ATIVO',
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.PROMOTERS, JSON.stringify(formattedPromoters));
      }

      // 6. Fetch Partners
      const dbPartners = await safeFetch('/api/partners');
      if (Array.isArray(dbPartners)) {
        const currentTenantId = this.getCurrentTenantId();
        const formattedPartners = dbPartners.map((p: any) => ({
          id: p.id,
          fullName: p.fullName || p.name || 'Parceiro sem Nome',
          login: p.login || p.code || '',
          code: p.code || p.login || '',
          promoterId: p.promoterId || '',
          active: p.active !== undefined ? Boolean(p.active) : (p.status === 'ATIVO' || p.status !== 'INATIVO'),
          tenantId: p.tenantId || currentTenantId,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.PARTNERS, JSON.stringify(formattedPartners));
      }

      // 7. Fetch Products
      const dbProducts = await safeFetch('/api/products');
      if (Array.isArray(dbProducts)) {
        const formattedProducts = dbProducts.map((pr: any) => ({
          id: pr.id,
          name: pr.name,
          description: pr.description || '',
          type: pr.type || 'NOVO',
          allowsMultipleAde: true,
          requiresPortabilityRelation: pr.type === 'PORTABILIDADE' && (pr.name.includes('REFIN') || pr.name.includes('PORT')),
          active: pr.active,
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(formattedProducts));
      }

      // 8. Fetch BankPromoters (Matrix)
      const dbBankPromoters = await safeFetch('/api/bank-promoters');
      if (Array.isArray(dbBankPromoters)) {
        const formattedBankPromoters = dbBankPromoters.map((bp: any) => ({
          id: bp.id,
          bankId: bp.bankId,
          promoterId: bp.promoterId,
          active: bp.status === 'ATIVO',
          createdAt: bp.createdAt,
          updatedAt: bp.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.BANK_PROMOTERS, JSON.stringify(formattedBankPromoters));
      }

      // 9. Fetch White Label Settings
      const dbWL = await safeFetch('/api/whitelabel');
      if (dbWL && typeof dbWL === 'object') {
        const formattedWL = {
          companyName: dbWL.companyName || 'SENTINEL CONSIG',
          tradeName: dbWL.tradeName || 'Inteligência que antecipa. Controle que transforma.',
          cnpj: dbWL.cnpj || '',
          logoUrl: dbWL.logoUrl || '',
          primaryColor: dbWL.primaryColor || '#2563eb',
          accentColor: dbWL.accentColor || '#4f46e5',
          supportEmail: dbWL.supportEmail || '',
          supportPhone: dbWL.supportPhone || '',
          footerText: dbWL.footerText || '',
        };
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify({ whiteLabel: formattedWL }));
      }

      // 10. Fetch Documents
      const dbDocs = await safeFetch('/api/documents');
      if (Array.isArray(dbDocs)) {
        const formattedDocs = dbDocs.map((d: any) => ({
          id: d.id,
          tenantId: d.tenantId,
          clientId: d.clientId,
          proposalId: d.proposalId || undefined,
          name: d.name,
          type: d.type || 'OUTROS',
          fileUrl: d.fileUrl || `/api/documents/${d.id}`,
          fileSizeBytes: d.fileSizeBytes || 0,
          uploadedByUserId: d.uploadedById || '',
          uploadedByUserName: 'Usuário do Sistema',
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(formattedDocs));
      }

      // 11. Fetch Audit Logs
      const dbAudit = await safeFetch('/api/audit-logs');
      if (Array.isArray(dbAudit)) {
        const formattedAudit = dbAudit.map((a: any) => ({
          id: a.id,
          userId: a.userId || 'system',
          userName: a.userName || 'System',
          userRole: a.userRole || 'SYSTEM',
          action: a.action,
          entity: a.entity || '',
          entityId: a.entityId || '',
          newData: a.newData || '',
          previousData: a.previousData || '',
          createdAt: a.createdAt,
        }));
        localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(formattedAudit));
      }

      // 11. Fetch Users
      const dbUsers = await safeFetch('/api/users');
      if (Array.isArray(dbUsers)) {
        const formattedUsers = dbUsers.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(formattedUsers));
      }

      // 12. Fetch Tenants
      const dbTenants = await safeFetch('/api/tenants');
      if (Array.isArray(dbTenants)) {
        const formattedTenants = dbTenants.map((t: any) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          customDomain: t.customDomain || '',
          cnpj: t.cnpj || '',
          razaoSocial: t.razaoSocial || t.name,
          tradeName: t.tradeName || t.name,
          plan: t.plan || 'PRO',
          status: t.status || 'ACTIVE',
          maxUsers: t.maxUsers || 10,
          storageLimitMb: t.storageLimitMb || 5000,
          modules: t.enabledModules || ['ALL'],
          adminEmail: t.adminEmail || '',
          adminName: t.adminName || '',
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(formattedTenants));
      }

      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    } catch (err) {
      console.warn('[STORAGE] Erro ao sincronizar com PostgreSQL:', err);
    }
  }

  /**
   * Targeted reload for specific entity triggered by realtime SSE event.
   * Ensures zero full-table thrash while keeping PostgreSQL as the single source of truth.
   */
  public static async syncSpecificEntity(entity: string, entityId?: string): Promise<void> {
    // If executing in Node.js / non-browser without origin, skip relative HTTP fetches
    if (typeof window === 'undefined' || typeof window.location === 'undefined') {
      return;
    }

    const safeFetch = async (url: string) => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn(`[STORAGE TARGETED SYNC] Failed: ${url}`, e);
      }
      return null;
    };

    try {
      if (entity === 'Proposal') {
        const dbProposals = await safeFetch('/api/proposals');
        if (Array.isArray(dbProposals)) {
          const formattedProps = dbProposals.map((p: any) => ({
            id: p.id,
            proposalNumber: p.proposalNumber,
            clientId: p.clientId,
            productId: p.productId || 'prod-novo',
            convenioId: p.convenioId || undefined,
            bankId: p.bankId || 'bank-c6',
            promoterId: p.promoterId || 'prom-dg',
            partnerId: p.partnerId || 'part-kauai',
            digitizerId: p.createdById || 'u-digitador',
            statusId: p.statusId || 'st-1',
            currentResponsible: p.status?.responsibleGroup || 'CLIENTE',
            disbursedValue: p.releasedValue ? Number(p.releasedValue) : 0,
            contractBalance: p.contractValue ? Number(p.contractValue) : 0,
            notes: p.notes || undefined,
            c6ProposalNumber: p.c6ProposalNumber || p.proposalNumber,
            c6OperationNumber: p.c6OperationNumber || undefined,
            c6SyncStatus: p.c6SyncStatus || 'PENDING',
            c6RawSituation: p.c6RawSituation || undefined,
            c6CurrentActivity: p.c6CurrentActivity || undefined,
            c6ActivityDescription: p.c6ActivityDescription || undefined,
            c6FormalizationStatus: p.c6FormalizationStatus || undefined,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            portabilitySlaStartedAt: p.retentionDeadline || undefined,
            type: p.type || 'NOVO',
            relatedPortabilityId: p.relatedPortabilityId || undefined,
          }));
          localStorage.setItem(STORAGE_KEYS.PROPOSALS, JSON.stringify(formattedProps));
        }
      } else if (entity === 'Client') {
        const dbClients = await safeFetch('/api/clients');
        if (Array.isArray(dbClients)) {
          const formatted = dbClients.map((c: any) => ({
            id: c.id,
            cpf: c.cpf,
            fullName: c.fullName,
            phone: c.phone || '',
            email: c.email || '',
            observation: '',
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          }));
          localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(formatted));
        }
      } else if (entity === 'Task') {
        const dbTasks = await safeFetch('/api/tasks');
        if (Array.isArray(dbTasks)) {
          const formattedTasks = dbTasks.map((t: any) => ({
            id: t.id,
            tenantId: t.tenantId,
            title: t.title,
            description: t.description || '',
            category: t.category || 'OPERACIONAL',
            priority: t.priority || 'MEDIUM',
            dueDate: t.dueDate ? t.dueDate.split('T')[0] : '',
            completed: t.completed,
            assignedUserId: t.assignedToId || '',
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }));
          localStorage.setItem(STORAGE_KEYS.OPERATIONAL_TASKS, JSON.stringify(formattedTasks));
        }
      } else if (entity === 'Notification') {
        const dbNotifs = await safeFetch('/api/notifications');
        if (Array.isArray(dbNotifs)) {
          const formattedNotifs = dbNotifs.map((n: any) => ({
            id: n.id,
            proposalId: n.proposalId || undefined,
            title: n.title,
            message: n.message,
            type: n.type || 'SISTEMA',
            priority: n.priority || 'INFO',
            read: n.read,
            createdAt: n.createdAt,
          }));
          localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(formattedNotifs));

          // Toast trigger with strict deduplication (1 logical event = 1 visual toast)
          if (entityId) {
            const newlyCreated = formattedNotifs.find((n: any) => n.id === entityId);
            if (newlyCreated && !newlyCreated.read) {
              toastService.info(newlyCreated.title, newlyCreated.message);
            }
          }
        }
      } else if (entity === 'User') {
        const dbUsers = await safeFetch('/api/users');
        if (Array.isArray(dbUsers)) {
          const formattedUsers = dbUsers.map((u: any) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            active: u.active,
            createdAt: u.createdAt,
            updatedAt: u.updatedAt,
          }));
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(formattedUsers));
        }
      } else if (entity === 'Tenant') {
        const dbTenants = await safeFetch('/api/tenants');
        if (Array.isArray(dbTenants)) {
          const formattedTenants = dbTenants.map((t: any) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            customDomain: t.customDomain || '',
            cnpj: t.cnpj || '',
            razaoSocial: t.razaoSocial || t.name,
            tradeName: t.tradeName || t.name,
            plan: t.plan || 'PRO',
            status: t.status || 'ACTIVE',
            maxUsers: t.maxUsers || 10,
            storageLimitMb: t.storageLimitMb || 5000,
            modules: t.enabledModules || ['ALL'],
            adminEmail: t.adminEmail || '',
            adminName: t.adminName || '',
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }));
          localStorage.setItem(STORAGE_KEYS.TENANTS, JSON.stringify(formattedTenants));
        }
      } else if (entity === 'Partner') {
        const dbPartners = await safeFetch('/api/partners');
        if (Array.isArray(dbPartners)) {
          const currentTenantId = this.getCurrentTenantId();
          const formattedPartners = dbPartners.map((p: any) => ({
            id: p.id,
            fullName: p.fullName || p.name || 'Parceiro sem Nome',
            login: p.login || p.code || '',
            code: p.code || p.login || '',
            promoterId: p.promoterId || '',
            active: p.active !== undefined ? Boolean(p.active) : (p.status === 'ATIVO' || p.status !== 'INATIVO'),
            tenantId: p.tenantId || currentTenantId,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }));
          localStorage.setItem(STORAGE_KEYS.PARTNERS, JSON.stringify(formattedPartners));
        }
      }

      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    } catch (err) {
      console.warn('[STORAGE] Erro ao sincronizar entidade específica:', entity, err);
    }
  }

  public static async loadFromFirestore(): Promise<void> {
    const collectionsToLoad = Object.entries(this.KEY_TO_COLLECTION);
    let hasData = false;

    for (const [key, colName] of collectionsToLoad) {
      try {
        const querySnapshot = await getDocs(collection(db, colName));
        
        if (!querySnapshot.empty) {
          const items: any[] = [];
          querySnapshot.forEach((docSnap) => {
            const docData = docSnap.data();
            if (docData) {
              items.push(docData);
            }
          });
          
          if (items.length > 0) {
            hasData = true;

            // Merge with local items by id to ensure no unsynced local data is lost
            const rawStored = localStorage.getItem(key);
            let localItems: any[] = [];
            if (rawStored) {
              try {
                const parsed = JSON.parse(rawStored);
                if (Array.isArray(parsed)) {
                  localItems = parsed;
                }
              } catch {}
            }

            const remoteIds = new Set(items.map(it => it.id));
            const uniqueLocal = localItems.filter(it => it && it.id && !remoteIds.has(it.id));
            const merged = [...items, ...uniqueLocal];

            localStorage.setItem(key, JSON.stringify(merged));
          }
        } else {
          // If Firestore is empty for this specific collection, seed local data so it gets uploaded
          const localData = this.get<any[]>(key, []);
          if (localData.length > 0) {
            console.log(`Firestore has no records for ${colName}. Seeding local data...`);
            for (const item of localData) {
              if (item && item.id) {
                await setDoc(doc(db, colName, item.id), cleanObjectForFirestore(item));
              }
            }
          }
        }
      } catch (err) {
        console.error(`Failed to load collection ${colName} from Firestore:`, err);
      }
    }

    if (hasData) {
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    }
  }

  public static setupRealTimeListeners(onUpdate?: () => void): () => void {
    this.unsubscribeRealTimeListeners();

    const collectionsToListen = Object.entries(this.KEY_TO_COLLECTION);

    const unsubscribes = collectionsToListen.map(([key, colName]) => {
      return onSnapshot(collection(db, colName), (snapshot) => {
        if (!snapshot.empty) {
          const items: any[] = [];
          snapshot.forEach((docSnap) => {
            const docData = docSnap.data();
            if (docData) {
              items.push(docData);
            }
          });

          localStorage.setItem(key, JSON.stringify(items));
          window.dispatchEvent(new Event('credit_gestao_storage_update'));
          if (onUpdate) onUpdate();
        }
      }, (error) => {
        console.warn(`Real-time listener error on ${colName}:`, error);
      });
    });

    this.activeListeners = unsubscribes;

    return () => {
      this.unsubscribeRealTimeListeners();
    };
  }

  public static unsubscribeRealTimeListeners(): void {
    if (this.activeListeners && this.activeListeners.length > 0) {
      this.activeListeners.forEach(unsub => unsub());
      this.activeListeners = [];
    }
  }

  public static async seedFirestoreFromLocal(): Promise<void> {
    for (const [key, colName] of Object.entries(this.KEY_TO_COLLECTION)) {
      try {
        const localData = this.get<any[]>(key, []);
        if (localData.length > 0) {
          console.log(`Seeding ${colName} with ${localData.length} records...`);
          for (const item of localData) {
            if (item && item.id) {
              await setDoc(doc(db, colName, item.id), cleanObjectForFirestore(item));
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
    this.set(STORAGE_KEYS.TENANTS, INITIAL_TENANTS);
    this.set(STORAGE_KEYS.CURRENT_TENANT_ID, 'tenant_evolve');
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
    this.set(STORAGE_KEYS.DOCUMENTS, INITIAL_DOCUMENTS);
    this.set(STORAGE_KEYS.COMMUNICATIONS, INITIAL_COMMUNICATIONS);
    this.set(STORAGE_KEYS.CLIENT_NOTES, INITIAL_CLIENT_NOTES);
    this.set(STORAGE_KEYS.OPERATIONAL_TASKS, INITIAL_OPERATIONAL_TASKS);
    this.set(STORAGE_KEYS.FINANCIAL_ENTRIES, INITIAL_FINANCIAL_ENTRIES);
    this.set(STORAGE_KEYS.ACHIEVEMENTS, INITIAL_ACHIEVEMENTS);
    this.set(STORAGE_KEYS.BACKUP_SNAPSHOTS, []);
    this.set(
      STORAGE_KEYS.CONFIG,
      { portabilityBalanceDays: 5, autoCronIntervalMinutes: 15 }
    );
  }

  // Active User & Auth
  public static isAuthenticated(): boolean {
    const isAuth = localStorage.getItem('cg_is_authenticated');
    if (isAuth !== 'true') {
      return false;
    }

    // Check whether active user in localStorage is valid.
    // If active user is missing, empty ({}) or invalid, flag is invalid and must be cleared.
    const active = this.getActiveUser();
    if (!active || active.id === 'guest' || !active.active) {
      localStorage.setItem('cg_is_authenticated', 'false');
      return false;
    }

    return true;
  }

  public static loginUser(user: User): void {
    // 1. Purge all prior session/tenant cache completely to guarantee zero cross-tenant data leak or flash
    this.clearBusinessCache();

    // 2. Set new session markers
    localStorage.setItem('cg_is_authenticated', 'true');
    this.setActiveUser(user);
    if (user.tenantId) {
      this.setCurrentTenantId(user.tenantId);
    }

    // 3. Register audit log
    this.addAuditLog({
      action: 'LOGIN_SISTEMA',
      entity: 'User',
      entityId: user.id,
      newData: JSON.stringify({ email: user.email, name: user.name, role: user.role, tenantId: user.tenantId }),
    });

    // 4. Immediately trigger PostgreSQL sync for new tenant
    this.syncWithPostgreSQL().catch(err => {
      console.warn('[SYNC] Erro ao sincronizar dados pós-login:', err);
    });

    this.setupRealTimeListeners();
    window.dispatchEvent(new Event('credit_gestao_storage_update'));
  }

  public static logout(): void {
    const active = this.getActiveUser();
    try {
      this.addAuditLog({
        action: 'LOGOUT_SISTEMA',
        entity: 'User',
        entityId: active?.id || 'unknown',
        previousData: JSON.stringify({ email: active?.email, name: active?.name, role: active?.role }),
      });
    } catch {}
    this.unsubscribeRealTimeListeners();
    this.clearBusinessCache();
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    window.dispatchEvent(new Event('credit_gestao_storage_update'));
  }

  // Active User & Auth
  public static isValidUser(user: any): user is User {
    return (
      user !== null &&
      typeof user === 'object' &&
      typeof user.id === 'string' &&
      user.id.trim() !== '' &&
      typeof user.name === 'string' &&
      user.name.trim() !== '' &&
      typeof user.role === 'string' &&
      isValidRole(user.role)
    );
  }

  public static getActiveUser(): User {
    const defaultAnonymousUser: User = {
      id: 'guest',
      name: 'Usuário',
      email: '',
      role: 'DIGITADOR',
      active: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
      if (!raw || raw === 'undefined' || raw === 'null') {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
        return defaultAnonymousUser;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
        return defaultAnonymousUser;
      }

      if (!this.isValidUser(parsed)) {
        console.warn('[STORAGE] cg_active_user inválido ou parcial detectado. Removendo estado local inválido.');
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
        return defaultAnonymousUser;
      }

      let user: User = parsed;
      if (user.name && user.name.includes('(')) {
        user = { ...user, name: user.name.replace(/\s*\([^)]*\)/g, '').trim() };
        this.set(STORAGE_KEYS.ACTIVE_USER, user);
      }
      return user;
    } catch {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
      return defaultAnonymousUser;
    }
  }

  public static setActiveUser(user: User): void {
    this.set(STORAGE_KEYS.ACTIVE_USER, user);
    this.addAuditLog({
      action: 'LOGIN_SESSAO',
      entity: 'User',
      entityId: user.id,
      newData: JSON.stringify({ email: user.email, role: user.role }),
    });
    try {
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    } catch {}
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

    const masterIdx = users.findIndex(u => u.id === 'u-master');
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

    const { password, ...cleanData } = data;
    const tempPassword = password || this.generateTemporaryPassword();
    const newUser: User = {
      ...cleanData,
      id: `u-${Date.now()}`,
      mustChangePassword: data.mustChangePassword !== undefined ? data.mustChangePassword : true,
      customPermissions: data.customPermissions || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.push(newUser);
    this.set(STORAGE_KEYS.USERS, users);

    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        password: tempPassword,
        role: newUser.role,
        customPermissions: newUser.customPermissions,
        tenantId: newUser.tenantId,
        phone: (newUser as any).phone || '',
      }),
    }).catch(err => console.warn('[API] Error creating user:', err));

    this.addAuditLog({
      action: 'CRIAR_USUARIO',
      entity: 'User',
      entityId: newUser.id,
      newData: JSON.stringify({ name: newUser.name, email: newUser.email, role: newUser.role, customPermissions: newUser.customPermissions }),
    });
    return { ...newUser, password: tempPassword };
  }

  public static updateUserPassword(userId: string, newPassword: string): User {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('Usuário não encontrado');
    
    const { password, ...cleanUser } = users[idx] as any;
    const updatedUser: User = {
      ...cleanUser,
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    };
    users[idx] = updatedUser;
    this.set(STORAGE_KEYS.USERS, users);

    const active = this.getActiveUser();
    if (active.id === userId) {
      this.set(STORAGE_KEYS.ACTIVE_USER, updatedUser);
    }

    fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: newPassword,
      }),
    }).catch(err => console.warn('[API] Error updating user password:', err));

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

    fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: tempPassword,
      }),
    }).catch(err => console.warn('[API] Error resetting user password:', err));

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

    const updatedUser = users[idx];
    fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        active: updatedUser.active,
        customPermissions: updatedUser.customPermissions,
        tenantId: updatedUser.tenantId,
        phone: (updatedUser as any).phone || '',
      }),
    }).catch(err => console.warn('[API] Error updating user:', err));

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

    fetch(`/api/users/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting user:', err));

    this.addAuditLog({
      action: 'EXCLUIR_USUARIO',
      entity: 'User',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  public static async deleteUsersBulk(ids: string[]): Promise<any> {
    const active = this.getActiveUser();
    if (ids.includes(active.id)) {
      throw new Error('Você não pode excluir o seu próprio usuário logado.');
    }
    const users = this.getUsers();


    const res = await fetch('/api/saas/users/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Erro ao processar exclusão em massa de usuários.');
    }

    const idSet = new Set(ids);
    const updated = users.filter(u => !idSet.has(u.id));
    this.set(STORAGE_KEYS.USERS, updated);
    return data;
  }

  // Partners
  public static getPartners(): Partner[] {
    const raw = this.get<Partner[]>(STORAGE_KEYS.PARTNERS, INITIAL_PARTNERS);
    const currentTenantId = this.getCurrentTenantId();

    return (raw || [])
      .map(p => {
        const rawAny = p as any;
        const fullName = p.fullName || rawAny.name || 'Parceiro sem Nome';
        const login = p.login || rawAny.code || '';
        const code = rawAny.code || login;
        const active = p.active !== undefined ? Boolean(p.active) : (rawAny.status !== 'INATIVO');

        return {
          ...p,
          fullName,
          login,
          code,
          active,
          tenantId: rawAny.tenantId || (INITIAL_PARTNERS.some(ip => ip.id === p.id) ? 'tenant_evolve' : undefined),
        } as Partner;
      })
      .filter(p => {
        const pTenant = (p as any).tenantId;
        if (pTenant && currentTenantId && pTenant !== currentTenantId) {
          return false;
        }
        return true;
      });
  }

  public static createPartner(data: { fullName: string; login: string; promoterId: string }): Partner {
    const partners = this.getPartners();
    const cleanLogin = data.login.trim().toUpperCase();

    // Validate unique login
    if (partners.some(p => p.login.toUpperCase() === cleanLogin)) {
      throw new Error('Este login de parceiro já está cadastrado.');
    }

    const currentTenantId = this.getCurrentTenantId();
    const newPartner: Partner = {
      id: `part-${Date.now()}`,
      fullName: data.fullName.trim().toUpperCase(),
      login: cleanLogin,
      promoterId: data.promoterId,
      active: true,
      tenantId: currentTenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;
    partners.push(newPartner);
    this.set(STORAGE_KEYS.PARTNERS, partners);

    fetch('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newPartner.id,
        name: newPartner.fullName,
        code: newPartner.login,
        promoterId: newPartner.promoterId,
        status: newPartner.active ? 'ATIVO' : 'INATIVO',
      }),
    }).catch(err => console.warn('[API] Error creating partner:', err));

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

    const updatedPartner = partners[idx];
    fetch(`/api/partners/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: updatedPartner.fullName,
        code: updatedPartner.login,
        promoterId: updatedPartner.promoterId,
        status: updatedPartner.active ? 'ATIVO' : 'INATIVO',
      }),
    }).catch(err => console.warn('[API] Error updating partner:', err));

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

    fetch(`/api/partners/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting partner:', err));

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

    fetch('/api/promoters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newPromoter.id,
        name: newPromoter.name,
        code: newPromoter.id,
        status: newPromoter.active ? 'ATIVO' : 'INATIVO',
      }),
    }).catch(err => console.warn('[API] Error creating promoter:', err));

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

    fetch(`/api/promoters/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting promoter:', err));

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

    fetch('/api/banks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newBank.id,
        name: newBank.name,
        code: newBank.code || newBank.id,
        status: newBank.active ? 'ATIVO' : 'INATIVO',
      }),
    }).catch(err => console.warn('[API] Error creating bank:', err));

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

    fetch(`/api/banks/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting bank:', err));

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

    fetch('/api/bank-promoters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bankId,
        promoterId,
        login: 'DEFAULT',
        status: active ? 'ATIVO' : 'INATIVO',
      }),
    }).catch(err => console.warn('[API] Error setBankPromoter:', err));

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
  public static getProducts(includeInactive = false): Product[] {
    let list = this.get<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    
    // Ensure all 13 INITIAL_PRODUCTS (global catalog) are present
    let hasChanges = false;
    for (const initProd of INITIAL_PRODUCTS) {
      if (!list.some(p => p.id === initProd.id || (p.scope === 'GLOBAL' && p.name.toUpperCase() === initProd.name.toUpperCase()))) {
        list.push(initProd);
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this.set(STORAGE_KEYS.PRODUCTS, list);
    }

    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    let filtered = list;
    if (!isMaster) {
      filtered = list.filter(p => (p.scope ?? 'GLOBAL') === 'GLOBAL' || (p.scope === 'EXCLUSIVE' && p.tenantId === currentTenantId));
    } else if (currentTenantId) {
      filtered = list.filter(p => (p.scope ?? 'GLOBAL') === 'GLOBAL' || p.tenantId === currentTenantId);
    }

    if (!includeInactive) {
      filtered = filtered.filter(p => p.active);
    }
    return filtered;
  }

  public static createProduct(data: {
    name: string;
    code?: string;
    description?: string;
    type?: string;
    scope?: 'GLOBAL' | 'EXCLUSIVE';
    active?: boolean;
    allowsMultipleAde?: boolean;
    requiresPortabilityRelation?: boolean;
    convenioIds?: string[];
    tenantId?: string;
  }): Product {
    const list = this.get<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    const scope = (isMaster && data.scope === 'GLOBAL') ? 'GLOBAL' : 'EXCLUSIVE';
    const tenantId = scope === 'GLOBAL' ? undefined : (data.tenantId || currentTenantId);

    const tenants = this.getTenants();
    const tenant = tenantId ? tenants.find(t => t.id === tenantId) : undefined;
    const newProduct: Product = {
      id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: data.name.trim(),
      code: data.code?.trim() || undefined,
      description: data.description?.trim() || undefined,
      type: normalizeProposalType(data.type, data.requiresPortabilityRelation),
      scope,
      tenantId,
      tenantName: tenant?.name,
      allowsMultipleAde: data.allowsMultipleAde !== undefined ? data.allowsMultipleAde : true,
      requiresPortabilityRelation: data.requiresPortabilityRelation !== undefined ? data.requiresPortabilityRelation : false,
      convenioIds: data.convenioIds || [],
      active: data.active !== undefined ? data.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    list.push(newProduct);
    this.set(STORAGE_KEYS.PRODUCTS, list);

    fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProduct),
    }).catch(err => console.warn('[API] Erro ao sincronizar produto:', err));

    this.addAuditLog({
      action: 'CRIAR_PRODUTO',
      entity: 'Product',
      entityId: newProduct.id,
      newData: JSON.stringify(newProduct),
    });
    return newProduct;
  }

  public static updateProduct(id: string, data: Partial<Product>): Product {
    const list = this.get<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const index = list.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Produto não encontrado.');

    const existing = list[index];
    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    if ((existing.scope ?? 'GLOBAL') === 'GLOBAL' && !isMaster) {
      throw new Error('Apenas o Administrador Master pode editar produtos globais.');
    }
    if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== currentTenantId && !isMaster) {
      throw new Error('Permissão negada para editar este produto.');
    }

    const updated: Product = {
      ...existing,
      ...data,
      name: data.name !== undefined ? data.name.trim() : existing.name,
      code: data.code !== undefined ? (data.code?.trim() || undefined) : existing.code,
      description: data.description !== undefined ? (data.description?.trim() || undefined) : existing.description,
      type: data.type !== undefined ? normalizeProposalType(data.type, data.requiresPortabilityRelation ?? existing.requiresPortabilityRelation) : existing.type,
      active: data.active !== undefined ? Boolean(data.active) : existing.active,
      allowsMultipleAde: data.allowsMultipleAde !== undefined ? Boolean(data.allowsMultipleAde) : existing.allowsMultipleAde,
      requiresPortabilityRelation: data.requiresPortabilityRelation !== undefined ? Boolean(data.requiresPortabilityRelation) : existing.requiresPortabilityRelation,
      convenioIds: data.convenioIds !== undefined ? data.convenioIds : existing.convenioIds,
      updatedAt: new Date().toISOString(),
    };

    list[index] = updated;
    this.set(STORAGE_KEYS.PRODUCTS, list);

    fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(err => console.warn('[API] Erro ao atualizar produto:', err));

    this.addAuditLog({
      action: 'ATUALIZAR_PRODUTO',
      entity: 'Product',
      entityId: id,
      previousData: JSON.stringify(existing),
      newData: JSON.stringify(updated),
    });

    return updated;
  }

  public static deleteProduct(id: string): void {
    const list = this.getProducts(true);
    const target = list.find(p => p.id === id);
    if (!target) throw new Error('Produto não encontrado.');

    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    if ((target.scope ?? 'GLOBAL') === 'GLOBAL' && !isMaster) {
      throw new Error('Apenas administradores Master podem excluir produtos globais.');
    }
    if (target.scope === 'EXCLUSIVE' && target.tenantId !== currentTenantId && !isMaster) {
      throw new Error('Permissão negada para excluir este produto.');
    }

    const allProducts = this.get<Product[]>(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    const updated = allProducts.filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PRODUCTS, updated);

    fetch(`/api/products/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting product:', err));

    this.addAuditLog({
      action: 'EXCLUIR_PRODUTO',
      entity: 'Product',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // -------------------------------------------------------------
  // CONVÊNIOS
  // -------------------------------------------------------------
  public static getConvenios(includeInactive = false): Convenio[] {
    let list = this.get<Convenio[]>(STORAGE_KEYS.CONVENIOS, INITIAL_CONVENIOS);

    // Ensure all 21 INITIAL_CONVENIOS (global catalog) are present
    let hasChanges = false;
    for (const initConv of INITIAL_CONVENIOS) {
      if (!list.some(c => c.id === initConv.id || (c.scope === 'GLOBAL' && c.name.toUpperCase() === initConv.name.toUpperCase()))) {
        list.push(initConv);
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this.set(STORAGE_KEYS.CONVENIOS, list);
    }

    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    let filtered = list;
    if (!isMaster) {
      filtered = list.filter(c => (c.scope ?? 'GLOBAL') === 'GLOBAL' || (c.scope === 'EXCLUSIVE' && c.tenantId === currentTenantId));
    } else if (currentTenantId) {
      filtered = list.filter(c => (c.scope ?? 'GLOBAL') === 'GLOBAL' || c.tenantId === currentTenantId);
    }

    if (!includeInactive) {
      filtered = filtered.filter(c => c.active);
    }
    return filtered;
  }

  public static getConvenioById(id: string): Convenio | undefined {
    return this.getConvenios(true).find(c => c.id === id);
  }

  public static createConvenio(data: {
    name: string;
    code?: string;
    description?: string;
    scope?: 'GLOBAL' | 'EXCLUSIVE';
    active?: boolean;
    tenantId?: string;
  }): Convenio {
    const list = this.get<Convenio[]>(STORAGE_KEYS.CONVENIOS, INITIAL_CONVENIOS);
    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    const scope = (isMaster && data.scope === 'GLOBAL') ? 'GLOBAL' : 'EXCLUSIVE';
    const tenantId = scope === 'GLOBAL' ? undefined : (data.tenantId || currentTenantId);

    const cleanName = data.name.trim().toUpperCase();
    const cleanCode = data.code ? data.code.trim().toUpperCase() : undefined;
    const duplicate = list.find(c => {
      const matchScope = c.scope === scope;
      const matchTenant = scope === 'GLOBAL' || c.tenantId === tenantId;
      if (!matchScope || !matchTenant) return false;
      if (c.name.trim().toUpperCase() === cleanName) return true;
      if (cleanCode && c.code && c.code.trim().toUpperCase() === cleanCode) return true;
      return false;
    });

    if (duplicate) {
      throw new Error(`Já existe um convênio cadastrado com este nome ou código (${duplicate.name}) no mesmo escopo.`);
    }

    const tenants = this.getTenants();
    const tenant = tenantId ? tenants.find(t => t.id === tenantId) : undefined;
    const newConvenio: Convenio = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: data.name.trim(),
      code: data.code?.trim() || undefined,
      description: data.description?.trim() || undefined,
      scope,
      tenantId,
      tenantName: tenant?.name,
      active: data.active !== undefined ? data.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    list.push(newConvenio);
    this.set(STORAGE_KEYS.CONVENIOS, list);

    fetch('/api/convenios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConvenio),
    }).catch(err => console.warn('[API] Erro ao sincronizar convênio:', err));

    this.addAuditLog({
      action: 'CRIAR_CONVENIO',
      entity: 'Convenio',
      entityId: newConvenio.id,
      newData: JSON.stringify(newConvenio),
    });

    return newConvenio;
  }

  public static updateConvenio(id: string, data: Partial<Convenio>): Convenio {
    const list = this.get<Convenio[]>(STORAGE_KEYS.CONVENIOS, INITIAL_CONVENIOS);
    const index = list.findIndex(c => c.id === id);
    if (index === -1) throw new Error('Convênio não encontrado.');

    const existing = list[index];
    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    if ((existing.scope ?? 'GLOBAL') === 'GLOBAL' && !isMaster) {
      throw new Error('Apenas o Administrador Master pode editar convênios globais.');
    }
    if (existing.scope === 'EXCLUSIVE' && existing.tenantId !== currentTenantId && !isMaster) {
      throw new Error('Permissão negada para editar este convênio.');
    }

    const updated: Convenio = {
      ...existing,
      ...data,
      name: data.name !== undefined ? data.name.trim() : existing.name,
      code: data.code !== undefined ? (data.code?.trim() || undefined) : existing.code,
      description: data.description !== undefined ? (data.description?.trim() || undefined) : existing.description,
      active: data.active !== undefined ? Boolean(data.active) : existing.active,
      updatedAt: new Date().toISOString(),
    };

    list[index] = updated;
    this.set(STORAGE_KEYS.CONVENIOS, list);

    fetch(`/api/convenios/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(err => console.warn('[API] Erro ao atualizar convênio:', err));

    this.addAuditLog({
      action: 'ATUALIZAR_CONVENIO',
      entity: 'Convenio',
      entityId: id,
      previousData: JSON.stringify(existing),
      newData: JSON.stringify(updated),
    });

    return updated;
  }

  public static deleteConvenio(id: string): void {
    const list = this.getConvenios(true);
    const target = list.find(c => c.id === id);
    if (!target) throw new Error('Convênio não encontrado.');

    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    if ((target.scope ?? 'GLOBAL') === 'GLOBAL' && !isMaster) {
      throw new Error('Apenas administradores Master podem excluir convênios globais.');
    }
    if (target.scope === 'EXCLUSIVE' && target.tenantId !== currentTenantId && !isMaster) {
      throw new Error('Permissão negada para excluir este convênio.');
    }

    const allConvenios = this.get<Convenio[]>(STORAGE_KEYS.CONVENIOS, INITIAL_CONVENIOS);
    const updated = allConvenios.filter(c => c.id !== id);
    this.set(STORAGE_KEYS.CONVENIOS, updated);

    fetch(`/api/convenios/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting convenio:', err));

    this.addAuditLog({
      action: 'EXCLUIR_CONVENIO',
      entity: 'Convenio',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // -------------------------------------------------------------
  // OPERATIONAL RULES
  // -------------------------------------------------------------
  public static getOperationalRules(includeInactive = false): OperationalRule[] {
    const list = this.get<OperationalRule[]>(STORAGE_KEYS.OPERATIONAL_RULES, INITIAL_OPERATIONAL_RULES);
    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    let filtered = list;
    if (!isMaster) {
      filtered = list.filter(r => (r.scope ?? 'GLOBAL') === 'GLOBAL' || (r.scope === 'EXCLUSIVE' && r.tenantId === currentTenantId));
    } else if (currentTenantId) {
      filtered = list.filter(r => (r.scope ?? 'GLOBAL') === 'GLOBAL' || r.tenantId === currentTenantId);
    }

    if (!includeInactive) {
      filtered = filtered.filter(r => r.active);
    }
    return filtered;
  }

  public static createOperationalRule(data: Omit<OperationalRule, 'id' | 'createdAt' | 'updatedAt'>): OperationalRule {
    const list = this.get<OperationalRule[]>(STORAGE_KEYS.OPERATIONAL_RULES, INITIAL_OPERATIONAL_RULES);
    const activeUser = this.getActiveUser();
    const currentTenantId = this.getCurrentTenantId();
    const isMaster = activeUser?.role === 'PLATFORM_MASTER' || activeUser?.role === 'MASTER';

    const scope = (isMaster && data.scope === 'GLOBAL') ? 'GLOBAL' : 'EXCLUSIVE';
    const tenantId = scope === 'GLOBAL' ? undefined : (data.tenantId || currentTenantId);

    const tenants = this.getTenants();
    const tenant = tenantId ? tenants.find(t => t.id === tenantId) : undefined;
    const newRule: OperationalRule = {
      ...data,
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      scope,
      tenantId,
      tenantName: tenant?.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    list.push(newRule);
    this.set(STORAGE_KEYS.OPERATIONAL_RULES, list);

    fetch('/api/operational-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRule),
    }).catch(err => console.warn('[API] Erro ao sincronizar regra:', err));

    return newRule;
  }

  public static updateOperationalRule(id: string, data: Partial<OperationalRule>): OperationalRule {
    const list = this.get<OperationalRule[]>(STORAGE_KEYS.OPERATIONAL_RULES, INITIAL_OPERATIONAL_RULES);
    const index = list.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Regra não encontrada.');

    const updated: OperationalRule = {
      ...list[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };

    list[index] = updated;
    this.set(STORAGE_KEYS.OPERATIONAL_RULES, list);

    fetch(`/api/operational-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(err => console.warn('[API] Erro ao atualizar regra:', err));

    return updated;
  }

  public static deleteOperationalRule(id: string): void {
    const list = this.get<OperationalRule[]>(STORAGE_KEYS.OPERATIONAL_RULES, INITIAL_OPERATIONAL_RULES);
    const updated = list.filter(r => r.id !== id);
    this.set(STORAGE_KEYS.OPERATIONAL_RULES, updated);

    fetch(`/api/operational-rules/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting rule:', err));
  }

  // -------------------------------------------------------------
  // COMPATIBILITY & VALIDATION HELPERS
  // -------------------------------------------------------------
  public static isProductCompatibleWithConvenio(productId: string, convenioId: string): boolean {
    if (!productId || !convenioId) return true;
    const prod = this.getProducts(true).find(p => p.id === productId);
    if (!prod) return true;
    if (!prod.convenioIds || prod.convenioIds.length === 0) return true;
    return prod.convenioIds.includes(convenioId);
  }

  public static getProductsForConvenio(convenioId?: string, includeInactive = false): Product[] {
    const products = this.getProducts(includeInactive);
    if (!convenioId) return products;
    return products.filter(p => {
      if (!p.convenioIds || p.convenioIds.length === 0) return true;
      return p.convenioIds.includes(convenioId);
    });
  }

  public static validateProposalAgainstRules(params: {
    convenioId?: string;
    productId?: string;
    installmentsCount?: number;
    contractValue?: number;
    contractBalance?: number;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const rules = this.getOperationalRules(false);

    for (const rule of rules) {
      const matchProduct = rule.appliesToAllProducts || (params.productId && rule.productIds.includes(params.productId));
      const matchConvenio = rule.appliesToAllConvenios || (params.convenioId && rule.convenioIds.includes(params.convenioId));

      if (matchProduct && matchConvenio) {
        if (params.installmentsCount !== undefined) {
          if (rule.minInstallments && params.installmentsCount < rule.minInstallments) {
            errors.push(`A regra "${rule.name}" exige no mínimo ${rule.minInstallments} parcelas.`);
          }
          if (rule.maxInstallments && params.installmentsCount > rule.maxInstallments) {
            errors.push(`A regra "${rule.name}" permite no máximo ${rule.maxInstallments} parcelas.`);
          }
        }
        if (params.contractValue !== undefined) {
          if (rule.minContractValue && params.contractValue < rule.minContractValue) {
            errors.push(`A regra "${rule.name}" exige valor de contrato mínimo de R$ ${rule.minContractValue.toLocaleString('pt-BR')}.`);
          }
          if (rule.maxContractValue && params.contractValue > rule.maxContractValue) {
            errors.push(`A regra "${rule.name}" permite valor de contrato máximo de R$ ${rule.maxContractValue.toLocaleString('pt-BR')}.`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Statuses
  public static getStatuses(): ProposalStatus[] {
    const list = this.get<ProposalStatus[]>(STORAGE_KEYS.STATUSES, INITIAL_STATUSES);
    return list.slice().sort((a, b) => a.order - b.order);
  }

  public static async fetchAndSyncStatuses(): Promise<ProposalStatus[]> {
    try {
      const res = await fetch('/api/statuses', { credentials: 'include' });
      if (res.ok) {
        const statuses = await res.json();
        if (Array.isArray(statuses) && statuses.length > 0) {
          this.saveStatuses(statuses);
          return statuses;
        }
      }
    } catch (err) {
      console.warn('[StorageService] Erro ao sincronizar status do PostgreSQL:', err);
    }
    return this.getStatuses();
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

    // Fire and forget backend sync for sync callers
    this.addStatusAsync(data).catch(err => console.warn('[StorageService] Sync addStatus warning:', err));

    return newStatus;
  }

  public static async addStatusAsync(data: {
    name: string;
    code?: string;
    responsibleGroup: Alcada;
    slaHours?: number;
    color?: string;
    active?: boolean;
    finalStatus?: boolean;
    manualChangeAllowed?: boolean;
    automaticChangeAllowed?: boolean;
  }): Promise<ProposalStatus> {
    const res = await fetch('/api/statuses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Erro ao criar status no PostgreSQL.');
    }

    const created: ProposalStatus = await res.json();
    const statuses = this.getStatuses().filter(s => s.id !== created.id);
    statuses.push(created);
    statuses.sort((a, b) => a.order - b.order);
    this.saveStatuses(statuses);
    return created;
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

    // Fire and forget backend sync for sync callers
    this.updateStatusAsync(id, updates).catch(err => console.warn('[StorageService] Sync updateStatus warning:', err));

    return updated;
  }

  public static async updateStatusAsync(id: string, updates: Partial<ProposalStatus>): Promise<ProposalStatus> {
    const res = await fetch(`/api/statuses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Erro ao atualizar status no PostgreSQL.');
    }

    const updated: ProposalStatus = await res.json();
    const statuses = this.getStatuses();
    const idx = statuses.findIndex(s => s.id === id);
    if (idx !== -1) {
      statuses[idx] = updated;
    } else {
      statuses.push(updated);
    }
    statuses.sort((a, b) => a.order - b.order);
    this.saveStatuses(statuses);
    return updated;
  }

  public static async reorderStatusesAsync(items: { id: string; order: number }[]): Promise<ProposalStatus[]> {
    const res = await fetch('/api/statuses/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Erro ao reordenar status no PostgreSQL.');
    }

    const updatedList: ProposalStatus[] = await res.json();
    this.saveStatuses(updatedList);
    return updatedList;
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

    this.deleteStatusAsync(id, targetFallbackStatusId).catch(err => console.warn('[StorageService] Sync deleteStatus warning:', err));
  }

  public static async deleteStatusAsync(id: string, targetFallbackStatusId?: string): Promise<void> {
    const res = await fetch(`/api/statuses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ targetFallbackStatusId }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Erro ao excluir status no PostgreSQL.');
    }

    const statuses = this.getStatuses().filter(s => s.id !== id);
    this.saveStatuses(statuses);
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

    const itemsToReorder = statuses.map((s, i) => ({ id: s.id, order: s.order || i + 1 }));
    this.reorderStatusesAsync(itemsToReorder).catch(err => console.warn('[StorageService] Sync moveStatusOrder warning:', err));
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

  public static async getOrCreateClientAsync(data: { cpf: string; fullName: string; phone?: string; email?: string; observation?: string }): Promise<Client> {
    const cleanCpf = normalizeCpf(data.cpf);
    if (cleanCpf.length !== 11) {
      throw new Error('CPF deve conter exatamente 11 dígitos numéricos.');
    }
    const cleanName = data.fullName ? data.fullName.trim().toUpperCase() : '';

    // Persist to PostgreSQL first if in browser
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cpf: cleanCpf,
            fullName: cleanName || 'CLIENTE NÃO NOMEADO',
            phone: data.phone,
            email: data.email,
          }),
        });
        if (res.ok) {
          const dbClient = await res.json();
          if (dbClient && dbClient.id) {
            const clients = this.getClients();
            const existingIndex = clients.findIndex(c => normalizeCpf(c.cpf) === cleanCpf);
            const clientObj: Client = {
              id: dbClient.id,
              cpf: cleanCpf,
              fullName: cleanName || dbClient.fullName || 'CLIENTE NÃO NOMEADO',
              phone: data.phone || dbClient.phone,
              email: data.email || dbClient.email,
              observation: data.observation,
              createdAt: dbClient.createdAt || new Date().toISOString(),
              updatedAt: dbClient.updatedAt || new Date().toISOString(),
            };
            if (existingIndex !== -1) {
              clients[existingIndex] = clientObj;
            } else {
              clients.push(clientObj);
            }
            this.set(STORAGE_KEYS.CLIENTS, clients);
            return clientObj;
          }
        }
      } catch (err) {
        console.warn('[CLIENT ASYNC POST WARN]', err);
      }
    }

    return this.getOrCreateClient(data);
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

    // Persist to PostgreSQL (Source of Truth)
    fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpf: newClient.cpf,
        fullName: newClient.fullName,
        phone: newClient.phone,
        email: newClient.email,
      }),
    }).catch(err => console.warn('[CLIENT POST FAIL]', err));

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
  public static async createProposalAsync(
    data: {
      proposalNumber: string;
      clientId: string;
      clientCpf?: string;
      clientName?: string;
      productId: string;
      convenioId?: string;
      bankId: string;
      promoterId: string;
      partnerId: string;
      digitizerId?: string;
      statusId?: string;
      notes?: string;
      disbursedValue?: number;
      contractBalance?: number;
      relatedPortabilityId?: string;
      c6ProposalNumber?: string;
      c6OperationNumber?: string;
    },
    origin: 'MANUAL' | 'IMPORTACAO' = 'MANUAL'
  ): Promise<Proposal> {
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

    let targetProposalId = `prop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const client = this.getClients().find(c => c.id === data.clientId);
    const clientCpf = data.clientCpf || client?.cpf;
    const clientName = data.clientName || client?.fullName;
    const clientPhone = client?.phone;
    const clientEmail = client?.email;

    const product = this.getProducts().find(p => p.id === data.productId);
    const resolvedType = data.relatedPortabilityId ? 'REFIN_PORTABILIDADE' : (product?.type || 'NOVO');

    // Persist to PostgreSQL (Source of Truth)
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalNumber: cleanNumber,
            clientId: data.clientId,
            clientCpf,
            clientName,
            clientPhone,
            clientEmail,
            bankId: data.bankId,
            promoterId: data.promoterId,
            partnerId: data.partnerId,
            productId: data.productId,
            convenioId: data.convenioId,
            statusId: statusId,
            type: resolvedType,
            relatedPortabilityId: data.relatedPortabilityId || undefined,
            releasedValue: data.disbursedValue !== undefined ? Number(data.disbursedValue) : 0,
            contractValue: data.contractBalance !== undefined ? Number(data.contractBalance) : 0,
            notes: data.notes,
            c6ProposalNumber: data.c6ProposalNumber || cleanNumber,
            c6OperationNumber: data.c6OperationNumber,
          }),
        });

        if (!res.ok) {
          let errData: any = null;
          try {
            errData = await res.json();
          } catch {}
          throw new Error(errData?.error || `Erro ao salvar proposta no servidor (HTTP ${res.status}).`);
        }

        const dbProposal = await res.json();
        if (dbProposal && dbProposal.id) {
          targetProposalId = dbProposal.id;
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('servidor') || err.message.includes('cadastrada') || err.message.includes('inválid'))) {
          throw err;
        }
        console.warn('[PROPOSAL ASYNC POST WARN]', err);
      }
    }

    const newProposal: Proposal = {
      id: targetProposalId,
      proposalNumber: cleanNumber,
      clientId: data.clientId,
      productId: data.productId,
      convenioId: data.convenioId,
      bankId: data.bankId,
      promoterId: data.promoterId,
      partnerId: data.partnerId,
      digitizerId: data.digitizerId || activeUser.id,
      statusId: statusId,
      currentResponsible: statusObj.responsibleGroup,
      disbursedValue: data.disbursedValue !== undefined ? Number(data.disbursedValue) : undefined,
      contractBalance: data.contractBalance !== undefined ? Number(data.contractBalance) : undefined,
      notes: data.notes,
      c6ProposalNumber: data.c6ProposalNumber || cleanNumber,
      c6OperationNumber: data.c6OperationNumber,
      c6SyncStatus: 'PENDING',
      type: resolvedType,
      relatedPortabilityId: data.relatedPortabilityId || undefined,
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
      observation: data.notes
        ? `${data.notes} | Liberado: R$ ${Number(data.disbursedValue || 0).toFixed(2)} | Saldo: R$ ${Number(data.contractBalance || 0).toFixed(2)}`
        : `Liberado: R$ ${Number(data.disbursedValue || 0).toFixed(2)} | Saldo: R$ ${Number(data.contractBalance || 0).toFixed(2)}`,
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
        disbursedValue: newProposal.disbursedValue,
        contractBalance: newProposal.contractBalance,
      }),
    });

    // Automatic matching: Check if any SimulationRequest matches CPF + Partner
    this.processSimulationMatching(newProposal);
    window.dispatchEvent(new Event('credit_gestao_storage_update'));

    return newProposal;
  }

  public static createProposal(
    data: {
      proposalNumber: string;
      clientId: string;
      clientCpf?: string;
      clientName?: string;
      productId: string;
      convenioId?: string;
      bankId: string;
      promoterId: string;
      partnerId: string;
      digitizerId?: string;
      statusId?: string;
      notes?: string;
      disbursedValue?: number;
      contractBalance?: number;
      relatedPortabilityId?: string; // If creating a refin linked to a portabilidade
      c6ProposalNumber?: string;
      c6OperationNumber?: string;
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

    const product = this.getProducts().find(p => p.id === data.productId);
    const resolvedType = data.relatedPortabilityId ? 'REFIN_PORTABILIDADE' : (product?.type || 'NOVO');

    const newProposal: Proposal = {
      id: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      proposalNumber: cleanNumber,
      clientId: data.clientId,
      productId: data.productId,
      convenioId: data.convenioId,
      bankId: data.bankId,
      promoterId: data.promoterId,
      partnerId: data.partnerId,
      digitizerId: data.digitizerId || activeUser.id,
      statusId: statusId,
      currentResponsible: statusObj.responsibleGroup,
      disbursedValue: data.disbursedValue !== undefined ? Number(data.disbursedValue) : undefined,
      contractBalance: data.contractBalance !== undefined ? Number(data.contractBalance) : undefined,
      notes: data.notes,
      c6ProposalNumber: data.c6ProposalNumber || cleanNumber,
      c6OperationNumber: data.c6OperationNumber,
      c6SyncStatus: 'PENDING',
      type: resolvedType,
      relatedPortabilityId: data.relatedPortabilityId || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (statusObj.code === 'AGUARDAR_RETORNO_CIP') {
      newProposal.portabilitySlaStartedAt = new Date().toISOString();
    }

    proposals.push(newProposal);
    this.set(STORAGE_KEYS.PROPOSALS, proposals);

    const client = this.getClients().find(c => c.id === data.clientId);

    // Persist to PostgreSQL (Source of Truth)
    fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalNumber: newProposal.proposalNumber,
        clientId: newProposal.clientId,
        clientCpf: data.clientCpf || client?.cpf,
        clientName: data.clientName || client?.fullName,
        clientPhone: client?.phone,
        clientEmail: client?.email,
        bankId: newProposal.bankId,
        promoterId: newProposal.promoterId,
        partnerId: newProposal.partnerId,
        productId: newProposal.productId,
        convenioId: newProposal.convenioId,
        statusId: statusId,
        type: resolvedType,
        relatedPortabilityId: data.relatedPortabilityId || undefined,
        releasedValue: newProposal.disbursedValue || 0,
        contractValue: newProposal.contractBalance || 0,
        notes: newProposal.notes,
        c6ProposalNumber: newProposal.c6ProposalNumber,
        c6OperationNumber: newProposal.c6OperationNumber,
      }),
    }).catch(err => console.warn('[PROPOSAL POST FAIL]', err));

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
      observation: data.notes
        ? `${data.notes} | Liberado: R$ ${Number(data.disbursedValue || 0).toFixed(2)} | Saldo: R$ ${Number(data.contractBalance || 0).toFixed(2)}`
        : `Liberado: R$ ${Number(data.disbursedValue || 0).toFixed(2)} | Saldo: R$ ${Number(data.contractBalance || 0).toFixed(2)}`,
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
        disbursedValue: newProposal.disbursedValue,
        contractBalance: newProposal.contractBalance,
      }),
    });

    // Automatic matching: Check if any SimulationRequest matches CPF + Partner
    this.processSimulationMatching(newProposal);
    window.dispatchEvent(new Event('credit_gestao_storage_update'));

    return newProposal;
  }

  /**
   * Updates an existing proposal with partial data (e.g. values, notes, etc.)
   */
  public static updateProposal(
    proposalId: string,
    updates: Partial<Proposal>,
    changeReason?: string
  ): Proposal {
    const proposals = this.get<Proposal[]>(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    const idx = proposals.findIndex(p => p.id === proposalId);
    if (idx === -1) {
      throw new Error('Proposta não encontrada.');
    }

    const current = proposals[idx];
    const prevDisbursed = current.disbursedValue;
    const prevBalance = current.contractBalance;

    const updated: Proposal = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    proposals[idx] = updated;
    this.set(STORAGE_KEYS.PROPOSALS, proposals);

    // If financial values changed, log to status history
    const valChanged =
      (updates.disbursedValue !== undefined && updates.disbursedValue !== prevDisbursed) ||
      (updates.contractBalance !== undefined && updates.contractBalance !== prevBalance);

    if (valChanged) {
      const activeUser = this.getActiveUser();
      const currentStatus = this.getStatusById(updated.statusId);
      this.addStatusHistory({
        proposalId: updated.id,
        userId: activeUser.id,
        userName: activeUser.name,
        newStatusId: updated.statusId,
        newStatusName: currentStatus?.name || 'Status Atual',
        action: 'Atualização de Valores',
        observation:
          changeReason ||
          `Valores alterados: Liberado R$ ${Number(updated.disbursedValue || 0).toFixed(2)} | Saldo R$ ${Number(updated.contractBalance || 0).toFixed(2)}`,
        origin: 'MANUAL',
      });
    }

    this.addAuditLog({
      action: 'ATUALIZAR_PROPOSTA',
      entity: 'Proposal',
      entityId: proposalId,
      previousData: JSON.stringify(current),
      newData: JSON.stringify(updated),
    });

    window.dispatchEvent(new Event('credit_gestao_storage_update'));
    return updated;
  }

  /**
   * Updates proposal financial values if they differ from current values.
   * Logs history and returns details of the modification.
   */
  public static updateProposalFinancials(
    proposalId: string,
    financials: { disbursedValue?: number; contractBalance?: number },
    origin: 'IMPORTACAO' | 'MANUAL' | 'SISTEMA' = 'IMPORTACAO',
    fileName?: string
  ): { updated: boolean; details: string; proposal?: Proposal } {
    const proposals = this.get<Proposal[]>(STORAGE_KEYS.PROPOSALS, INITIAL_PROPOSALS);
    const idx = proposals.findIndex(p => p.id === proposalId);
    if (idx === -1) return { updated: false, details: 'Proposta não encontrada' };

    const current = proposals[idx];
    let hasDifference = false;
    const changeLogs: string[] = [];
    const newValues: Partial<Proposal> = {};

    if (
      financials.disbursedValue !== undefined &&
      Number(financials.disbursedValue) !== Number(current.disbursedValue || 0)
    ) {
      hasDifference = true;
      changeLogs.push(
        `Valor Liberado atualizado de R$ ${Number(current.disbursedValue || 0).toFixed(2)} para R$ ${Number(financials.disbursedValue).toFixed(2)}`
      );
      newValues.disbursedValue = Number(financials.disbursedValue);
    }

    if (
      financials.contractBalance !== undefined &&
      Number(financials.contractBalance) !== Number(current.contractBalance || 0)
    ) {
      hasDifference = true;
      changeLogs.push(
        `Saldo do Contrato atualizado de R$ ${Number(current.contractBalance || 0).toFixed(2)} para R$ ${Number(financials.contractBalance).toFixed(2)}`
      );
      newValues.contractBalance = Number(financials.contractBalance);
    }

    if (!hasDifference) {
      return { updated: false, details: 'Valores idênticos aos já cadastrados' };
    }

    const updatedProposal: Proposal = {
      ...current,
      ...newValues,
      updatedAt: new Date().toISOString(),
    };

    proposals[idx] = updatedProposal;
    this.set(STORAGE_KEYS.PROPOSALS, proposals);

    const activeUser = this.getActiveUser();
    const currentStatus = this.getStatusById(updatedProposal.statusId);
    const reason = changeLogs.join(' | ') + (fileName ? ` (Arquivo: ${fileName})` : '');

    this.addStatusHistory({
      proposalId: updatedProposal.id,
      userId: activeUser.id,
      userName: activeUser.name,
      newStatusId: updatedProposal.statusId,
      newStatusName: currentStatus?.name || 'Status Atual',
      action: 'Atualização de Valores via Planilha',
      observation: reason,
      origin: origin as any,
    });

    this.addAuditLog({
      action: 'ATUALIZAR_VALORES_PROPOSTA',
      entity: 'Proposal',
      entityId: proposalId,
      previousData: JSON.stringify({
        disbursedValue: current.disbursedValue,
        contractBalance: current.contractBalance,
      }),
      newData: JSON.stringify({
        disbursedValue: updatedProposal.disbursedValue,
        contractBalance: updatedProposal.contractBalance,
      }),
    });

    window.dispatchEvent(new Event('credit_gestao_storage_update'));
    return { updated: true, details: reason, proposal: updatedProposal };
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
    let newStatus = this.getStatusById(newStatusId) || this.getStatusByCode(newStatusId);
    if (!newStatus) {
      newStatus = this.getStatuses().find(
        s => s.name.toUpperCase() === newStatusId.toUpperCase() || s.code.toUpperCase() === newStatusId.toUpperCase()
      );
    }
    if (!newStatus) throw new Error('Status inválido.');

    const user = customUser || this.getActiveUser();
    const nowIso = new Date().toISOString();

    const oldProposalCopy = { ...proposal };

    proposal.statusId = newStatus.id;
    proposal.currentResponsible = newStatus.responsibleGroup;
    proposal.updatedAt = nowIso;

    // Specific status timestamps
    if (newStatus.code === 'AGUARDAR_RETORNO_CIP') {
      if (!proposal.portabilitySlaStartedAt) {
        proposal.portabilitySlaStartedAt = nowIso;
      }
    } else {
      proposal.portabilitySlaStartedAt = undefined;
      if (newStatus.code === 'PAGO') {
        proposal.paidAt = nowIso;
        proposal.completedAt = nowIso;
      } else if (newStatus.code === 'CANCELADO') {
        proposal.cancelledAt = nowIso;
      } else if (newStatus.code === 'REPROVADO') {
        proposal.rejectedAt = nowIso;
      }
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
        logoUrl: '/branding/sentinel-consig-logo-transparent.png',
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
    if (!wl.logoUrl || wl.logoUrl === '/evolve_logo.png' || wl.logoUrl === '/app_logo.png' || wl.logoUrl === '/sentinel_logo.png') {
      wl.logoUrl = '/branding/sentinel-consig-logo-transparent.png';
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
      logoUrl: '/branding/sentinel-consig-logo-transparent.png',
      primaryColor: '#2563eb',
      supportEmail: 'suporte@sentinelconsig.com.br',
      footerText: 'SENTINEL CONSIG © 2026 - Central de Produção de Consignado',
    };
  }

  public static updateWhiteLabel(updates: Partial<WhiteLabelConfig>): WhiteLabelConfig {
    const currentWl = this.getWhiteLabel();
    const updatedWl = { ...currentWl, ...updates };
    this.updateConfig({ whiteLabel: updatedWl });

    fetch('/api/whitelabel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedWl),
    }).catch(err => console.warn('[API] Error updating whitelabel:', err));

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
      fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
      window.dispatchEvent(new Event('credit_gestao_storage_update'));
    }
  }

  public static markNotificationRead(id: string): void {
    this.markNotificationAsRead(id);
  }

  public static markAllNotificationsAsRead(): void {
    const list = this.getNotifications();
    list.forEach(n => (n.read = true));
    this.set(STORAGE_KEYS.NOTIFICATIONS, list);
    fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
    window.dispatchEvent(new Event('credit_gestao_storage_update'));
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
    return '';
  }

  public static verifySecurityAuth(input: string): boolean {
    const clean = (input || '').trim().toUpperCase();
    if (!clean) return false;
    return clean === 'EXCLUIR' || clean === 'CONFIRMAR';
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
      tenantId: activeUser.tenantId || (partner as any).tenantId || this.getCurrentTenantId() || 'tenant_evolve',
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
  /**
   * Resolve o tenantId associado a uma solicitação de simulação.
   */
  public static getSimulationTenantId(simulation: SimulationRequest): string {
    if (simulation.tenantId) {
      return simulation.tenantId;
    }
    if (simulation.createdById) {
      const creator = this.getUsers().find(u => u.id === simulation.createdById);
      if (creator && creator.tenantId) {
        return creator.tenantId;
      }
    }
    if (simulation.partnerId) {
      const partner = this.getPartners().find(p => p.id === simulation.partnerId);
      if (partner && (partner as any).tenantId) {
        return (partner as any).tenantId;
      }
    }
    return this.getCurrentTenantId() || 'tenant_evolve';
  }

  public static canChangeSimulationStatus(user: User, simulation: SimulationRequest): boolean {
    if (simulation.status === 'DIGITADA PELA MESA' || simulation.status === 'PERDIDA (NÃO DIGITADA)') return false;
    return ['PLATFORM_MASTER', 'MASTER', 'TENANT_ADMIN', 'GESTOR', 'GERENTE', 'SUPORTE', 'DIGITADOR'].includes(user.role);
  }

  /**
   * Verifica permissão para exclusão de simulação.
   * Regra por Matriz de Acesso:
   * - PLATFORM_MASTER: pode excluir qualquer simulação no contexto permitido. Quando operando em tenant específico, respeita o tenant ativo.
   * - MASTER / TENANT_ADMIN / GESTOR / GERENTE: podem excluir qualquer simulação do próprio tenant.
   * - DIGITADOR / SUPORTE: podem excluir apenas solicitações criadas por eles próprios, no próprio tenant, e que ainda não foram digitadas.
   * - Nenhuma role pode excluir solicitações cross-tenant.
   */
  public static canDeleteSimulationRequest(user: User, simulation: SimulationRequest): boolean {
    if (!user || !user.role || !simulation) {
      return false;
    }

    const simTenantId = this.getSimulationTenantId(simulation);
    const currentTenantId = this.getCurrentTenantId();
    const userTenantId = user.tenantId || currentTenantId || 'tenant_evolve';

    // 1. PLATFORM_MASTER
    if (user.role === 'PLATFORM_MASTER') {
      // Se PLATFORM_MASTER estiver atuando em contexto de tenant específico, respeita o tenant ativo
      if (currentTenantId && simTenantId !== currentTenantId) {
        return false;
      }
      return true;
    }

    // Isolar por tenant para todas as demais funções: não permitir exclusão cross-tenant
    if (userTenantId && simTenantId && userTenantId !== simTenantId) {
      return false;
    }

    // 2. MASTER, TENANT_ADMIN, GESTOR e GERENTE do próprio tenant
    if (['MASTER', 'TENANT_ADMIN', 'GESTOR', 'GERENTE'].includes(user.role)) {
      return true;
    }

    // 3. DIGITADOR e SUPORTE (apenas criadas por eles próprios e que ainda não foram digitadas pela mesa)
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
   * Exclui uma solicitação de simulação com validação rigorosa de autorização e auditoria.
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

    const simTenantId = this.getSimulationTenantId(sim);
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
        tenantId: simTenantId,
        cpfMasked: formatCpf(sim.cpf),
        reason: reason || 'Exclusão solicitada pelo usuário',
        deletedAt: new Date().toISOString(),
      }),
    });

    return true;
  }

  /**
   * Exclusão em massa de solicitações de simulação com validação individual de permissão, isolamento de tenant e auditoria.
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

    // Validar existência de cada ID solicitado
    for (const id of ids) {
      if (!requests.some(s => s.id === id)) {
        errors.push(`Simulação com ID ${id} não foi encontrada.`);
      }
    }

    for (const sim of requests) {
      if (idsToDeleteSet.has(sim.id)) {
        if (!this.canDeleteSimulationRequest(activeUser, sim)) {
          errors.push(`Sem permissão para excluir simulação CPF ${formatCpf(sim.cpf)} (${sim.id}).`);
          remainingRequests.push(sim);
        } else {
          successCount++;
          const simTenantId = this.getSimulationTenantId(sim);
          this.addAuditLog({
            action: 'EXCLUSAO_EM_MASSA_SIMULACAO',
            entity: 'SimulationRequest',
            entityId: sim.id,
            previousData: JSON.stringify(sim),
            newData: JSON.stringify({
              deletedBy: activeUser.name,
              userRole: activeUser.role,
              tenantId: simTenantId,
              cpfMasked: formatCpf(sim.cpf),
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
    const proposalPartnerCode = proposalPartner?.login || '';

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
          const simPartnerCode = simPartner?.login || '';
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

  // ==========================================
  // MULTI-TENANT & SAAS ENGINE
  // ==========================================
  public static getTenants(): Tenant[] {
    return this.get<Tenant[]>(STORAGE_KEYS.TENANTS, INITIAL_TENANTS);
  }

  public static getTenantById(id: string): Tenant | undefined {
    return this.getTenants().find(t => t.id === id);
  }

  public static getCurrentTenantId(): string {
    return this.get<string>(STORAGE_KEYS.CURRENT_TENANT_ID, 'tenant_evolve');
  }

  public static getCurrentTenant(): Tenant {
    const tenantId = this.getCurrentTenantId();
    const tenants = this.getTenants();
    const found = tenants.find(t => t.id === tenantId);
    return found || tenants[0] || INITIAL_TENANTS[0];
  }

  public static setCurrentTenantId(tenantId: string): void {
    this.set(STORAGE_KEYS.CURRENT_TENANT_ID, tenantId);
    window.dispatchEvent(new Event('tenantUpdated'));
    window.dispatchEvent(new Event('credit_gestao_storage_update'));
  }

  public static createTenant(tenantData: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>): Tenant {
    const tenants = this.getTenants();
    const slug = tenantData.slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
    
    if (tenants.some(t => t.slug === slug)) {
      throw new Error(`O slug "${slug}" já está em uso por outra empresa.`);
    }

    const newTenant: Tenant = {
      ...tenantData,
      id: `tenant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      slug,
      status: tenantData.status || 'ACTIVE',
      plan: tenantData.plan || 'PRO',
      maxUsers: tenantData.maxUsers || 15,
      storageLimitMb: tenantData.storageLimitMb || 1500,
      modules: tenantData.modules || ['ALL'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.set(STORAGE_KEYS.TENANTS, [...tenants, newTenant]);

    fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newTenant.id,
        name: newTenant.name,
        slug: newTenant.slug,
        cnpj: newTenant.cnpj || '',
        tradeName: newTenant.tradeName || '',
        plan: newTenant.plan,
        status: newTenant.status,
      }),
    }).catch(err => console.warn('[API] Error creating tenant:', err));

    this.addAuditLog({
      action: 'CRIACAO_TENANT',
      entity: 'Tenant',
      entityId: newTenant.id,
      newData: JSON.stringify(newTenant),
    });

    return newTenant;
  }

  public static updateTenant(tenant: Tenant): void {
    const tenants = this.getTenants();
    const updated = tenants.map(t => (t.id === tenant.id ? { ...tenant, updatedAt: new Date().toISOString() } : t));
    this.set(STORAGE_KEYS.TENANTS, updated);

    fetch(`/api/tenants/${tenant.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tenant.name,
        slug: tenant.slug,
        cnpj: tenant.cnpj || '',
        tradeName: tenant.tradeName || '',
        plan: tenant.plan,
        status: tenant.status,
        simulationAccessEnabled: tenant.simulationAccessEnabled !== undefined ? tenant.simulationAccessEnabled : true,
        happySimulationAccessEnabled: tenant.happySimulationAccessEnabled !== undefined ? tenant.happySimulationAccessEnabled : true,
      }),
    }).catch(err => console.warn('[API] Error updating tenant:', err));

    this.addAuditLog({
      action: 'EDICAO_TENANT',
      entity: 'Tenant',
      entityId: tenant.id,
      newData: JSON.stringify(tenant),
    });

    window.dispatchEvent(new Event('tenantUpdated'));
  }

  public static suspendTenant(tenantId: string, reason?: string): void {
    const tenants = this.getTenants();
    const updated = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, status: 'SUSPENDED' as TenantStatus, updatedAt: new Date().toISOString() };
      }
      return t;
    });
    this.set(STORAGE_KEYS.TENANTS, updated);

    fetch(`/api/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'SUSPENDED',
      }),
    }).catch(err => console.warn('[API] Error suspending tenant:', err));

    this.addAuditLog({
      action: 'SUSPENSAO_TENANT',
      entity: 'Tenant',
      entityId: tenantId,
      newData: JSON.stringify({ reason: reason || 'Sem justificativa' }),
    });

    window.dispatchEvent(new Event('tenantUpdated'));
  }

  public static activateTenant(tenantId: string): void {
    const tenants = this.getTenants();
    const updated = tenants.map(t => {
      if (t.id === tenantId) {
        return { ...t, status: 'ACTIVE' as TenantStatus, updatedAt: new Date().toISOString() };
      }
      return t;
    });
    this.set(STORAGE_KEYS.TENANTS, updated);

    fetch(`/api/tenants/${tenantId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ACTIVE',
      }),
    }).catch(err => console.warn('[API] Error activating tenant:', err));

    this.addAuditLog({
      action: 'ATIVACAO_TENANT',
      entity: 'Tenant',
      entityId: tenantId,
      newData: JSON.stringify({ activatedAt: new Date().toISOString() }),
    });

    window.dispatchEvent(new Event('tenantUpdated'));
  }

  // ==========================================
  // CLIENT CRM: DOCUMENTS & ATTACHMENTS
  // ==========================================
  public static getDocuments(): DocumentItem[] {
    return this.get<DocumentItem[]>(STORAGE_KEYS.DOCUMENTS, INITIAL_DOCUMENTS);
  }

  public static getDocumentsByClient(clientId: string): DocumentItem[] {
    return this.getDocuments().filter(d => d.clientId === clientId);
  }

  public static addDocument(docData: Omit<DocumentItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): DocumentItem {
    const docs = this.getDocuments();
    const newDoc: DocumentItem = {
      ...docData,
      id: docData.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.set(STORAGE_KEYS.DOCUMENTS, [newDoc, ...docs]);

    this.addAuditLog({
      action: 'UPLOAD_DOCUMENTO_CLIENTE',
      entity: 'DocumentItem',
      entityId: newDoc.id,
      newData: JSON.stringify({ clientId: newDoc.clientId, name: newDoc.name, type: newDoc.type }),
    });

    return newDoc;
  }

  public static deleteDocument(id: string): void {
    const docs = this.getDocuments();
    const target = docs.find(d => d.id === id);
    if (!target) return;

    this.set(STORAGE_KEYS.DOCUMENTS, docs.filter(d => d.id !== id));

    fetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(err => {
      console.warn('[StorageService] Erro ao deletar documento no servidor:', err);
    });

    this.addAuditLog({
      action: 'EXCLUSAO_DOCUMENTO_CLIENTE',
      entity: 'DocumentItem',
      entityId: id,
      previousData: JSON.stringify(target),
    });
  }

  // ==========================================
  // CLIENT CRM: COMMUNICATIONS & WHATSAPP LOGS
  // ==========================================
  public static getCommunications(): ClientCommunication[] {
    return this.get<ClientCommunication[]>(STORAGE_KEYS.COMMUNICATIONS, INITIAL_COMMUNICATIONS);
  }

  public static getCommunicationsByClient(clientId: string): ClientCommunication[] {
    return this.getCommunications().filter(c => c.clientId === clientId);
  }

  public static addCommunication(commData: Omit<ClientCommunication, 'id' | 'createdAt'>): ClientCommunication {
    const comms = this.getCommunications();
    const newComm: ClientCommunication = {
      ...commData,
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    this.set(STORAGE_KEYS.COMMUNICATIONS, [newComm, ...comms]);

    this.addAuditLog({
      action: 'ENVIO_COMUNICACAO_CLIENTE',
      entity: 'ClientCommunication',
      entityId: newComm.id,
      newData: JSON.stringify({
        clientId: newComm.clientId,
        channel: newComm.channel,
        recipient: newComm.recipient,
        eventType: newComm.eventType,
      }),
    });

    return newComm;
  }

  // ==========================================
  // CLIENT CRM: INTERNAL NOTES
  // ==========================================
  public static getClientNotes(clientId: string): ClientNote[] {
    const all = this.get<ClientNote[]>(STORAGE_KEYS.CLIENT_NOTES, INITIAL_CLIENT_NOTES);
    return all.filter(n => n.clientId === clientId);
  }

  public static addClientNote(noteData: Omit<ClientNote, 'id' | 'createdAt'>): ClientNote {
    const notes = this.get<ClientNote[]>(STORAGE_KEYS.CLIENT_NOTES, INITIAL_CLIENT_NOTES);
    const newNote: ClientNote = {
      ...noteData,
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    this.set(STORAGE_KEYS.CLIENT_NOTES, [newNote, ...notes]);
    return newNote;
  }

  // ==========================================
  // AGENDA & OPERATIONAL TASKS
  // ==========================================
  public static getOperationalTasks(): OperationalTask[] {
    return this.get<OperationalTask[]>(STORAGE_KEYS.OPERATIONAL_TASKS, INITIAL_OPERATIONAL_TASKS);
  }

  public static addOperationalTask(taskData: Omit<OperationalTask, 'id' | 'createdAt' | 'updatedAt' | 'completed'>): OperationalTask {
    const tasks = this.getOperationalTasks();
    const newTask: OperationalTask = {
      ...taskData,
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.set(STORAGE_KEYS.OPERATIONAL_TASKS, [newTask, ...tasks]);

    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newTask.id,
        title: newTask.title,
        description: newTask.description,
        category: newTask.category,
        priority: newTask.priority,
        dueDate: newTask.dueDate,
        completed: newTask.completed,
        assignedToId: newTask.assignedUserId || null,
      }),
    }).catch(err => console.warn('[API] Error creating task:', err));

    this.addAuditLog({
      action: 'CRIACAO_TAREFA_AGENDA',
      entity: 'OperationalTask',
      entityId: newTask.id,
      newData: JSON.stringify(newTask),
    });

    return newTask;
  }

  public static updateOperationalTask(task: OperationalTask): void {
    const tasks = this.getOperationalTasks();
    const updated = tasks.map(t => (t.id === task.id ? { ...task, updatedAt: new Date().toISOString() } : t));
    this.set(STORAGE_KEYS.OPERATIONAL_TASKS, updated);

    fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        dueDate: task.dueDate,
        completed: task.completed,
        assignedToId: task.assignedUserId || null,
      }),
    }).catch(err => console.warn('[API] Error updating task:', err));
  }

  public static toggleOperationalTaskCompleted(id: string): void {
    const tasks = this.getOperationalTasks();
    const activeUser = this.getActiveUser();
    const updated = tasks.map(t => {
      if (t.id === id) {
        const nextState = !t.completed;
        return {
          ...t,
          completed: nextState,
          completedAt: nextState ? new Date().toISOString() : undefined,
          completedByUserId: nextState ? activeUser.id : undefined,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });

    this.set(STORAGE_KEYS.OPERATIONAL_TASKS, updated);

    const updatedTask = updated.find(t => t.id === id);
    if (updatedTask) {
      fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed: updatedTask.completed,
        }),
      }).catch(err => console.warn('[API] Error toggling task:', err));
    }
  }

  public static deleteOperationalTask(id: string): void {
    const tasks = this.getOperationalTasks();
    this.set(STORAGE_KEYS.OPERATIONAL_TASKS, tasks.filter(t => t.id !== id));

    fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
    }).catch(err => console.warn('[API] Error deleting task:', err));
  }

  // ==========================================
  // GENERAL FINANCE (ENTRADAS & SAÍDAS GERAIS)
  // Sem cálculo de comissão automática
  // ==========================================
  public static getFinancialEntries(): FinancialEntry[] {
    return this.get<FinancialEntry[]>(STORAGE_KEYS.FINANCIAL_ENTRIES, INITIAL_FINANCIAL_ENTRIES);
  }

  public static addFinancialEntry(entryData: Omit<FinancialEntry, 'id' | 'createdAt' | 'updatedAt'>): FinancialEntry {
    const entries = this.getFinancialEntries();
    const newEntry: FinancialEntry = {
      ...entryData,
      id: `fin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.set(STORAGE_KEYS.FINANCIAL_ENTRIES, [newEntry, ...entries]);

    this.addAuditLog({
      action: 'LANCAMENTO_FINANCEIRO',
      entity: 'FinancialEntry',
      entityId: newEntry.id,
      newData: JSON.stringify(newEntry),
    });

    return newEntry;
  }

  public static updateFinancialEntry(entry: FinancialEntry): void {
    const entries = this.getFinancialEntries();
    const updated = entries.map(e => (e.id === entry.id ? { ...entry, updatedAt: new Date().toISOString() } : e));
    this.set(STORAGE_KEYS.FINANCIAL_ENTRIES, updated);
  }

  public static deleteFinancialEntry(id: string): void {
    const entries = this.getFinancialEntries();
    this.set(STORAGE_KEYS.FINANCIAL_ENTRIES, entries.filter(e => e.id !== id));
  }

  // ==========================================
  // GAMIFICATION & OPERATOR ACHIEVEMENTS
  // ==========================================
  public static getAchievements(): GamificationAchievement[] {
    return this.get<GamificationAchievement[]>(STORAGE_KEYS.ACHIEVEMENTS, INITIAL_ACHIEVEMENTS);
  }

  public static unlockAchievement(operatorId: string, operatorName: string, code: GamificationAchievement['code']): void {
    const achievements = this.getAchievements();
    if (achievements.some(a => a.operatorId === operatorId && a.code === code)) {
      return; // Already unlocked
    }

    const map: Record<string, { title: string; description: string; icon: string }> = {
      META_BATIDA: { title: 'Meta Batida', description: 'Atingiu 100% da meta operacional mensal.', icon: '🏆' },
      PRIMEIRA_VENDA: { title: 'Primeira Venda', description: 'Primeira proposta com status PAGO cadastrada.', icon: '🚀' },
      '100_PROPOSTAS': { title: '100 Propostas', description: 'Alcançou a marca de 100 propostas movimentadas.', icon: '💯' },
      MAIOR_PRODUCAO: { title: 'Maior Produção', description: 'Líder em volume financeiro liberado no período.', icon: '👑' },
      MELHOR_CONVERSAO: { title: 'Melhor Conversão', description: 'Maior taxa de propostas pagas vs. canceladas.', icon: '🎯' },
      ZERO_CANCELAMENTOS: { title: 'Zero Cancelamentos', description: 'Manteve 100% de propostas sem cancelamento.', icon: '🛡️' },
    };

    const meta = map[code] || { title: code, description: 'Conquista desbloqueada', icon: '⭐' };

    const newAch: GamificationAchievement = {
      id: `ach_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code,
      title: meta.title,
      description: meta.description,
      icon: meta.icon,
      unlockedAt: new Date().toISOString(),
      operatorId,
      operatorName,
    };

    this.set(STORAGE_KEYS.ACHIEVEMENTS, [newAch, ...achievements]);

    this.addNotification({
      title: `Nova Conquista: ${meta.title} ${meta.icon}`,
      message: `Parabéns ${operatorName}! Você desbloqueou a conquista: ${meta.description}`,
      type: 'ALERTA_GERAL',
      priority: 'NORMAL',
    });
  }

  // ==========================================
  // COMMERCIAL RADAR & REAL DATA BI INSIGHTS
  // ==========================================
  public static getCommercialInsights(): CommercialInsight[] {
    const proposals = this.getProposals();
    const banks = this.getBanks();
    const partners = this.getPartners();
    const statuses = this.getStatuses();

    const insights: CommercialInsight[] = [];

    // 1. Bank Conversion Rate
    const paidStatus = statuses.find(s => s.code === 'PAGO');
    const cancelledStatus = statuses.find(s => s.code === 'CANCELADO');

    let bestBank = '';
    let highestPaidCount = 0;
    for (const b of banks) {
      const bankProps = proposals.filter(p => p.bankId === b.id);
      const paid = bankProps.filter(p => p.statusId === paidStatus?.id).length;
      if (paid > highestPaidCount) {
        highestPaidCount = paid;
        bestBank = b.name;
      }
    }

    if (bestBank) {
      insights.push({
        id: 'ins-1',
        type: 'BANCO_ALTA_CONVERSAO',
        title: 'Banco com Maior Eficiência de Liquidação',
        description: `${bestBank} lidera o volume de contratos pagos este mês com excelente taxa de conversão.`,
        metricValue: `${highestPaidCount} Pagas`,
        trend: 'UP',
        severity: 'SUCCESS',
      });
    }

    // 2. Partner Activity Alert
    const activePartnersCount = partners.filter(p => p.active).length;
    insights.push({
      id: 'ins-2',
      type: 'PARCEIRO_CRESCIMENTO',
      title: 'Rede de Parceiros Ativa',
      description: `${activePartnersCount} correspondentes ativos gerando novas solicitações e formalizações.`,
      metricValue: `${activePartnersCount} Ativos`,
      trend: 'UP',
      severity: 'INFO',
    });

    // 3. Portability CIP Bottleneck check
    const cipStatus = statuses.find(s => s.code === 'AGUARDAR_RETORNO_CIP');
    const inCip = proposals.filter(p => p.statusId === cipStatus?.id);
    if (inCip.length > 0) {
      insights.push({
        id: 'ins-3',
        type: 'GARGALO_HORARIO',
        title: 'Portabilidades em Monitoramento CIP',
        description: `${inCip.length} proposta(s) aguardando retorno do saldo devedor das instituições credoras.`,
        metricValue: `${inCip.length} em CIP`,
        trend: 'STABLE',
        severity: 'WARNING',
      });
    }

    return insights;
  }

  // ==========================================
  // SENTINELA IA: OPERATIONAL ASSISTANT
  // ==========================================
  public static async askSentinelaAI(prompt: string): Promise<string> {
    const proposals = this.getProposals();
    const clients = this.getClients();
    const partners = this.getPartners();
    const banks = this.getBanks();
    const statuses = this.getStatuses();
    const users = this.getUsers();

    const totalVolumeDisbursed = proposals.reduce((acc, p) => acc + (p.disbursedValue || 0), 0);
    const totalBalance = proposals.reduce((acc, p) => acc + (p.contractBalance || 0), 0);
    const totalCount = proposals.length;
    const paidCount = proposals.filter(p => {
      const st = statuses.find(s => s.id === p.statusId);
      return st?.code === 'PAGO';
    }).length;

    const lower = prompt.toLowerCase();

    if (lower.includes('quem produziu') || lower.includes('producao') || lower.includes('digitador')) {
      const byDigitizer: Record<string, number> = {};
      proposals.forEach(p => {
        byDigitizer[p.digitizerId] = (byDigitizer[p.digitizerId] || 0) + 1;
      });
      let topUser = '';
      let maxP = 0;
      Object.entries(byDigitizer).forEach(([uid, count]) => {
        if (count > maxP) {
          maxP = count;
          topUser = users.find(u => u.id === uid)?.name || 'Digitador';
        }
      });
      return `📊 **Análise de Produção da Mesa:**\nO operador com maior volume registrado é **${topUser}** com **${maxP} propostas**. O total geral da mesa acumula **${totalCount} propostas** cadastradas.`;
    }

    if (lower.includes('banco') || lower.includes('conversao') || lower.includes('melhor')) {
      return `🏦 **Radar de Bancos:**\nO banco com maior movimentação e fluidez no momento é o **C6 Bank**, seguido por **Daycoval** e **BRB**. Temos **${paidCount} propostas liquidadas com sucesso**.`;
    }

    if (lower.includes('meta') || lower.includes('quanto falta') || lower.includes('valor')) {
      const meta = 250000;
      const pct = ((totalVolumeDisbursed / meta) * 100).toFixed(1);
      return `🎯 **Acompanhamento de Metas:**\n- Volume Liberado Líquido: **R$ ${totalVolumeDisbursed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**\n- Meta Mensal: **R$ ${meta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**\n- Atingimento: **${pct}%** da meta conquistada!\n- Saldo em Portabilidades monitoradas: **R$ ${totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}**.`;
    }

    if (lower.includes('cip') || lower.includes('portabilidade') || lower.includes('parada')) {
      const cipProps = proposals.filter(p => {
        const st = statuses.find(s => s.id === p.statusId);
        return st?.code === 'AGUARDAR_RETORNO_CIP';
      });
      return `⏳ **Status das Portabilidades em CIP:**\nAtualmente temos **${cipProps.length} proposta(s)** em processamento CIP. Acompanhe a esteira de 5 dias úteis para agir antes do vencimento do prazo regulatório.`;
    }

    return `🤖 **Sentinela IA Operacional:**\nCom base nos dados em tempo real da mesa, temos **${totalCount} propostas** ativas no sistema, totalizando **R$ ${totalVolumeDisbursed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** em valores liberados e **${paidCount} contratos liquidados**. Como posso ajudar na análise da sua operação hoje?`;
  }

  // ==========================================
  // REMOTE BACKUPS ENGINE (SHA-256 & RESTORE)
  // ==========================================
  public static getBackupSnapshots(): any[] {
    return this.get<any[]>(STORAGE_KEYS.BACKUP_SNAPSHOTS, []);
  }

  public static createBackupSnapshot(label?: string): any {
    const allData: Record<string, any> = {};
    for (const [key, colName] of Object.entries(this.KEY_TO_COLLECTION)) {
      allData[colName] = this.get<any[]>(key, []);
    }

    const payload = JSON.stringify(allData);
    const sizeBytes = new Blob([payload]).size;
    const activeUser = this.getActiveUser();
    const hash = computeSha256(payload);

    const snapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenantId: this.getCurrentTenantId(),
      label: label || `Backup Automático ${new Date().toLocaleString('pt-BR')}`,
      createdAt: new Date().toISOString(),
      authorId: activeUser.id,
      authorName: activeUser.name,
      recordsCount: Object.values(allData).reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0),
      sizeBytes,
      checksumSha256: hash,
      data: allData,
    };

    const existing = this.getBackupSnapshots();
    const updated = [snapshot, ...existing].slice(0, 30); // Retain 30 snapshots
    this.set(STORAGE_KEYS.BACKUP_SNAPSHOTS, updated);

    this.addAuditLog({
      action: 'GERACAO_BACKUP_SISTEMA',
      entity: 'BackupSnapshot',
      entityId: snapshot.id,
      newData: JSON.stringify({
        label: snapshot.label,
        sizeBytes: snapshot.sizeBytes,
        recordsCount: snapshot.recordsCount,
        checksumSha256: hash,
      }),
    });

    return snapshot;
  }

  public static restoreBackupSnapshot(snapshotId: string): boolean {
    const snapshots = this.getBackupSnapshots();
    const target = snapshots.find(s => s.id === snapshotId);
    if (!target || !target.data) {
      throw new Error('Snapshot de backup não encontrado ou corrompido.');
    }

    // Safety Step: Create an automatic pre-restore snapshot before modifying current state
    try {
      this.createBackupSnapshot(`Snapshot de Segurança Pré-Restauração (${target.label})`);
    } catch (e) {
      console.warn('Aviso ao criar snapshot pré-restauração:', e);
    }

    for (const [key, colName] of Object.entries(this.KEY_TO_COLLECTION)) {
      if (target.data[colName]) {
        this.set(key, target.data[colName]);
      }
    }

    this.addAuditLog({
      action: 'RESTAURACAO_BACKUP_SISTEMA',
      entity: 'BackupSnapshot',
      entityId: snapshotId,
      newData: JSON.stringify({
        label: target.label,
        restoredAt: new Date().toISOString(),
        author: this.getActiveUser().name,
        checksumSha256: target.checksumSha256,
      }),
    });

    window.dispatchEvent(new Event('credit_gestao_storage_update'));
    return true;
  }
}

/**
 * Função utilitária standalone exportada para processamento de correspondência de simulações.
 */
export function processSimulationMatching(proposal: Proposal): number {
  return StorageService.processSimulationMatching(proposal);
}

