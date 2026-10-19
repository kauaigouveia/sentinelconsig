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

// Dicionário unificado de mapeamento Facta -> Sentinel Status Code (usando os códigos oficiais do banco de dados)
const factaStatusDictionary: Record<string, string> = {
  'SALDO RETORNADO': 'SALDO_RETORNADO',
  'SALDO INFORMADO': 'SALDO_RETORNADO',
  'SALDO_RETORNADO': 'SALDO_RETORNADO',
  // CANCELADO
  'CANCELADO': 'CANCELADO',
  'CANCELADA': 'CANCELADO',
  'CANCELAMENTO': 'CANCELADO',
  'SOLICITADO CANCELAMENTO': 'CANCELADO',
  'CANCELADO PELO CLIENTE': 'CANCELADO',
  'CANCELADA PELO CLIENTE': 'CANCELADO',
  '961': 'CANCELADO',
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
  'REPROVADA PELO BANCO': 'REPROVADO',
  'REPROVADO PELO BANCO': 'REPROVADO',
  'NEGADO': 'REPROVADO',
  'INDEFERIDO': 'REPROVADO',
  'CANCELADO PELO SISTEMA': 'REPROVADO',
  '960': 'REPROVADO',
  'REP': 'REPROVADO',

  // PAGO
  'PAGO': 'PAGO',
  'PAGA': 'PAGO',
  'PAGO AO CLIENTE': 'PAGO',
  'LIQUIDADO': 'PAGO',
  'LIQUIDADA': 'PAGO',
  'EFETUADO': 'PAGO',
  'PAGAMENTO EFETUADO': 'PAGO',
  'CONCLUIDO': 'PAGO',
  'CONCLUIDA': 'PAGO',
  'FINALIZADO': 'PAGO',
  'FINALIZADA': 'PAGO',
  '962': 'PAGO',

  // AGUARDAR FORMALIZAÇÃO
  'AGUARDANDO FORMALIZACAO': 'AGUARDAR_FORMALIZACAO',
  'AGUARDAR FORMALIZACAO': 'AGUARDAR_FORMALIZACAO',
  'FORMALIZACAO': 'AGUARDAR_FORMALIZACAO',
  'PENDENTE FORMALIZACAO': 'AGUARDAR_FORMALIZACAO',
  'AGUARDANDO ASSINATURA': 'AGUARDAR_FORMALIZACAO',
  'DIGITADA': 'AGUARDAR_FORMALIZACAO',
  'AGUARDA DIGITACAO': 'AGUARDAR_FORMALIZACAO',
  'EM DIGITACAO': 'AGUARDAR_FORMALIZACAO',
  'DIGITACAO': 'AGUARDAR_FORMALIZACAO',

  // INTEGRADO / AVERBADO
  'AVERBADO': 'INTEGRADO',
  'AVERBADA': 'INTEGRADO',
  'AVERBACAO CONCLUIDA': 'INTEGRADO',
  'INTEGRADO': 'INTEGRADO',
  'DEFERIDO': 'INTEGRADO',

  // AGUARDAR PORTABILIDADE / EM ANDAMENTO
  'EM ANDAMENTO': 'AGUARDAR_PORTABILIDADE',
  'EM ANALISE': 'AGUARDAR_PORTABILIDADE',
  'ANALISE': 'AGUARDAR_PORTABILIDADE',
  'PROCESSAMENTO': 'AGUARDAR_PORTABILIDADE',
  'AGUARDANDO AVERBACAO': 'AGUARDAR_PORTABILIDADE',
  'EM ESTEIRA': 'AGUARDAR_PORTABILIDADE',

  // PENDENTE DE DOCUMENTAÇÃO
  'PENDENTE': 'PENDENTE_ENVIO_DOCUMENTACAO',
  'PENDENCIA': 'PENDENTE_ENVIO_DOCUMENTACAO',
  'DOCUMENTACAO PENDENTE': 'PENDENTE_ENVIO_DOCUMENTACAO',
  'PENDENTE DOCUMENTO': 'PENDENTE_ENVIO_DOCUMENTACAO',
  'PENDENTE ENVIO DOCUMENTACAO': 'PENDENTE_ENVIO_DOCUMENTACAO',
};

/**
 * Função de fallback por substring caso a chave exata não esteja no dicionário.
 */
function resolveFallbackStatusCode(key: string): string | undefined {
  if (!key || /SUSPENSAO|DESAVERBAD|AGUARD.*PAGAMENTO|COMISSAO|SOLICITADO CANCELAMENTO/.test(key)) return undefined;
  if (key.includes('REPROV') || key.includes('RECUS') || key.includes('NEGAD') || key.includes('INDEFER') || key.includes('960')) {
    return 'REPROVADO';
  }
  if (key.includes('CANCEL')) {
    return 'CANCELADO';
  }
  if (key.includes('PAGO') || key.includes('PAGA') || key.includes('LIQUID') || key.includes('CONCLU') || key.includes('EFETUAD') || key.includes('962')) {
    return 'PAGO';
  }
  if (key.includes('FORMALIZ') || key.includes('ASSINATUR') || key.includes('DIGITA')) {
    return 'AGUARDAR_FORMALIZACAO';
  }
  if (key.includes('AVERBAD') || key.includes('INTEGRAD') || key.includes('DEFERID')) {
    return 'INTEGRADO';
  }
  if (key.includes('PENDEN') || key.includes('DOCUMENT')) {
    return 'PENDENTE_ENVIO_DOCUMENTACAO';
  }
  if (key.includes('ANALIS') || key.includes('PROCESS') || key.includes('ESTEIRA')) {
    return 'AGUARDAR_PORTABILIDADE';
  }
  return undefined;
}

/**
 * Mapeia os status retornados pela FACTA para o código de status interno do Sentinel.
 */
export function mapFactaStatusToInternal(item: {
  status_proposta?: string;
  status_crivo?: string;
  codigo_af?: string | number;
  [key: string]: any;
}): FactaStatusMappingResult {
  const rawProp = item.status_proposta ? String(item.status_proposta) : '';
  const rawCrivo = item.status_crivo ? String(item.status_crivo) : '';

  const propKey = normalizeFactaStatusKey(rawProp);
  const crivoKey = normalizeFactaStatusKey(rawCrivo);

  let mappedPropCode = propKey ? factaStatusDictionary[propKey] || resolveFallbackStatusCode(propKey) : undefined;
  let mappedCrivoCode = crivoKey ? factaStatusDictionary[crivoKey] || resolveFallbackStatusCode(crivoKey) : undefined;

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
