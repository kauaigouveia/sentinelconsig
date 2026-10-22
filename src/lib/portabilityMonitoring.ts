import type { Product, Proposal, ProposalStatus } from '../types';
import { isPortabilityProposal, isPrimaryPortabilityProposal } from './utils';

export type PortabilitySituation = 'ANDAMENTO' | 'PENDENTE' | 'PAGO' | 'REPROVADO' | 'CANCELADO' | 'OUTROS';
export type PortabilitySegment = 'SALDO' | 'TROCO';
export const PORTABILITY_SITUATIONS: { key: PortabilitySituation; label: string; tone: string }[] = [
  { key: 'ANDAMENTO', label: 'Em andamento', tone: 'primary' },
  { key: 'PENDENTE', label: 'Pendente', tone: 'warning' },
  { key: 'PAGO', label: 'Pago', tone: 'success' },
  { key: 'REPROVADO', label: 'Reprovado', tone: 'danger' },
  { key: 'CANCELADO', label: 'Cancelado', tone: 'default' },
  { key: 'OUTROS', label: 'Sem classificação', tone: 'default' },
];
const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
export function portabilitySituation(proposal: Proposal, status?: ProposalStatus): PortabilitySituation {
  const code = normalize(status?.code || proposal.statusCode);
  if (code === 'PAGO') return 'PAGO';
  if (['REPROVADO', 'REPROVADA', 'RECUSADO', 'RECUSADA'].includes(code)) return 'REPROVADO';
  if (['CANCELADO', 'CANCELADA'].includes(code)) return 'CANCELADO';
  const category = normalize(status?.standardCategory || (proposal as any).standardCategory);
  if (category === 'PAGO') return 'PAGO';
  if (category === 'RECUSADO') return 'REPROVADO';
  if (category === 'CANCELADO') return 'CANCELADO';
  if (!status || status.finalStatus) return 'OUTROS';
  const group = normalize(status.responsibleGroup || status.responsible);
  if (category === 'PENDENTE' || code.startsWith('PENDENT') || normalize(status.name).startsWith('PENDENT') || ['CLIENTE', 'PARCEIRO'].includes(group)) return 'PENDENTE';
  return 'ANDAMENTO';
}
export function portabilitySegment(proposal: Proposal, products: Product[]): PortabilitySegment | null {
  if (!isPortabilityProposal(proposal, products)) return null;
  return isPrimaryPortabilityProposal(proposal, products) ? 'SALDO' : 'TROCO';
}
export function portabilityMonitoredValue(proposal: Proposal, segment: PortabilitySegment): number | null {
  const raw = segment === 'SALDO' ? proposal.contractBalance ?? proposal.debtBalance : proposal.disbursedValue;
  if (raw === undefined || raw === null || String(raw) === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
