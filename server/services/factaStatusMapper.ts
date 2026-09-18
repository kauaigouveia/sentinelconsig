/**
 * Mapeador de Status da FACTA Financeira para Status Internos do Sentinel Consig.
 * Converte `status_proposta` e `status_crivo` retornados pela API FACTA.
 */

export interface FactaStatusMappingResult {
  isMapped: boolean;
  targetStatusCode?: string;
  notes: string;
  rawStatusProposta?: string;
  rawStatusCrivo?: string;
  divergenceDetected?: boolean;
}

/**
 * Normaliza strings removendo acentos, prefixos numéricos (ex: "28 - CANCELADO" -> "CANCELADO")
 * e caracteres especiais para comparação insensível a caixa.
 */
export function normalizeFactaStatusKey(statusStr?: string | null): string {
  if (!statusStr || typeof statusStr !== 'string') return '';
  
  let cleaned = statusStr
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  // Remover prefixo do tipo "28 - " ou "10 - "
  cleaned = cleaned.replace(/^\d+\s*[-–—:]\s*/, '').trim();

  return cleaned;
}

// Dicionário unificado de mapeamento Facta -> Sentinel Status Code
const factaStatusDictionary: Record<string, string> = {
  // CANCELADO
  'CANCELADO': 'CANCELADO',
  'CANCELADA': 'CANCELADO',
  'CANCELAMENTO': 'CANCELADO',
  'SOLICITADO CANCELAMENTO': 'CANCELADO',
  '28': 'CANCELADO',
  '10': 'CANCELADO',

  // REPROVADO
  'REPROVADO': 'REPROVADO',
  'REPROVADA': 'REPROVADO',
  'RECUSADO': 'REPROVADO',
  'RECUSADA': 'REPROVADO',
  'REPROVACAO': 'REPROVADO',
  'REPROVADA PELO CRIVO': 'REPROVADO',
  'REPROVADO PELO CRIVO': 'REPROVADO',
  'NEGADO': 'REPROVADO',
  'INDEFERIDO': 'REPROVADO',
  'CANCELADO PELO SISTEMA': 'REPROVADO',

  // PAGO
  'PAGO': 'PAGO',
  'PAGA': 'PAGO',
  'PAGO AO CLIENTE': 'PAGO',
  'COMISSAO PAGA': 'PAGO',
  'LIQUIDADO': 'PAGO',
  'EFETUADO': 'PAGO',
  'PAGAMENTO EFETUADO': 'PAGO',
  'CONCLUIDO': 'PAGO',
  'FINALIZADO': 'PAGO',

  // AGUARDAR FORMALIZAÇÃO
  'AGUARDANDO FORMALIZACAO': 'AGUARDAR FORMALIZAÇÃO',
  'AGUARDAR FORMALIZACAO': 'AGUARDAR FORMALIZAÇÃO',
  'FORMALIZACAO': 'AGUARDAR FORMALIZAÇÃO',
  'PENDENTE FORMALIZACAO': 'AGUARDAR FORMALIZAÇÃO',
  'AGUARDANDO ASSINATURA': 'AGUARDAR FORMALIZAÇÃO',
  'DIGITADA': 'AGUARDAR FORMALIZAÇÃO',
  'AGUARDA DIGITACAO': 'AGUARDAR FORMALIZAÇÃO',

  // AVERBADO
  'AVERBADO': 'AVERBADO',
  'AVERBADA': 'AVERBADO',
  'AVERBACAO CONCLUIDA': 'AVERBADO',
  'INTEGRADO': 'AVERBADO',
  'DEFERIDO': 'AVERBADO',

  // EM ANDAMENTO
  'EM ANDAMENTO': 'EM ANDAMENTO',
  'EM ANALISE': 'EM ANDAMENTO',
  'ANALISE': 'EM ANDAMENTO',
  'PROCESSAMENTO': 'EM ANDAMENTO',
  'AGUARDANDO AVERBACAO': 'EM ANDAMENTO',
  'EM ESTEIRA': 'EM ANDAMENTO',

  // PENDENTE
  'PENDENTE': 'PENDENTE',
  'PENDENCIA': 'PENDENTE',
  'DOCUMENTACAO PENDENTE': 'PENDENTE',
  'PENDENTE DOCUMENTO': 'PENDENTE',
};

/**
 * Mapeia os status retornados pela FACTA para o código de status interno do Sentinel.
 */
export function mapFactaStatusToInternal(item: {
  status_proposta?: string;
  status_crivo?: string;
  [key: string]: any;
}): FactaStatusMappingResult {
  const rawProp = item.status_proposta ? String(item.status_proposta) : '';
  const rawCrivo = item.status_crivo ? String(item.status_crivo) : '';

  const propKey = normalizeFactaStatusKey(rawProp);
  const crivoKey = normalizeFactaStatusKey(rawCrivo);

  const mappedPropCode = propKey ? factaStatusDictionary[propKey] : undefined;
  const mappedCrivoCode = crivoKey ? factaStatusDictionary[crivoKey] : undefined;

  // Verificar divergência explícita (ex: um diz PAGO e o outro diz REPROVADO)
  if (mappedPropCode && mappedCrivoCode && mappedPropCode !== mappedCrivoCode) {
    return {
      isMapped: false,
      divergenceDetected: true,
      notes: `Divergência entre status_proposta ("${rawProp}" -> ${mappedPropCode}) e status_crivo ("${rawCrivo}" -> ${mappedCrivoCode}). Status mantido sem alteração automática.`,
      rawStatusProposta: rawProp,
      rawStatusCrivo: rawCrivo,
    };
  }

  // 1. Priorizar mapeamento direto do status_proposta
  if (mappedPropCode) {
    return {
      isMapped: true,
      targetStatusCode: mappedPropCode,
      notes: `Mapeado com base em status_proposta: "${rawProp}" -> ${mappedPropCode}`,
      rawStatusProposta: rawProp,
      rawStatusCrivo: rawCrivo,
    };
  }

  // 2. Mapeamento por status_crivo se status_proposta não estiver mapeado
  if (mappedCrivoCode) {
    return {
      isMapped: true,
      targetStatusCode: mappedCrivoCode,
      notes: `Mapeado com base em status_crivo: "${rawCrivo}" -> ${mappedCrivoCode}`,
      rawStatusProposta: rawProp,
      rawStatusCrivo: rawCrivo,
    };
  }

  // 3. Não mapeado
  return {
    isMapped: false,
    notes: `Status FACTA não mapeado. Proposta: "${rawProp || 'N/A'}", Crivo: "${rawCrivo || 'N/A'}".`,
    rawStatusProposta: rawProp,
    rawStatusCrivo: rawCrivo,
  };
}
