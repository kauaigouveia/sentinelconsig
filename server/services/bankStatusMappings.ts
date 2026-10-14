import type { PrismaClient } from '@prisma/client';
import { bankPromoterConfigKey, resolveBankPromoter } from './bankPromoterConfig.js';
export const STATUS_MAPPING_BANKS = ['facta', 'c6', 'bmg', 'happy', 'finanto', 'nossa-fintech'] as const;
export type BankStatusMapping = { externalStatus: string; internalStatusId: string };
export const normalizeBankStatus = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-').trim().replace(/\s+/g, ' ').toUpperCase();
export async function getBankStatusMappings(prisma: PrismaClient, tenantId: string, promoterId: string, bank: string): Promise<BankStatusMapping[]> {
  const config = await prisma.systemConfig.findUnique({ where: { tenantId_configKey: { tenantId, configKey: bankPromoterConfigKey(bank, promoterId, 'status_mappings') } } });
  if (!config) return [];
  let mappings: any;
  try { mappings = JSON.parse(config.configValue); } catch { throw new Error('Mapeamento bancário inválido. Revise a configuração.'); }
  if (!Array.isArray(mappings) || mappings.some(row => !row || typeof row.externalStatus !== 'string' || !row.externalStatus.trim() || typeof row.internalStatusId !== 'string' || !row.internalStatusId.trim())) throw new Error('Mapeamento bancário inválido. Revise a configuração.');
  return mappings;
}
export async function saveBankStatusMappings(prisma: PrismaClient, tenantId: string, promoterId: string, bank: string, input: unknown) {
  await resolveBankPromoter(prisma, tenantId, promoterId);
  if (!(STATUS_MAPPING_BANKS as readonly string[]).includes(bank) || !Array.isArray(input) || input.length > 500) throw new Error('Mapeamento inválido. Use até 500 status.');
  if (input.some(row => !row || typeof row.externalStatus !== 'string' || typeof row.internalStatusId !== 'string')) throw new Error('Informe o status bancário e o status interno em cada linha.');
  const mappings: BankStatusMapping[] = input.map(row => ({ externalStatus: String(row.externalStatus || '').trim(), internalStatusId: String(row.internalStatusId || '').trim() }));
  if (mappings.some(row => !row.externalStatus || row.externalStatus.length > 250 || !row.internalStatusId)) throw new Error('Preencha o status do banco e selecione o status interno em todas as linhas.');
  if (new Set(mappings.map(row => normalizeBankStatus(row.externalStatus))).size !== mappings.length) throw new Error('Há status bancários repetidos no mapeamento.');
  const allowed = await prisma.proposalStatus.findMany({ where: { tenantId, active: true, automaticChangeAllowed: true, id: { in: mappings.map(row => row.internalStatusId) } }, select: { id: true } });
  if (mappings.some(row => !allowed.some(status => status.id === row.internalStatusId))) throw new Error('O status deve pertencer à empresa, estar ativo e permitir alteração automática.');
  const configKey = bankPromoterConfigKey(bank, promoterId, 'status_mappings');
  await prisma.systemConfig.upsert({ where: { tenantId_configKey: { tenantId, configKey } }, create: { tenantId, configKey, configValue: JSON.stringify(mappings), isSecret: false }, update: { configValue: JSON.stringify(mappings) } });
  return mappings;
}
export async function resolveMappedBankStatus(prisma: PrismaClient, tenantId: string, promoterId: string | null | undefined, bank: string, values: unknown[]) {
  if (!promoterId) return null;
  const mappings = await getBankStatusMappings(prisma, tenantId, promoterId, bank);
  for (const value of values) {
    const key = normalizeBankStatus(value);
    if (!key) continue;
    const number = key.match(/^(\d+)\s*[-:]/)?.[1];
    const row = mappings.find(mapping => normalizeBankStatus(mapping.externalStatus) === key) || (number ? mappings.find(mapping => normalizeBankStatus(mapping.externalStatus) === number) : undefined);
    if (row) return prisma.proposalStatus.findFirst({ where: { id: row.internalStatusId, tenantId, active: true, automaticChangeAllowed: true } });
  }
  return null;
}
/** Provider payload and mapped internal status/history commit together. No provider writes. */
export async function updateMappedProviderProposal(prisma: PrismaClient, proposal: any, data: any, target: any, userId: string, source: string) {
  return prisma.$transaction(async tx => {
    const updated = await tx.proposal.update({ where: { id: proposal.id }, data: { ...data, ...(target ? { statusId: target.id, standardCategory: target.standardCategory, retentionDeadline: target.code === 'AGUARDAR_RETORNO_CIP' ? (proposal.retentionDeadline ? undefined : new Date()) : null } : {}) }, include: { client: true, bank: true, promoter: true, partner: true, product: true, convenio: true, status: true } });
    if (target && target.id !== proposal.statusId) await tx.statusHistory.create({ data: { tenantId: proposal.tenantId, proposalId: proposal.id, statusId: target.id, statusName: target.name, userId, notes: `[${source}] Mapeamento configurado pela empresa.` } });
    return updated;
  });
}
