export type Role =
  | 'PLATFORM_MASTER'
  | 'MASTER'
  | 'TENANT_ADMIN'
  | 'GESTOR'
  | 'GERENTE'
  | 'SUPORTE'
  | 'DIGITADOR'
  | 'SIMULACAO';

export interface UserTenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  tenant?: Tenant;
  role: Role;
  customPermissions?: string[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  tenantId?: string;
  tenant?: Tenant;
  memberships?: UserTenantMembership[];
  customPermissions?: string[];
  isMasterProtected?: boolean;
  password?: string;
  mustChangePassword?: boolean;
  requireTenantSelection?: boolean;
  availableMemberships?: any[];
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type Alcada = 'CLIENTE' | 'PARCEIRO' | 'BANCO' | 'NOSSA EQUIPE' | 'SISTEMA';
export type ResponsibleAlçada = Alcada;

export type TenantPlan = 'STARTER' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'TRIAL' | 'PENDING_DELETION' | 'PENDING_SETUP';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  customDomain?: string;
  cnpj?: string;
  razaoSocial?: string;
  tradeName?: string;
  plan: TenantPlan;
  status: TenantStatus;
  maxUsers: number;
  storageLimitMb: number;
  maxProposals?: number;
  modules?: string[];
  enabledModules?: string[];
  simulationAccessEnabled?: boolean;
  happySimulationAccessEnabled?: boolean;
  whiteLabel?: WhiteLabelConfig;
  adminEmail?: string;
  adminName?: string;
  _count?: {
    users?: number;
    proposals?: number;
    clients?: number;
    documents?: number;
    tasks?: number;
  };
  lastActivityAt?: string;
  lastActivityDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Promoter {
  id: string;
  name: string;
  active: boolean;
  observation?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bank {
  id: string;
  name: string;
  code?: string;
  active: boolean;
  observation?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankPromoter {
  id: string;
  bankId: string;
  promoterId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Partner {
  id: string;
  name?: string;
  fullName: string;
  login: string; // Identifier/Login/Code, e.g., AL155, JOCYANE@155, KAUAI@16740, 00123
  code?: string;
  promoterId: string;
  active: boolean;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Convenio {
  id: string;
  name: string;
  code?: string;
  description?: string;
  scope: 'GLOBAL' | 'EXCLUSIVE';
  tenantId?: string;
  tenantName?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalRule {
  id: string;
  name: string;
  description?: string;
  scope: 'GLOBAL' | 'EXCLUSIVE';
  tenantId?: string;
  tenantName?: string;
  active: boolean;
  appliesToAllProducts: boolean;
  productIds: string[];
  appliesToAllConvenios: boolean;
  convenioIds: string[];
  minInstallments?: number;
  maxInstallments?: number;
  minContractValue?: number;
  maxContractValue?: number;
  requiresCipBalance?: boolean;
  allowsMultipleAde?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  code?: string;
  description?: string;
  scope?: 'GLOBAL' | 'EXCLUSIVE';
  tenantId?: string;
  tenantName?: string;
  active: boolean;
  type: string;
  allowsMultipleAde: boolean;
  requiresPortabilityRelation: boolean;
  convenioIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  cpf: string; // Raw 11 digits
  fullName: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  birthDate?: string;
  matricula?: string;
  orgao?: string;
  convenio?: string;
  margemDisponivel?: number;
  city?: string;
  state?: string;
  observation?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export type DocumentType =
  | 'RG'
  | 'CNH'
  | 'CONTRACHEQUE'
  | 'EXTRATO'
  | 'PROCURACAO'
  | 'COMPROVANTE_RESIDENCIA'
  | 'TERMO_ADESAO'
  | 'OUTROS';

export interface DocumentItem {
  id: string;
  tenantId?: string;
  clientId: string;
  proposalId?: string;
  name: string;
  type: DocumentType;
  fileUrl: string; // Firebase Storage URL or base64
  fileSizeBytes: number;
  uploadedByUserId: string;
  uploadedByUserName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientCommunication {
  id: string;
  tenantId?: string;
  clientId: string;
  proposalId?: string;
  channel: 'WHATSAPP' | 'EMAIL' | 'SMS' | 'TELEFONE' | 'SISTEMA';
  templateName?: string;
  eventType?:
    | 'PROPOSTA_CRIADA'
    | 'PENDENCIA_DOCUMENTACAO'
    | 'SALDO_RETORNADO'
    | 'PAGAMENTO_LIBERADO'
    | 'CANCELAMENTO'
    | 'AVULSO';
  recipient: string; // Phone or email
  messageContent: string;
  status: 'ENVIADO' | 'PENDENTE' | 'FALHA' | 'RECEBIDO';
  sentByUserId: string;
  sentByUserName: string;
  createdAt: string;
}

export interface ClientNote {
  id: string;
  tenantId?: string;
  clientId: string;
  proposalId?: string;
  authorId: string;
  authorName: string;
  note: string;
  createdAt: string;
}

export type TaskCategory =
  | 'RETORNO'
  | 'FOLLOW_UP'
  | 'PENDENCIA'
  | 'SALDO_CIP'
  | 'CLIENTE'
  | 'PARCEIRO'
  | 'INTERNA'
  | 'OUTRO';

export type TaskPriority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export interface OperationalTask {
  id: string;
  tenantId?: string;
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD or ISO
  completed: boolean;
  completedAt?: string;
  completedByUserId?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  clientId?: string;
  clientName?: string;
  proposalId?: string;
  proposalNumber?: string;
  partnerId?: string;
  partnerName?: string;
  createdAt: string;
  updatedAt: string;
}

export type EntryType = 'ENTRADA' | 'SAIDA';
export type FinancialCategory =
  | 'RECEBIMENTO_OPERACIONAL'
  | 'COMISSAO_RECEBIDA'
  | 'DESPESA_FIXA'
  | 'DESPESA_VARIAVEL'
  | 'SERVICO'
  | 'OUTROS';
export type FinancialStatus = 'PREVISTO' | 'REALIZADO' | 'CANCELADO';

export interface FinancialEntry {
  id: string;
  tenantId?: string;
  type: EntryType;
  category: FinancialCategory;
  title: string;
  description?: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  paymentDate?: string; // YYYY-MM-DD
  status: FinancialStatus;
  bankId?: string;
  bankName?: string;
  proposalId?: string;
  proposalNumber?: string;
  partnerId?: string;
  createdAt: string;
  updatedAt: string;
}

export type AchievementCode =
  | 'META_BATIDA'
  | 'PRIMEIRA_VENDA'
  | '100_PROPOSTAS'
  | 'MAIOR_PRODUCAO'
  | 'MELHOR_CONVERSAO'
  | 'ZERO_CANCELAMENTOS';

export interface GamificationAchievement {
  id: string;
  code: AchievementCode;
  title: string;
  description: string;
  icon: string;
  unlockedAt: string;
  operatorId: string;
  operatorName: string;
}

export interface CommercialInsight {
  id: string;
  type: 'BANCO_ALTA_CONVERSAO' | 'PARCEIRO_CRESCIMENTO' | 'PARCEIRO_QUEDA' | 'PRODUTO_DESTAQUE' | 'ALERTA_CANCELAMENTO' | 'GARGALO_HORARIO';
  title: string;
  description: string;
  metricValue: string | number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  severity: 'SUCCESS' | 'INFO' | 'WARNING';
}

export interface AIChatMessage {
  id: string;
  sender: 'USER' | 'SENTINELA_IA';
  text: string;
  timestamp: string;
  contextData?: Record<string, any>;
}

export type ProposalStatusCode =
  | 'AGUARDAR_FORMALIZACAO'
  | 'AGUARDA_LIBERACAO_CORBAN'
  | 'AGUARDAR_RETORNO_CIP'
  | 'AGUARDAR_PORTABILIDADE'
  | 'SALDO_RETORNADO'
  | 'REPROVADO'
  | 'CANCELADO'
  | 'PAGO'
  | 'PENDENTE_ENVIO_DOCUMENTACAO'
  | 'PENDENTE_ANEXO_DOCUMENTACAO'
  | 'INTEGRADO'
  | (string & {});

export interface ProposalStatus {
  id: string;
  name: string;
  code: ProposalStatusCode;
  active: boolean;
  order: number;
  responsibleGroup: Alcada;
  responsible: Alcada; // Alias
  slaHours: number;
  finalStatus: boolean;
  manualChangeAllowed: boolean;
  automaticChangeAllowed: boolean;
  productType?: string;
  color: string;
  standardCategory?: string;
}

export type Status = ProposalStatus;

export interface Proposal {
  id: string;
  proposalNumber: string; // ADE / Identifier (can be number, text, or UUID)
  clientId: string;
  clientCpf?: string;
  clientName?: string;
  client?: { id: string; cpf: string; fullName: string; phone?: string; email?: string };
  productId: string;
  productCode?: string;
  productName?: string;
  product?: any;
  convenioId?: string;
  convenioCode?: string;
  convenioName?: string;
  convenio?: any;
  bankId: string;
  bankCode?: string;
  bankName?: string;
  bank?: any;
  promoterId: string;
  promoterCode?: string;
  promoterName?: string;
  promoter?: any;
  partnerId: string;
  partnerCode?: string;
  partnerName?: string;
  partner?: any;
  digitizerId: string;
  statusId: string;
  statusCode?: string;
  statusName?: string;
  status?: any;
  currentResponsible: Alcada;
  disbursedValue?: number; // Valor liberado para o cliente / troco (R$)
  contractBalance?: number; // Valor do saldo do contrato / saldo devedor / quitação em portabilidade (R$)
  installmentValue?: number; // Valor da parcela (R$)
  installmentsCount?: number; // Prazo / Quantidade de parcelas
  debtBalance?: number; // Saldo devedor quitação
  commissionRate?: number; // Porcentagem de comissão (%)
  type?: 'NOVO' | 'REFIN' | 'PORTABILIDADE' | 'REFIN_PORTABILIDADE' | 'CARTAO_RMC' | string;
  relatedPortabilityId?: string;
  pendencies?: Pending[];
  statusHistory?: ProposalStatusHistory[];
  comments?: Comment[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  portabilitySlaStartedAt?: string; // Timestamp when entered AGUARDAR_RETORNO_CIP
  retentionDeadline?: string | null;
  completedAt?: string;
  paidAt?: string;
  cancelledAt?: string;
  rejectedAt?: string;

  // C6 Bank Integration
  c6ProposalNumber?: string;
  c6OperationNumber?: string;
  c6RawSituation?: string;
  c6CurrentActivity?: string;
  c6ActivityDescription?: string;
  c6FormalizationStatus?: string;
  c6FormalizationCode?: string;
  c6LastActivityDate?: string;
  c6LastSyncAt?: string;
  c6SyncStatus?: 'SYNCED' | 'PENDING' | 'ERROR' | 'MISSING_IDENTIFIER';
  c6SyncError?: string;
  c6RawData?: any;

  // FACTA Financeira Integration
  factaProposalNumber?: string;
  factaAfCode?: string;
  factaContractNumber?: string;
  factaRawStatus?: string;
  factaCrivoStatus?: string;
  factaLastMovementAt?: string;
  factaLastSyncAt?: string;
  factaSyncStatus?: 'SYNCED' | 'PENDING' | 'ERROR' | 'UNLINKED';
  factaSyncError?: string;
  factaRawData?: any;

  // Happy / BYX Capital Integration
  happyContractId?: string;
  happyStatus?: string;
  happyStatusCode?: number;
  happyStatusName?: string;
  happyStatusDescription?: string;
  happyProductType?: string;
  happyPortabilityStatus?: string;
  happyDigitizer?: string;
  happyProposalKey?: string;
  happyCustomerId?: string;
  happyLastSyncAt?: string;
  happySyncStatus?: 'SYNCED' | 'PENDING' | 'ERROR' | 'UNMATCHED';
  happySyncError?: string;
  happyRawData?: any;
}

export interface C6SyncHistoryItem {
  id: string;
  tenantId: string;
  proposalId: string;
  c6ProposalNumber: string;
  c6OperationNumber?: string;
  queryDate: string;
  success: boolean;
  previousRawSituation?: string;
  currentRawSituation?: string;
  previousActivity?: string;
  currentActivity?: string;
  previousInternalStatus?: string;
  currentInternalStatus?: string;
  hasChanged: boolean;
  technicalError?: string;
  rawResponse?: any;
  queriedBy?: string;
  createdAt: string;
}

export interface FactaSyncHistoryItem {
  id: string;
  tenantId: string;
  proposalId?: string;
  factaProposalNumber?: string;
  factaAfCode?: string;
  factaContractNumber?: string;
  queryDate: string;
  success: boolean;
  previousRawStatus?: string;
  currentRawStatus?: string;
  previousCrivoStatus?: string;
  currentCrivoStatus?: string;
  previousInternalStatus?: string;
  currentInternalStatus?: string;
  hasChanged: boolean;
  statusMapped: boolean;
  unlinkedReason?: string;
  technicalError?: string;
  rawResponse?: any;
  queriedBy?: string;
  createdAt: string;
}

export interface C6ConfigState {
  username: string;
  baseUrl: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  isConfigured: boolean;
  hasPassword: boolean;
}

export interface FactaConfigState {
  environment: 'homologation' | 'production';
  username: string;
  baseUrl: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  pageSize: number;
  dateQueryType: 'data_movimento' | 'data_alteracao';
  convenio?: string;
  averbador?: string;
  codigoAf?: string;
  consultaSub: 'S' | 'N';
  codigoSub?: string;
  isConfigured: boolean;
  hasPassword: boolean;
}

export interface C6WorkerStatusState {
  isRunning: boolean;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  lastRunAt: string | null;
  lastRunSuccess: boolean;
  lastRunItemCount: number;
  lastRunError: string | null;
  pendingProposalsCount: number;
  recentFailuresCount: number;
  activeLock: boolean;
}

export interface FactaWorkerStatusState {
  isRunning: boolean;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  lastRunAt: string | null;
  lastRunSuccess: boolean;
  lastRunProcessedCount: number;
  lastRunUpdatedCount: number;
  lastRunUnlinkedCount: number;
  lastRunError: string | null;
  pendingProposalsCount: number;
  recentFailuresCount: number;
  activeLock: boolean;
}

export interface HappyConfigState {
  ambiente: 'staging' | 'production';
  baseUrl: string;
  clientId: string;
  secret?: string;
  usuario: string;
  senha?: string;
  cpfDigitador: string;
  correspondenteBanqueiro: string;
  ativo: boolean;
  isConfigured: boolean;
  hasSecret: boolean;
  hasSenha: boolean;
}

export interface HappySyncHistoryItem {
  id: string;
  tenantId: string;
  proposalId?: string;
  happyContractId?: string;
  operation: string;
  status: string;
  previousStatus?: string;
  newStatus?: string;
  requestId?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  rawResponse?: any;
  proposal?: {
    id: string;
    proposalNumber: string;
    client?: { fullName: string; cpf: string };
  };
}

export interface HappyWebhookEventItem {
  id: string;
  tenantId?: string;
  requestId: string;
  eventName: string;
  customerId?: string;
  contractId?: string;
  digitador?: string;
  statusCode?: number;
  statusName?: string;
  statusDescription?: string;
  proposalKey?: string;
  payload: any;
  receivedAt: string;
  processedAt?: string;
  processingStatus: string;
  processingError?: string;
  matchedProposalId?: string;
}

export interface HappyStatusState {
  isConfigured: boolean;
  isActive: boolean;
  ambiente: 'staging' | 'production';
  lastSyncAt: string | null;
  lastWebhookReceivedAt: string | null;
  lastWebhookProcessedAt: string | null;
  unmatchedWebhooksCount: number;
  totalSyncedCount: number;
  recentErrorsCount: number;
  lastError: string | null;
}

export interface ProposalRelation {
  id: string;
  portabilityProposalId: string; // Primary Portabilidade
  refinProposalId: string; // Related Refin da Portabilidade
  createdAt: string;
}

export interface ProposalStatusHistory {
  id: string;
  proposalId: string;
  userId?: string;
  userName: string;
  previousStatusId?: string;
  previousStatusName?: string;
  newStatusId: string;
  newStatusName: string;
  action: string;
  observation?: string;
  origin: 'MANUAL' | 'SISTEMA' | 'IMPORTACAO' | 'ALTERACAO_EM_LOTE';
  createdAt: string;
}

export interface Comment {
  id: string;
  proposalId: string;
  userId: string;
  userName: string;
  userRole: Role;
  comment: string;
  createdAt: string;
}

export type PendingType =
  | 'DOCUMENTACAO'
  | 'BANCO'
  | 'PARCEIRO'
  | 'CLIENTE'
  | 'CORBAN'
  | 'CIP'
  | 'SISTEMA'
  | 'OUTROS';

export type PendencyType = PendingType;
export type PendencyPriority = 'NORMAL' | 'ALTA' | 'URGENTE';

export interface Pending {
  id: string;
  proposalId: string;
  clientId: string;
  responsibleUserId?: string;
  responsibleUserName?: string;
  responsibleGroup: Alcada;
  type: PendingType;
  description: string;
  openedAt: string;
  deadline?: string;
  status: 'ABERTA' | 'RESOLVIDA' | 'CANCELADA';
  resolvedAt?: string;
  resolvedByUserId?: string;
  resolvedByUserName?: string;
}

export type Pendency = Pending;

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  active: boolean;
}

export type NotificationPriority = 'NORMAL' | 'ATENCAO' | 'URGENTE';

export interface Notification {
  id: string;
  proposalId?: string;
  title: string;
  message: string;
  type:
    | 'NOVA_PENDENCIA'
    | 'SLA_PROXIMO'
    | 'SLA_ESTOURADO'
    | 'PORTABILIDADE_PROXIMA'
    | 'PORTABILIDADE_5_DIA'
    | 'PORTABILIDADE_ATRASADA'
    | 'SALDO_RETORNADO'
    | 'ALTERACAO_IMPORTANTE'
    | 'ALERTA_GERAL';
  priority: NotificationPriority;
  read: boolean;
  createdAt: string;
}

export type SystemNotification = Notification;

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  action: string;
  entity: string;
  entityId: string;
  previousData?: string;
  newData?: string;
  createdAt: string;
}

export interface ExportLog {
  id: string;
  userId: string;
  userName: string;
  productName: string;
  filters: string;
  quantity: number;
  fileName: string;
  createdAt: string;
}

export interface DatabaseBackupSnapshot {
  id: string;
  createdAt: string;
  type: 'AUTOMATICO_CRON' | 'MANUAL';
  fileName: string;
  fileSizeBytes: number;
  stats: {
    proposalsCount: number;
    clientsCount: number;
    partnersCount: number;
    banksCount: number;
    historyCount: number;
    pendingsCount: number;
    usersCount: number;
  };
  dataDump: Record<string, any>;
  createdByUserName: string;
  note?: string;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  intervalHours: number; // e.g. 0.5 (30min), 1, 6, 12, 24
  lastRunAt: string | null;
  nextRunAt: string | null;
  maxSnapshotsToKeep: number;
  autoDownload: boolean;
}

export interface SystemExceptionLog {
  id: string;
  timestamp: string;
  severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
  operation:
    | 'IMPORT_EXCEL'
    | 'BULK_STATUS'
    | 'BULK_DELETE'
    | 'BACKUP_RESTORE'
    | 'SLA_CHECK'
    | 'EXPORT_EXCEL'
    | 'VALIDATION_EXCEPTION'
    | 'GENERAL';
  title: string;
  message: string;
  details?: string;
  contextData?: Record<string, any>;
  userId?: string;
  userName?: string;
  userRole?: Role;
  resolved?: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface WhiteLabelConfig {
  companyName: string;
  tradeName?: string;
  cnpj?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  supportEmail?: string;
  supportPhone?: string;
  customDomain?: string;
  themeMode?: 'light' | 'dark' | 'system';
  footerText?: string;
}

export interface SystemConfig {
  portabilityBalanceDays: number;
  autoCronIntervalMinutes: number;
  backupSchedule?: BackupScheduleConfig;
  whiteLabel?: WhiteLabelConfig;
}

export type ExecutiveWidgetId =
  | 'TREND_30_DAYS'
  | 'OPERATOR_PERFORMANCE'
  | 'PARTNERS_RANKING'
  | 'BANKS_VOLUME'
  | 'STATUS_DISTRIBUTION'
  | 'BOTTLENECK_METRICS';

export interface ExecutiveWidgetConfig {
  id: ExecutiveWidgetId;
  title: string;
  description: string;
  category: 'TRENDS' | 'TEAM' | 'PARTNERS' | 'OPERATIONS';
  colSpan: 1 | 2;
  enabled: boolean;
  minimized?: boolean;
}

export type SimulationType = 'MANUAL' | 'HAPPY_INSS' | 'HAPPY_CLT';

export type SimulationOperationType = 'MARGEM_LIVRE' | 'PORTABILIDADE_REFIN' | 'CONSIGNADO_PRIVADO_CLT';

export type SimulationStatus =
  | 'SIMULAÇÃO ENVIADA'
  | 'NÃO PASSÍVEL DE CONTRATAÇÃO'
  | 'DIGITADA PELA MESA'
  | 'PERDIDA (NÃO DIGITADA)';

export interface SimulationRequest {
  id: string;
  cpf: string; // 11 raw digits normalized
  partnerId?: string;
  partner?: Partner;
  createdById: string;
  tenantId?: string;
  status: SimulationStatus;
  simulationType?: SimulationType;
  operationType?: SimulationOperationType;
  happyClientId?: string;
  happySimulationId?: string;
  happyApplicationKey?: string;
  happyProposalKey?: string;
  happyJourneyStatus?: string;
  happyAuthUrl?: string;
  happyBeneficioNumero?: string;
  happyDataNascimento?: string;
  happyClienteNome?: string;
  happyClienteTelefone?: string;
  happyRawData?: any;
  happyRawConditions?: any;
  happySelectedCondition?: any;
  happyRawResult?: any;
  convenioId?: string;
  convenioName?: string;
  productId?: string;
  productName?: string;
  createdAt: string;
  updatedAt: string;
  matchedProposalId?: string;
  matchedProposalNumber?: string;
  matchedDigitizerId?: string;
  matchedDigitizerName?: string;
  matchedAt?: string;
  rejectionReason?: string;
}

