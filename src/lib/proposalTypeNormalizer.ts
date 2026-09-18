import { ProposalType } from '@prisma/client';

export const VALID_PROPOSAL_TYPES = [
  'NOVO',
  'REFIN',
  'PORTABILIDADE',
  'REFIN_PORTABILIDADE',
  'CARTAO_RMC',
  'CARTAO_RCC',
  'SAQUE_COMPLEMENTAR',
] as const;

export type ValidProposalType = typeof VALID_PROPOSAL_TYPES[number];

/**
 * Centralized normalizer for ProposalType enum values.
 * Handles casing, whitespace, accents, and spreadsheet aliases safely.
 *
 * @param input Raw type string received from XLSX/CSV or user forms
 * @param requiresPortability Optional flag indicating portability requirement
 * @returns Valid ProposalType enum string
 * @throws Error if input cannot be safely mapped to a valid ProposalType
 */
export function normalizeProposalType(
  input?: string | null,
  requiresPortability?: boolean
): ValidProposalType {
  // 1. Handle requiresPortability flag if explicitly set
  if (requiresPortability) {
    if (input) {
      const cleanCheck = String(input)
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (cleanCheck.includes('REFIN')) {
        return 'REFIN_PORTABILIDADE';
      }
    }
    return 'PORTABILIDADE';
  }

  // 2. Default to NOVO if empty or omitted
  if (!input || !String(input).trim()) {
    return 'NOVO';
  }

  const raw = String(input).trim();

  // 3. Normalize string: uppercase, remove accents, strip invalid punctuation
  const clean = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9_\s]/g, '')
    .replace(/\s+/g, ' ');

  const underscored = clean.replace(/\s+/g, '_');

  // 4. Exact matches with valid enum members
  if (VALID_PROPOSAL_TYPES.includes(underscored as ValidProposalType)) {
    return underscored as ValidProposalType;
  }
  if (VALID_PROPOSAL_TYPES.includes(clean as ValidProposalType)) {
    return clean as ValidProposalType;
  }

  // 5. Explicit Alias Mappings
  if (
    clean === 'CONSIGNADO' ||
    clean === 'EMPRESTIMO CONSIGNADO' ||
    clean === 'EMPRESTIMO' ||
    clean === 'CONSIGNADO NOVO' ||
    clean === 'NOVO DIGITAL' ||
    clean === 'CONTRATO NOVO' ||
    clean === 'NOVO DIGITAL DATAPREV'
  ) {
    return 'NOVO';
  }

  if (
    clean === 'REFIN' ||
    clean === 'REFINANCIAMENTO' ||
    clean === 'REFINANCIAMENTO INSS' ||
    clean === 'REFIN CONSIGNADO'
  ) {
    return 'REFIN';
  }

  if (
    clean === 'PORT' ||
    clean === 'PORTABILIDADE' ||
    clean === 'PORTABILIDADE INSS' ||
    clean === 'PORTABILIDADE DE CREDITO'
  ) {
    return 'PORTABILIDADE';
  }

  if (
    clean === 'REFIN PORT' ||
    clean === 'REFIN DA PORTABILIDADE' ||
    clean === 'REFIN PORTABILIDADE' ||
    clean === 'REFIN_PORTABILIDADE' ||
    clean === 'REFINANCIAMENTO DA PORTABILIDADE'
  ) {
    return 'REFIN_PORTABILIDADE';
  }

  if (
    clean === 'CARTAO RMC' ||
    clean === 'CARTAO_RMC' ||
    clean === 'RMC' ||
    clean === 'CARTAO' ||
    clean.includes('RMC')
  ) {
    return 'CARTAO_RMC';
  }

  if (
    clean === 'CARTAO RCC' ||
    clean === 'CARTAO_RCC' ||
    clean === 'RCC' ||
    clean.includes('RCC')
  ) {
    return 'CARTAO_RCC';
  }

  if (
    clean === 'SAQUE COMPLEMENTAR' ||
    clean === 'SAQUE_COMPLEMENTAR' ||
    clean === 'SAQUE'
  ) {
    return 'SAQUE_COMPLEMENTAR';
  }

  // 6. Unknown value rejection
  throw new Error(
    `Valor inválido para o tipo de operação/produto: "${input}". Valores aceitos: NOVO, REFIN, PORTABILIDADE, REFIN_PORTABILIDADE, CARTAO_RMC, CARTAO_RCC, SAQUE_COMPLEMENTAR (ou aliases reconhecidos: CONSIGNADO, REFINANCIAMENTO, PORTABILIDADE, CARTÃO RMC/RCC, SAQUE COMPLEMENTAR).`
  );
}
