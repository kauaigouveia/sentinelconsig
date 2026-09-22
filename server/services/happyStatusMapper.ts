import { HappyStatusMappingResult } from './happyBankTypes.js';

/**
 * Catálogo exaustivo e auditado de todos os status documentados pela Happy / BYX Capital
 * para os produtos Margem Livre, Portabilidade e Portabilidade + Refinanciamento.
 */
export const HAPPY_DOCUMENTED_STATUSES: Record<number, { name: string; internalStatusCode?: string }> = {
  // Status comuns aos três produtos documentados
  20: { name: 'Aguarda envio link', internalStatusCode: 'AGUARDAR_FORMALIZACAO' },
  21: { name: 'Formalização', internalStatusCode: 'AGUARDAR_FORMALIZACAO' },
  24: { name: 'Reprovada - Política Interna', internalStatusCode: 'REPROVADO' },
  26: { name: 'Pendente Documentação - Mesa Corban', internalStatusCode: 'PENDENTE_ENVIO_DOCUMENTACAO' },
  27: { name: 'Reprovada - Mesa Corban', internalStatusCode: 'REPROVADO' },
  28: { name: 'Aprovada - Mesa Corban' }, // Sem equivalência terminal direta; mantém interno
  30: { name: 'Aprovada - Mesa de Formalização' },
  41: { name: 'Reprovado', internalStatusCode: 'REPROVADO' },
  42: { name: 'Aguardando Retorno da IN100', internalStatusCode: 'AGUARDAR_RETORNO_CIP' },
  64: { name: 'Int - Ajuste Averbação', internalStatusCode: 'INTEGRADO' },
  65: { name: 'Validações Automáticas' },
  73: { name: 'Aguardando vídeo chamada do cliente', internalStatusCode: 'AGUARDAR_FORMALIZACAO' },
  75: { name: 'Reprovado - Formalização em Vídeo', internalStatusCode: 'REPROVADO' },
  76: { name: 'Pendente esclarecimentos com o cliente', internalStatusCode: 'PENDENTE_ENVIO_DOCUMENTACAO' },
  85: { name: 'Aprovada - Vídeo Chamada' },
  101: { name: 'Cancelado', internalStatusCode: 'CANCELADO' },

  // Margem Livre
  13: { name: 'Aprovada - Averbação', internalStatusCode: 'INTEGRADO' },
  19: { name: 'Pendente - Correção de dados bancários', internalStatusCode: 'PENDENTE_ENVIO_DOCUMENTACAO' },
  37: { name: 'Int - Aguarda Averbação', internalStatusCode: 'AGUARDAR_PORTABILIDADE' },
  38: { name: 'Int - Finalizado', internalStatusCode: 'PAGO' },
  66: { name: 'Aguardando Desembolso', internalStatusCode: 'INTEGRADO' },
  122: { name: 'Teimosinha In100' },
  123: { name: 'Teimosinha In100 - Enviado' },
  129: { name: 'IN100 fura fila' },
  131: { name: 'Averbado - Aguardando Anuencia', internalStatusCode: 'INTEGRADO' },
  132: { name: 'Aguardando Consulta IN100 - Recálculo HW' },
  133: { name: 'Aguardando Aprovação do Recálculo HW' },

  // Portabilidade
  22: { name: 'Análise de crédito (Bureaus)' },
  23: { name: 'Pendente - Dados Divergentes', internalStatusCode: 'PENDENTE_ENVIO_DOCUMENTACAO' },
  32: { name: 'Aguarda Retorno Saldo', internalStatusCode: 'AGUARDAR_RETORNO_CIP' },
  33: { name: 'Saldo Retornado', internalStatusCode: 'SALDO_RETORNADO' },
  34: { name: 'INT - Confirma pagamento' },
  35: { name: 'Saldo Reprovado', internalStatusCode: 'REPROVADO' },
  43: { name: 'Aguardando Consulta IN100 (RECALCULO)' },
  44: { name: 'IN100 Consultada no Recalculo' },
  104: { name: 'Pendente Validação Parcela', internalStatusCode: 'PENDENTE_ENVIO_DOCUMENTACAO' },
  105: { name: 'Parcela ajustada' },
  130: { name: 'Aguardando Envio de Saldo – Represado', internalStatusCode: 'AGUARDAR_RETORNO_CIP' },

  // Portabilidade + Refinanciamento
  55: { name: 'Aguardando Averbação Refinanciamento', internalStatusCode: 'AGUARDAR_PORTABILIDADE' },
  56: { name: 'Int - Aguardando Desembolso do Refinanciamento', internalStatusCode: 'INTEGRADO' },
  58: { name: 'Int - Finalizado Refin', internalStatusCode: 'PAGO' },
  60: { name: 'Pendente - Aprovação do Recalculo (Corban)', internalStatusCode: 'PENDENTE_ENVIO_DOCUMENTACAO' },
  67: { name: 'Int- Aguardando pago da QiTech' },
  88: { name: 'Aprovado pelo Pricing' },
  89: { name: 'Recalculo Pricing - Aguardando Avaliação' },
  90: { name: 'Recálculo do Refinanciamento' },
  91: { name: 'Reformalização Cliente', internalStatusCode: 'AGUARDAR_FORMALIZACAO' },
  92: { name: 'Proposta cancelada pelo corban', internalStatusCode: 'CANCELADO' },
  93: { name: 'Aprovada Reformalização' },
  128: { name: 'Refin Frustrado', internalStatusCode: 'REPROVADO' },
  134: { name: 'Saldo Retornado - Pendente Ajuste de Taxa', internalStatusCode: 'SALDO_RETORNADO' },
};

/**
 * Normaliza textos de status para busca textual
 */
export function normalizeHappyText(text?: string | null): string {
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
 * Mapeia o status retornado pela Happy para o código oficial de status do Sentinel Consig.
 * 
 * Regra obrigatória:
 * - Se o status_code for reconhecido e possuir correspondente inequívoco, mapeia para o status oficial.
 * - Se não houver equivalência clara ou for desconhecido, mantém o status interno atual (isMapped = false),
 *   preserva código e nome originais e registra como UNKNOWN_MAPPING ou UNKNOWN_STATUS.
 */
export function mapHappyStatusToInternal(
  statusCode?: number | string | null,
  statusName?: string | null,
  statusDescription?: string | null,
  customTenantMappings?: Record<string, string>
): HappyStatusMappingResult {
  const numericCode = statusCode != null ? Number(statusCode) : NaN;
  const rawName = statusName?.trim() || '';

  // 1. Verificar mapeamento personalizado do tenant por código numérico ou nome normalizado
  if (customTenantMappings) {
    if (!isNaN(numericCode) && customTenantMappings[String(numericCode)]) {
      return {
        isMapped: true,
        targetStatusCode: customTenantMappings[String(numericCode)],
        notes: `Mapeamento personalizado do tenant pelo código Happy ${numericCode}`,
        statusCode: numericCode,
        statusName: rawName || HAPPY_DOCUMENTED_STATUSES[numericCode]?.name,
        statusDescription,
        mappingCode: 'SUCCESS',
      };
    }
    const normKey = normalizeHappyText(rawName);
    if (normKey && customTenantMappings[normKey]) {
      return {
        isMapped: true,
        targetStatusCode: customTenantMappings[normKey],
        notes: `Mapeamento personalizado do tenant pelo nome Happy '${rawName}'`,
        statusCode: isNaN(numericCode) ? undefined : numericCode,
        statusName: rawName,
        statusDescription,
        mappingCode: 'SUCCESS',
      };
    }
  }

  // 2. Verificar código numérico documentado
  if (!isNaN(numericCode) && HAPPY_DOCUMENTED_STATUSES[numericCode]) {
    const doc = HAPPY_DOCUMENTED_STATUSES[numericCode];
    const resolvedName = rawName || doc.name;

    if (doc.internalStatusCode) {
      return {
        isMapped: true,
        targetStatusCode: doc.internalStatusCode,
        notes: `Status Happy ${numericCode} ('${resolvedName}') mapeado com sucesso para '${doc.internalStatusCode}'`,
        statusCode: numericCode,
        statusName: resolvedName,
        statusDescription,
        mappingCode: 'SUCCESS',
      };
    }

    // Status documentado mas sem equivalência interna automática
    return {
      isMapped: false,
      targetStatusCode: null,
      notes: `Status Happy ${numericCode} ('${resolvedName}') é documentado mas não possui equivalência interna unívoca configurada. Status interno mantido.`,
      statusCode: numericCode,
      statusName: resolvedName,
      statusDescription,
      mappingCode: 'UNKNOWN_MAPPING',
    };
  }

  // 3. Resolução textual por fallback para nomes textuais evidentes se código numérico for ausente
  if (rawName) {
    const norm = normalizeHappyText(rawName);
    if (norm.includes('REPROVAD')) {
      return {
        isMapped: true,
        targetStatusCode: 'REPROVADO',
        notes: `Status Happy textual '${rawName}' reconhecido como REPROVADO`,
        statusCode: isNaN(numericCode) ? undefined : numericCode,
        statusName: rawName,
        statusDescription,
        mappingCode: 'SUCCESS',
      };
    }
    if (norm.includes('CANCELAD')) {
      return {
        isMapped: true,
        targetStatusCode: 'CANCELADO',
        notes: `Status Happy textual '${rawName}' reconhecido como CANCELADO`,
        statusCode: isNaN(numericCode) ? undefined : numericCode,
        statusName: rawName,
        statusDescription,
        mappingCode: 'SUCCESS',
      };
    }
    if (norm === 'FINALIZADO' || norm === 'PAGO' || norm === 'LIQUIDADO') {
      return {
        isMapped: true,
        targetStatusCode: 'PAGO',
        notes: `Status Happy textual '${rawName}' reconhecido como PAGO`,
        statusCode: isNaN(numericCode) ? undefined : numericCode,
        statusName: rawName,
        statusDescription,
        mappingCode: 'SUCCESS',
      };
    }
    if (norm.includes('FORMALIZACAO')) {
      return {
        isMapped: true,
        targetStatusCode: 'AGUARDAR_FORMALIZACAO',
        notes: `Status Happy textual '${rawName}' reconhecido como AGUARDAR_FORMALIZACAO`,
        statusCode: isNaN(numericCode) ? undefined : numericCode,
        statusName: rawName,
        statusDescription,
        mappingCode: 'SUCCESS',
      };
    }
  }

  // 4. Status desconhecido
  return {
    isMapped: false,
    targetStatusCode: null,
    notes: `Status Happy não reconhecido (Código: ${statusCode ?? 'N/A'}, Nome: '${rawName || 'N/A'}'). Status interno original preservado.`,
    statusCode: isNaN(numericCode) ? undefined : numericCode,
    statusName: rawName || undefined,
    statusDescription,
    mappingCode: 'UNKNOWN_STATUS',
  };
}
