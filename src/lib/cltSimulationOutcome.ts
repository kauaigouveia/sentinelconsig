export type CltOutcome = 'OFFER' | 'AUTHORIZATION_REQUIRED' | 'INELIGIBLE' | 'MISSING_DATA' | 'TECHNICAL_ERROR' | 'UNSUPPORTED' | 'PENDING';
export const cltOutcomeLabels: Record<CltOutcome, string> = {
  OFFER: 'Oferta disponível', AUTHORIZATION_REQUIRED: 'Aguardando autorização do cliente', INELIGIBLE: 'Cliente não elegível',
  MISSING_DATA: 'Dados obrigatórios ausentes', TECHNICAL_ERROR: 'Falha técnica na integração', UNSUPPORTED: 'Produto CLT indisponível nesta conexão', PENDING: 'Consulta pendente',
};
export function cltOutcome(row: { state: string; outcome?: CltOutcome; message?: string }): CltOutcome {
  if (row.outcome) return row.outcome;
  if (row.state === 'OFFER') return 'OFFER';
  if (/informe.*matr[ií]cula|matr[ií]cula.*(obrigat|inv[aá]lid|n[aã]o inform)|v[ií]nculo.*n[aã]o encontrad/i.test(row.message || '')) return 'MISSING_DATA';
  if (row.state === 'ERROR') return 'TECHNICAL_ERROR';
  if (/não elegível|nao elegivel|recusado pela política|cnae.*restrit/i.test(row.message || '')) return 'INELIGIBLE';
  if (/autoriz|consentimento|assinatura/i.test(row.message || '')) return 'AUTHORIZATION_REQUIRED';
  if (/matrícula|matricula|vínculo.*selecion|informe|dados insuficientes/i.test(row.message || '')) return 'MISSING_DATA';
  return 'PENDING';
}

/** Keep operational bank reasons, but never show HTML, JSON dumps, tokens or stack traces. */
export function cltPublicMessage(message?: string): string | undefined {
  if (!message) return message;
  if (/<[a-z!/]|\b(?:bearer|access_token|client_secret|password|authorization)\b|\bat \S+\([^)]*:\d+|^\s*[\[{]/i.test(message)) return 'A integração retornou uma resposta técnica inválida. Confira a conexão ou tente novamente.';
  return message.replace(/https?:\/\/\S+/gi, '[endereço omitido]').replace(/\b\d{3}[.]?\d{3}[.]?\d{3}[-]?\d{2}\b/g, '[documento omitido]').slice(0, 500);
}
