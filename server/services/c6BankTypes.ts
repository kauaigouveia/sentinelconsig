/**
 * Tipagens e contratos oficiais para a integração com a API do C6 Bank.
 * Baseado no manual oficial C6 Bank Marketplace Proposal Service API.
 */

export interface C6TokenResponse {
  access_token: string;
  expires_in_seconds: number;
}

export interface C6LoanTrack {
  situation?: string;
  current_activity_number?: string | number;
  activity_last_update?: string;
  current_activity_description?: string;
}

export interface C6Agreement {
  description?: string;
  [key: string]: any;
}

export interface C6Product {
  code?: string | number;
  description?: string;
  [key: string]: any;
}

export interface C6CreditCondition {
  [key: string]: any;
}

export interface C6ProposalResponse {
  proposal_number?: string;
  operation_number?: string;
  operation_type?: string;
  registration_date?: string;
  formalization_type?: string;
  formalization_sub_type_description?: string;
  formalization_status?: string;
  formalization_code?: string | number;
  formalizationCode?: string | number;
  loan_track?: C6LoanTrack;
  agreement?: C6Agreement;
  product?: C6Product;
  credit_condition?: C6CreditCondition;
  [key: string]: any;
}

export interface C6SyncResult {
  success: boolean;
  hasChanged: boolean;
  proposalId: string;
  proposalNumber: string;
  c6ProposalNumber?: string;
  c6OperationNumber?: string;
  rawSituation?: string;
  currentActivity?: string;
  activityDescription?: string;
  formalizationStatus?: string;
  formalizationCode?: string | number;
  lastActivityDate?: string;
  previousInternalStatus?: string;
  currentInternalStatus?: string;
  statusId?: string;
  statusName?: string;
  statusMapped: boolean;
  internalStatusUpdated?: boolean;
  mappingNotes?: string;
  error?: string;
  statusCode?: number;
  rawData?: any;
}

export interface C6TenantConfig {
  promoterCode?: string;
  typistCode?: string;
  certifiedAgentCpf?: string;
  simulationEnabled?: boolean;
  username: string;
  password?: string;
  baseUrl: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  isConfigured: boolean;
  hasPassword: boolean;
}

export interface C6WorkerStatus {
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
