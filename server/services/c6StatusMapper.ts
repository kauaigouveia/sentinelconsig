import { C6ProposalResponse } from './c6BankTypes.js';

export interface C6MappingResult {
  /** Se o status foi reconhecido e mapeado com 100% de certeza inequívoca */
  isMapped: boolean;
  /** Código do status interno de destino no Sentinel Consig, se mapeado */
  targetStatusCode: string | null;
  /** Motivo ou observação da decisão de mapeamento */
  notes: string;
  /** Dados brutos preservados */
  rawSituation?: string;
  currentActivity?: string;
  activityDescription?: string;
  formalizationStatus?: string;
  formalizationCode?: string | number;
}

/**
 * Tabela de mapeamentos explícitos e auditados entre o C6 Bank e os códigos padrão do Sentinel Consig.
 * 
 * IMPORTANTE:
 * - Não presume que "situation", "formalization_status" ou "formalizationCode" possuem lista fixa.
 * - Não inventa códigos ou traduções sem comprovação documental.
 * - Não infere aprovação, reprovação, pagamento ou cancelamento a partir de textos vagos.
 * - Não considera uma proposta aprovada apenas por possuir formalization_status preenchido.
 */
export const DEFAULT_C6_STATUS_MAPPINGS: Record<string, string> = {
  // Situações conhecidas de esteira formal
  'AGUARDANDO_FORMALIZACAO': 'AGUARDAR_FORMALIZACAO',
  'PENDENTE_FORMALIZACAO': 'AGUARDAR_FORMALIZACAO',
  'FORMALIZACAO_PENDENTE': 'AGUARDAR_FORMALIZACAO',
  'AGUARDANDO_ASSINATURA': 'AGUARDAR_FORMALIZACAO',
  'AGUARDANDO_AVERBACAO': 'AGUARDAR_PORTABILIDADE',
  'AGUARDANDO_CIP': 'AGUARDAR_RETORNO_CIP',
  'RETORNO_CIP_PENDENTE': 'AGUARDAR_RETORNO_CIP',
  'SALDO_INFORMADO': 'SALDO_RETORNADO',
  'SALDO_RETORNADO': 'SALDO_RETORNADO',
  'DOCUMENTACAO_PENDENTE': 'PENDENTE_ENVIO_DOCUMENTACAO',
  'PENDENTE_DOCUMENTO': 'PENDENTE_ENVIO_DOCUMENTACAO',
  'PROPOSTA_PAGA': 'PAGO',
  'LIQUIDADA': 'PAGO',
  'CREDITO_EFETUADO': 'PAGO',
  'REPROVADA': 'REPROVADO',
  'RECUSADA': 'REPROVADO',
  'CANCELADA': 'CANCELADO',
};

/**
 * Normaliza strings para chave de busca sem espaços supérfluos, pontuação ou acentos.
 */
export function normalizeC6Key(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Avalia a resposta do C6 Bank e retorna se há mapeamento seguro para status interno.
 * Se o status não estiver mapeado com certeza, o status atual do Sentinel é preservado
 * e é gerada anotação de "Status C6 não mapeado".
 */
export function mapC6StatusToInternal(
  c6Data: C6ProposalResponse,
  customTenantMappings?: Record<string, string>
): C6MappingResult {
  const situation = c6Data.loan_track?.situation?.trim();
  const currentActivityNumber = c6Data.loan_track?.current_activity_number != null
    ? String(c6Data.loan_track.current_activity_number).trim()
    : undefined;
  const currentActivityDescription = c6Data.loan_track?.current_activity_description?.trim();
  const formalizationStatus = c6Data.formalization_status?.trim();
  const formalizationCode = c6Data.formalization_code ?? c6Data.formalizationCode;

  const combinedDictionary: Record<string, string> = {
    ...DEFAULT_C6_STATUS_MAPPINGS,
    ...(customTenantMappings || {}),
  };

  const situationKey = normalizeC6Key(situation);
  const formalizationKey = normalizeC6Key(formalizationStatus);
  const activityDescKey = normalizeC6Key(currentActivityDescription);

  // 1. Tentar mapeamento pela situação explícita da esteira (loan_track.situation)
  if (situationKey && combinedDictionary[situationKey]) {
    const targetCode = combinedDictionary[situationKey];
    return {
      isMapped: true,
      targetStatusCode: targetCode,
      notes: `Mapeado com base em loan_track.situation: "${situation}" -> ${targetCode}`,
      rawSituation: situation,
      currentActivity: currentActivityNumber,
      activityDescription: currentActivityDescription,
      formalizationStatus,
      formalizationCode,
    };
  }

  // 2. Se situation não tiver mapeamento, verificar atividade específica (loan_track.current_activity_description)
  if (activityDescKey && combinedDictionary[activityDescKey]) {
    const targetCode = combinedDictionary[activityDescKey];
    return {
      isMapped: true,
      targetStatusCode: targetCode,
      notes: `Mapeado com base em loan_track.current_activity_description: "${currentActivityDescription}" -> ${targetCode}`,
      rawSituation: situation,
      currentActivity: currentActivityNumber,
      activityDescription: currentActivityDescription,
      formalizationStatus,
      formalizationCode,
    };
  }

  // 3. Verificar se há mapeamento estrito por formalization_status APENAS se explicitamente cadastrado
  // (IMPORTANTE: Nunca considerar aprovado apenas porque formalization_status existe)
  if (formalizationKey && combinedDictionary[formalizationKey]) {
    const targetCode = combinedDictionary[formalizationKey];
    return {
      isMapped: true,
      targetStatusCode: targetCode,
      notes: `Mapeado com base em formalization_status: "${formalizationStatus}" -> ${targetCode}`,
      rawSituation: situation,
      currentActivity: currentActivityNumber,
      activityDescription: currentActivityDescription,
      formalizationStatus,
      formalizationCode,
    };
  }

  // 4. Status C6 NÃO mapeado com certeza.
  // Regra fundamental: Preservar o status interno atual e registrar "Status C6 não mapeado" para revisão humana.
  const details = [
    situation ? `situação: "${situation}"` : null,
    currentActivityDescription ? `atividade: "${currentActivityDescription}"` : null,
    formalizationStatus ? `formalização: "${formalizationStatus}"` : null,
  ].filter(Boolean).join(', ');

  return {
    isMapped: false,
    targetStatusCode: null,
    notes: `Status C6 não mapeado${details ? ` (${details})` : ''}. Status interno preservado.`,
    rawSituation: situation,
    currentActivity: currentActivityNumber,
    activityDescription: currentActivityDescription,
    formalizationStatus,
    formalizationCode,
  };
}
