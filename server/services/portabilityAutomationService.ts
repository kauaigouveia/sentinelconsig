import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { C6BankService } from './c6BankService.js';
import { FactaBankService } from './factaBankService.js';
import { HappyBankService } from './happyBankService.js';
import { withIntegrationPromoter } from './bankPromoterConfig.js';
import { FinantoService } from './finantoService.js';
import { NossaFintechService } from './nossaFintechService.js';
import { resolveMappedBankStatus, updateMappedProviderProposal } from './bankStatusMappings.js';
import { providerAmount } from './providerFinancialValue.js';
import { WorkbankService } from './workbankService.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const localDay = (value: Date) => value.toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
const DEFAULT_HOLIDAYS = ['2026-01-01', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'];

function elapsed(start: Date, now: Date, holidays: Set<string>) {
    const day = new Date(localDay(start) + 'T00:00:00Z');
    const end = localDay(now);
    if (!Number.isFinite(day.getTime())) return 0;
    let count = 0;
    while (day.toISOString().slice(0, 10) < end) {
        day.setUTCDate(day.getUTCDate() + 1);
        if (![0, 6].includes(day.getUTCDay()) && !holidays.has(day.toISOString().slice(0, 10))) count++;
    }
    return count;
}

type Provider = 'c6' | 'facta' | 'happy' | 'finanto' | 'nossa-fintech' | 'workbank';
async function connection(db: PrismaClient, proposal: any): Promise<Provider | null> {
    if (proposal.promoterId) {
        const imported = await WorkbankService.linkedProposal(db, proposal.tenantId, proposal.promoterId, proposal.id);
        if (imported) {
            if (!(await WorkbankService.config(db, proposal.tenantId, proposal.promoterId)).enabled) throw new Error('LINKED_API_UNAVAILABLE');
            return 'workbank';
        }
    }
    // A linked external ID must never silently fall back to a fabricated return when config fails.
    const linked: Provider | null = proposal.c6ProposalNumber ? 'c6' : proposal.factaAfCode || proposal.factaProposalNumber ? 'facta' : proposal.happyContractId ? 'happy' : proposal.finantoSimulationId ? 'finanto' : proposal.nossaFintechDebtKey ? 'nossa-fintech' : null;
    const name = String(proposal.bank?.name || '').toUpperCase();
    const provider: Provider | null = linked || (/FACTA/.test(name) ? 'facta' : /C6/.test(name) ? 'c6' : /HAPPY|BYX/.test(name) ? 'happy' : /FINANTO/.test(name) ? 'finanto' : /NOSSA FINTECH/.test(name) ? 'nossa-fintech' : null);
    if (!provider) return null;
    if (!proposal.promoterId) { if (linked) throw new Error('MISSING_PROMOTER'); return null; }
    return withIntegrationPromoter(proposal.promoterId, async () => {
        let enabled: boolean;
        if (provider === 'facta') { const config = await FactaBankService.getTenantConfig(db, proposal.tenantId, proposal.promoterId); if (config.enabled && !config.isConfigured) throw new Error('INCOMPLETE_API_CONFIG'); enabled = config.isConfigured; }
        else if (provider === 'c6') { const config = await C6BankService.getTenantConfig(db, proposal.tenantId); if (config.enabled && !config.isConfigured) throw new Error('INCOMPLETE_API_CONFIG'); enabled = config.enabled !== false && config.isConfigured; }
        else if (provider === 'happy') { const config = await HappyBankService.getTenantConfig(db, proposal.tenantId); if (config.ativo && !config.isConfigured) throw new Error('INCOMPLETE_API_CONFIG'); enabled = config.ativo && config.isConfigured; }
        else { const config = provider === 'finanto' ? await FinantoService.getConfig(db, proposal.tenantId) : await NossaFintechService.getConfig(db, proposal.tenantId); if (config.enabled && !config.isConfigured) throw new Error('INCOMPLETE_API_CONFIG'); enabled = config.enabled && config.isConfigured; }
        if (!enabled && linked) throw new Error('LINKED_API_UNAVAILABLE');
        return enabled ? provider : null;
    });
}

async function syncMapped(db: PrismaClient, proposal: any, provider: 'finanto' | 'nossa-fintech') {
    if (!proposal.promoterId) throw new Error('MISSING_PROMOTER');
    const id = provider === 'finanto' ? proposal.finantoSimulationId : proposal.nossaFintechDebtKey;
    if (!id) throw new Error('MISSING_EXTERNAL_ID');
    const route = provider === 'finanto' ? `/v3/loans/simulation/${encodeURIComponent(id)}` : `/inss/v1/operation/${encodeURIComponent(id)}`;
    const response = await withIntegrationPromoter(proposal.promoterId, () => provider === 'finanto' ? FinantoService.request(db, proposal.tenantId, 'GET', route) : NossaFintechService.request(db, proposal.tenantId, 'GET', route));
    const raw = response.data as any;
    if (!response.success || !raw || raw.error || raw.errors || raw.messages?.length) throw new Error('PROVIDER_RESPONSE_FAILED');
    const item = provider === 'finanto' ? raw.items?.[0] || raw.loan?.items?.[0] || raw.simulation?.items?.[0] || raw.loan || raw.simulation || raw : raw.operation || raw.proposal || raw.data?.operation || raw.data || raw;
    const status = provider === 'finanto' ? raw.status?.name || raw.statusName || raw.situation || raw.status : item.dsc_situacao_emprestimo || item.status_name || item.status?.name || item.status || item.situation;
    const statusText = typeof status === 'string' ? status : status?.name || status?.description;
    if (!statusText) throw new Error('MISSING_PROVIDER_STATUS');
    const target = await resolveMappedBankStatus(db, proposal.tenantId, proposal.promoterId, provider, [statusText]);
    if (!target) throw new Error('MISSING_STATUS_MAPPING');
    const financial = provider === 'finanto' ? {
        releasedValue: providerAmount(item.loanValue ?? item.releasedValue ?? item.finalDisbursedAmount),
        installmentValue: providerAmount(item.installmentValue ?? item.installment_value),
        debtBalance: providerAmount(item.debtBalance),
    } : {
        releasedValue: providerAmount(item.val_liquido ?? item.final_disbursed_amount ?? item.disbursement_options?.final_disbursement_amount),
        contractValue: providerAmount(item.val_emissao ?? item.issue_amount),
        debtBalance: providerAmount(item.saldo_devedor),
    };
    const prefix = provider === 'finanto' ? 'finanto' : 'nossaFintech';
    await updateMappedProviderProposal(db, proposal, { ...financial, [`${prefix}Status`]: statusText, [`${prefix}LastSyncAt`]: new Date(), [`${prefix}SyncError`]: null, [`${prefix}RawData`]: raw, version: { increment: 1 } }, target, null, 'CIP API');
    return { success: true };
}

export async function runPortabilityAutomation(db: PrismaClient, options: { tenantId?: string; deadline?: number } = {}) {
    const deadline = options.deadline || Date.now() + 18000;
    const result = { success: true, checkedCount: 0, saldoRetornadoCount: 0, alertsGenerated: 0, syncedCount: 0, failedCount: 0, details: [] as string[] };
    const cursorId = 'cip-auto-cursor-' + hash(options.tenantId || 'all');
    const cursorRow = await db.systemConfig.findUnique({ where: { id: cursorId } });
    const cursor = cursorRow ? JSON.parse(cursorRow.configValue).id || '' : '';
    const proposals = await db.proposal.findMany({
        where: { ...(options.tenantId ? { tenantId: options.tenantId } : {}), deletedAt: null, type: 'PORTABILIDADE', status: { code: 'AGUARDAR_RETORNO_CIP', finalStatus: false }, tenant: { status: 'ACTIVE', deletedAt: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
        include: { bank: true, status: true, statusHistories: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 } }, orderBy: { id: 'asc' }, take: 60,
    });
    const calendars = new Map<string, { days: number; holidays: Set<string> }>();
    let lastId = cursor, consumed = 0, apiUsed = false;
    for (const proposal of proposals) {
        if (Date.now() >= deadline) break;
        const previousId = lastId;
        lastId = proposal.id; consumed++; result.checkedCount++;
        let calendar = calendars.get(proposal.tenantId);
        if (!calendar) {
            const rows = await db.systemConfig.findMany({ where: { tenantId: proposal.tenantId, configKey: { in: ['OPERATIONAL_HOLIDAYS', 'PORTABILITY_BALANCE_DAYS'] } } });
            const saved = rows.find(row => row.configKey === 'OPERATIONAL_HOLIDAYS');
            const holidays = saved ? JSON.parse(saved.configValue) : DEFAULT_HOLIDAYS;
            const days = Number(rows.find(row => row.configKey === 'PORTABILITY_BALANCE_DAYS')?.configValue || 5);
            calendar = { days: Number.isInteger(days) && days >= 1 && days <= 30 ? days : 5, holidays: new Set((Array.isArray(holidays) ? holidays : []).filter((h: any) => typeof h === 'string' || h?.active !== false).map((h: any) => typeof h === 'string' ? h : h.date)) };
            calendars.set(proposal.tenantId, calendar);
        }
        const start = proposal.retentionDeadline || (proposal.statusHistories[0]?.statusId === proposal.statusId ? proposal.statusHistories[0].createdAt : proposal.createdAt);
        if (elapsed(start, new Date(), calendar.holidays) < calendar.days) continue;
        const key = 'CIP_AUTO_ATTEMPT_V1_' + proposal.id;
        const stored = await db.systemConfig.upsert({ where: { tenantId_configKey: { tenantId: proposal.tenantId, configKey: key } }, create: { tenantId: proposal.tenantId, configKey: key, configValue: '{"nextAt":0}' }, update: {} });
        if (Number(JSON.parse(stored.configValue).nextAt) > Date.now()) continue;
        let provider: Provider | null;
        try { provider = await connection(db, proposal); }
        catch { result.failedCount++; result.details.push('Conexão bancária pendente de configuração ou consulta compatível.'); continue; }
        if (provider && apiUsed) { lastId = previousId; consumed--; result.checkedCount--; break; }
        const claim = JSON.stringify({ nextAt: Date.now() + 5 * 60_000, lease: randomUUID() });
        const locked = await db.systemConfig.updateMany({ where: { id: stored.id, configValue: stored.configValue }, data: { configValue: claim } });
        if (!locked.count) continue;
        try {
            if (provider) {
                apiUsed = true;
                if (!proposal.promoterId) throw new Error('MISSING_PROMOTER');
                if (provider === 'happy' && !proposal.happyContractId) throw new Error('MISSING_EXTERNAL_ID');
                // Reconciliation of an unchanged CIP stage must not restart its SLA clock.
                if (!proposal.retentionDeadline) {
                    await db.proposal.updateMany({ where: { id: proposal.id, tenantId: proposal.tenantId, statusId: proposal.statusId, retentionDeadline: null, deletedAt: null }, data: { retentionDeadline: start } });
                    proposal.retentionDeadline = start;
                }
                const sync = provider === 'facta'
                    ? await FactaBankService.syncProposalStatus(db, proposal.id, proposal.tenantId, { queriedBy: 'AUTO_WORKER' })
                    : provider === 'c6' ? await C6BankService.syncProposalStatus(db, proposal.id, proposal.tenantId, { queriedBy: 'AUTO_WORKER' })
                    : provider === 'happy' ? await HappyBankService.syncProposal(db, proposal.tenantId, proposal.id)
                    : provider === 'workbank' ? await WorkbankService.refreshLinkedProposal(db, proposal)
                    : await syncMapped(db, proposal, provider);
                if (!sync.success) throw new Error('PROVIDER_SYNC_FAILED');
                const updated = await db.proposal.findFirst({ where: { id: proposal.id, tenantId: proposal.tenantId, deletedAt: null }, include: { status: true } });
                if (!updated) continue;
                if (updated.status?.code === 'SALDO_RETORNADO') result.saldoRetornadoCount++;
                result.syncedCount++;
                if (updated.status?.standardCategory === 'RECUSADO' || updated.status?.code === 'REPROVADO') {
                    const raw = (provider === 'facta' ? updated.factaRawData : provider === 'c6' ? updated.c6RawData : provider === 'happy' ? updated.happyRawData : provider === 'finanto' ? updated.finantoRawData : updated.nossaFintechRawData) as any;
                    const reason = ['reason' in sync ? sync.reason : undefined, raw?.operation?.motivo_reprovacao, raw?.loan?.reason, raw?.motivo_reprovacao, raw?.motivo, raw?.observacao, raw?.status_description, updated.c6ActivityDescription, updated.happyStatusDescription, updated.factaCrivoStatus].find(value => typeof value === 'string' && value.trim());
                    const text = `[Consulta automática CIP] Reprovada pelo banco. Motivo: ${String(reason || 'O banco não informou o motivo nesta consulta.').slice(0, 2000)}`;
                    if (!await db.comment.findFirst({ where: { tenantId: proposal.tenantId, proposalId: proposal.id, text } })) await db.comment.create({ data: { tenantId: proposal.tenantId, proposalId: proposal.id, authorName: 'Sistema CIP', text } });
                }
            } else {
                await db.$transaction(async tx => {
                    const target = await tx.proposalStatus.findFirst({ where: { tenantId: proposal.tenantId, code: 'SALDO_RETORNADO', active: true, automaticChangeAllowed: true } });
                    if (!target) throw new Error('MISSING_RETURN_STATUS');
                    const changed = await tx.proposal.updateMany({ where: { id: proposal.id, tenantId: proposal.tenantId, statusId: proposal.statusId, updatedAt: proposal.updatedAt, deletedAt: null }, data: { statusId: target.id, standardCategory: target.standardCategory, retentionDeadline: null, version: { increment: 1 } } });
                    if (!changed.count) return;
                    const notes = `Alteração automática após ${calendar!.days} dias úteis de CIP, sem API vinculada. Valores cadastrados preservados; sem confirmação bancária.`;
                    await tx.statusHistory.create({ data: { tenantId: proposal.tenantId, proposalId: proposal.id, statusId: target.id, statusName: target.name, notes } });
                    await tx.auditLog.create({ data: { tenantId: proposal.tenantId, action: 'PORTABILITY_RETURN_BY_SLA', entity: 'Proposal', entityId: proposal.id, userName: 'Sistema CIP', newData: JSON.stringify({ statusId: target.id, source: 'SLA_WITHOUT_API', days: calendar!.days }) } });
                    result.saldoRetornadoCount++;
                });
            }
        } catch {
            result.failedCount++;
            result.details.push('Não foi possível concluir uma consulta CIP. Status não presumido; nova tentativa no próximo ciclo.');
        }
    }
    const nextId = consumed === proposals.length && proposals.length < 60 ? '' : lastId;
    await db.systemConfig.upsert({ where: { id: cursorId }, create: { id: cursorId, configKey: 'CIP_AUTO_CURSOR_V1', tenantId: options.tenantId || null, configValue: JSON.stringify({ id: nextId }) }, update: { configValue: JSON.stringify({ id: nextId }) } });
    result.success = result.failedCount === 0;
    return result;
}
