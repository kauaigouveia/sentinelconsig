/**
 * Tipagens e contratos oficiais para a integração com a API da FACTA Financeira.
 * Baseado no manual e especificações da FACTA (Homologação & Produção).
 */

export type FactaEnvironment = 'homologation' | 'production';

export interface FactaTenantConfig {
  environment: FactaEnvironment;
  username: string;
  password?: string;
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

export interface FactaTokenResponse {
  token?: string;
  bearer_token?: string;
  access_token?: string;
  error?: string;
  mensagem?: string;
  [key: string]: any;
}

export interface FactaProposalItem {
  corretor?: string;
  data_movimento?: string;
  data_movimento_ocorrencia?: string;
  hora_movimento_ocorrencia?: string;
  averbador?: string | number;
  cliente?: string;
  codigo_af?: string | number;
  numero_contrato?: string;
  numero_contrato_refin?: string;
  convenio?: string | number;
  cpf?: string;
  data_digitacao?: string;
  data_efetivacao?: string;
  data_pgto_cliente?: string;
  login_corretor?: string;
  vlrprestacao?: string | number;
  numeroprestacao?: string | number;
  produto?: string;
  proposta?: string | number;
  saldo_devedor?: string | number;
  status_proposta?: string;
  status_crivo?: string;
  tabela?: string;
  tipo_operacao?: string;
  valor_af?: string | number;
  valor_bruto?: string | number;
  taxa?: string | number;
  valor_iof?: string | number;
  valor_seguro?: string | number;
  vendedor?: string;
  matricula?: string;
  especie_beneficio?: string;
  meio_pagamento_beneficio?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  [key: string]: any;
}

export interface FactaQueryParams {
  convenio?: number | string;
  averbador?: number | string;
  af?: string | number;
  data_ini?: string;
  data_fim?: string;
  data_alteracao_ini?: string;
  data_alteracao_fim?: string;
  pagina?: number;
  quantidade?: number;
  consulta_sub?: 'S' | 'N';
  codigo_sub?: string;
}

export interface FactaSyncResult {
  success: boolean;
  hasChanged: boolean;
  proposalId?: string;
  proposalNumber?: string;
  factaProposalNumber?: string;
  factaAfCode?: string;
  factaContractNumber?: string;
  rawStatus?: string;
  crivoStatus?: string;
  previousInternalStatus?: string;
  currentInternalStatus?: string;
  statusId?: string;
  statusName?: string;
  statusMapped: boolean;
  internalStatusUpdated?: boolean;
  unlinkedReason?: string;
  mappingNotes?: string;
  error?: string;
  rawData?: any;
}

export interface FactaWorkerStatus {
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
