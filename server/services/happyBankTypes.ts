/**
 * Tipagens e contratos oficiais para a integração com a API Happy / BYX Capital (Consignado Público).
 * Baseado na documentação oficial Happy / BYX Capital API v1.
 */

export interface HappyTenantConfig {
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

export interface HappyAuthRequestBody {
  client_id: string;
  secret: string;
  usuario: string;
  senha: string;
}

export interface HappyAuthResponse {
  token_opaco?: string;
  token?: string;
  access_token?: string;
  expires_in?: number;
  expira_em?: number;
  rate_limit?: number;
  [key: string]: any;
}

export type HappyNamespace = 'public' | 'private';

export interface HappyInssClienteRequest {
  nome: string;
  telefone: string;
  cpf: string;
  dt_nascimento: string; // YYYY-MM-DD or DD/MM/YYYY
  escolaridade: number; // ex: 12345
  tipo_produto: number; // ex: 1216171824
  numero_beneficio: string; // exactly 10 digits
  representante_legal?: boolean;
  rogado?: boolean;
}

export interface HappyInssIn100ConsultaRequest {
  cpf: string;
  numero_beneficio: string;
  tipo_produto?: number;
}

export interface HappyInssIn100Response {
  in100_autorizada?: boolean;
  url_formalizacao?: string;
  id_cliente?: number | string;
  retornou_in100?: boolean;
  situacao?: string;
  tipo_bloqueio_beneficio?: string;
  in100_data_autorizacao?: string;
  valor_margem?: number;
  limite_cartao_consignado?: number;
  margem_livre_cartao_consignado?: number;
  limite_cartao_beneficio?: number;
  margem_livre_cartao_beneficio?: number;
  beneficio_ativo?: string | boolean;
  margem_total_beneficio?: number;
  message?: string;
  timestamp?: string;
  [key: string]: any;
}

export interface HappyInssMargemSimulacaoRequest {
  cpf: string;
  numero_beneficio?: string;
  valor_parcela?: number;
  prazo?: number;
  tipo_produto?: number;
  [key: string]: any;
}

export interface HappyInssPortabilidadeRefinRequest {
  cpf: string;
  saldo_devedor: number;
  numero_parcelas: number;
  valor_parcelas: number;
  valor_parcelas_refin: number;
  numero_parcelas_refin: number;
  taxa_mensal_refin: number;
  cd_beneficio_tipo: number;
  id_externo_plano: number | string;
  [key: string]: any;
}

export interface HappyCltClienteRequest {
  telefone: string;
  nome: string;
  cpf: string;
  data_autorizacao_dataprev: string; // DDMMAAAAHHMMSS
  canal_autorizacao_digital: number; // default: 2
  canal_origem_solicitacao: string; // default: "B2C"
  canal_razao_social: string;
  canal_cpf_agente: string;
  canal_cnpj: string;
}

export interface HappyCltDataprevConsultaRequest {
  nome: string;
  telefone: string;
  cpf: string;
}

export interface HappyCltCondicaoItem {
  min_parcelas: number;
  max_parcelas: number;
  min_valor_parcela: number;
  max_valor_parcela: number;
  min_valor: number;
  max_valor: number;
  status_motor: string; // e.g. "APPROVED"
  base_juros: number;
  max_taxa: number;
  chave_seguro?: string | null;
  [key: string]: any;
}

export interface HappyCltDataprevResponse {
  url_consulta_autorizacao?: string | null;
  id_cliente?: number | string;
  consulta_autorizada?: boolean;
  situacao?: string; // e.g. "APPROVED"
  id_simulacao?: number | string;
  data_autorizacao_data_prev?: string;
  data_consulta_data_prev?: string;
  valores_credito?: HappyCltCondicaoItem[];
  application_key?: string | null;
  proposal_key?: string | null;
  message?: string;
  timestamp?: string;
  [key: string]: any;
}

export interface HappyCltSimulacaoRequest {
  cliente_id: number | string;
  quantidade_parcelas: number;
  valor_solicitado?: number | null;
  valor_parcela?: number | null;
  taxa?: number | null;
  base_juros?: number | null;
  chave_seguro?: string | null;
}

export interface HappyCltSimulacaoResponse {
  quantidade_parcelas?: number;
  valor_solicitado?: number;
  valor_principal?: number;
  valor_parcela?: number;
  valor_bruto?: number;
  valor_iof?: number;
  iof_percentage?: number;
  valor_liquido?: number;
  valor_cliente?: number;
  data_primeiro_vencimento?: string;
  data_ultimo_vencimento?: string;
  taxa_cet_am?: number;
  taxa_cet_aa?: number;
  taxa_ap_am?: number;
  taxa_ap_aa?: number;
  taxa_cl_am?: number;
  taxa_cl_aa?: number;
  taxa_nominal_am?: number;
  taxa_nominal_aa?: number;
  data_base?: string;
  valor_seguro?: number;
  coberturas?: any;
  descricao_seguro?: string;
  [key: string]: any;
}

export interface HappyConsultarContratoFilters {
  nome?: string | null;
  cpf?: string | null;
  id_contrato?: number | string | null;
  tipo_produto?: string | null;
  status?: string | null;
  periodo?: any;
}

export interface HappyContratoItem {
  id: number | string;
  status: string | null;
  tipo_produto: string;
  status_port: string | null;
  digitador: number | string;
  [key: string]: any;
}

export interface HappyConsultarResponse {
  contratos?: HappyContratoItem[];
  [key: string]: any;
}

export interface HappyWebhookEventData {
  status_code?: number;
  status_name?: string;
  status_description?: string | null;
  chave_proposta?: string;
  [key: string]: any;
}

export interface HappyWebhookPayloadData {
  status?: string;
  message?: string;
  event_data?: HappyWebhookEventData;
  [key: string]: any;
}

export interface HappyWebhookPayload {
  event_name: string;
  request_id: string;
  customer_id?: string;
  timestamp?: string;
  contract_id?: string | number;
  digitador?: string;
  data?: HappyWebhookPayloadData;
  [key: string]: any;
}

export interface HappyStatusMappingResult {
  isMapped: boolean;
  targetStatusCode: string | null;
  notes: string;
  statusCode?: number;
  statusName?: string;
  statusDescription?: string | null;
  mappingCode: 'SUCCESS' | 'UNKNOWN_STATUS' | 'UNKNOWN_MAPPING' | 'UNRESOLVED';
}

export interface HappySyncResult {
  success: boolean;
  hasChanged: boolean;
  proposalId?: string;
  proposalNumber?: string;
  happyContractId?: string;
  happyProposalKey?: string;
  statusCode?: number;
  statusName?: string;
  statusDescription?: string | null;
  previousInternalStatus?: string;
  currentInternalStatus?: string;
  statusMapped: boolean;
  internalStatusUpdated?: boolean;
  mappingNotes?: string;
  error?: string;
  rawData?: any;
}

export interface HappyTestConnectionResult {
  success: boolean;
  message: string;
  httpStatus?: number;
  diagnostics?: string;
}

export interface HappyIntegrationStatus {
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
