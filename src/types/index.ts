export type Role = 'MASTER' | 'GESTOR' | 'GERENTE' | 'SUPORTE' | 'DIGITADOR' | 'SIMULACAO';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  password?: string;
  mustChangePassword?: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type Alcada = 'CLIENTE' | 'PARCEIRO' | 'BANCO' | 'NOSSA EQUIPE' | 'SISTEMA';
export type ResponsibleAlçada = Alcada;

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
  fullName: string;
  login: string; // Format: NOME@CODIGO, e.g., KAUAI@16740
  promoterId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  type: string;
  allowsMultipleAde: boolean;
  requiresPortabilityRelation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  cpf: string; // Raw 11 digits
  fullName: string;
  phone?: string;
  email?: string;
  observation?: string;
  createdAt: string;
  updatedAt: string;
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
}

export type Status = ProposalStatus;

export interface Proposal {
  id: string;
  proposalNumber: string; // ADE / Identifier (can be number, text, or UUID)
  clientId: string;
  productId: string;
  bankId: string;
  promoterId: string;
  partnerId: string;
  digitizerId: string;
  statusId: string;
  currentResponsible: Alcada;
  relatedPortabilityId?: string;
  pendencies?: Pending[];
  statusHistory?: ProposalStatusHistory[];
  comments?: Comment[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  portabilitySlaStartedAt?: string; // Timestamp when entered AGUARDAR_RETORNO_CIP
  completedAt?: string;
  paidAt?: string;
  cancelledAt?: string;
  rejectedAt?: string;
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
    | 'ALTERACAO_IMPORTANTE';
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

export type SimulationStatus =
  | 'SIMULAÇÃO ENVIADA'
  | 'NÃO PASSÍVEL DE CONTRATAÇÃO'
  | 'DIGITADA PELA MESA'
  | 'PERDIDA (NÃO DIGITADA)';

export interface SimulationRequest {
  id: string;
  cpf: string; // 11 raw digits normalized
  partnerId: string;
  createdById: string;
  status: SimulationStatus;
  createdAt: string;
  updatedAt: string;
  matchedProposalId?: string;
  matchedProposalNumber?: string;
  matchedDigitizerId?: string;
  matchedDigitizerName?: string;
  matchedAt?: string;
  rejectionReason?: string;
}

