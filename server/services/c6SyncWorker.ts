import { currentIntegrationPromoter, withIntegrationPromoter, integrationCacheKey, resolveBankPromoter } from './bankPromoterConfig.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';
import { C6BankService } from './c6BankService.js';
import { C6WorkerStatus } from './c6BankTypes.js';

export class C6SyncWorker {
  private static isRunning = false;
  private static intervalHandle: NodeJS.Timeout | null = null;
  private static lastRunTimestamps: Map<string, number> = new Map();
  private static workerStatuses: Map<string, C6WorkerStatus> = new Map();
  private static isProcessingTenant: Set<string> = new Set();

  /**
   * Inicia o worker periódico no background do servidor
   */
  public static start(prisma: PrismaClient, checkIntervalMs = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('[C6 WORKER] Iniciando background worker de sincronização C6 Bank...');

    // Executar primeira checagem após 15 segundos de inicialização do servidor
    setTimeout(() => {
      this.runCycle(prisma).catch((err) => {
        logger.error({ err }, '[C6 WORKER] Erro no ciclo inicial de sincronização C6');
      });
    }, 15000);

    // Ciclo periódico
    this.intervalHandle = setInterval(() => {
      this.runCycle(prisma).catch((err) => {
        logger.error({ err }, '[C6 WORKER] Erro no ciclo de sincronização C6');
      });
    }, checkIntervalMs);
  }

  /**
   * Encerra o worker de forma segura
   */
  public static stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    logger.info('[C6 WORKER] Worker de sincronização C6 Bank encerrado.');
  }

  /**
   * Ciclo principal: varre tenants ativos e processa propostas elegíveis
   */
  private static async runCycle(prisma: PrismaClient): Promise<void> {
    try {
      // Buscar tenants ativos
      const tenants = await prisma.tenant.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true },
      });

      for (const tenant of tenants) {
        const promoters = await prisma.promoter.findMany({ where: { tenantId: tenant.id, status: 'ATIVO' }, select: { id: true } });
        for (const promoter of promoters) await withIntegrationPromoter(promoter.id, async () => {
          const config = await C6BankService.getTenantConfig(prisma, tenant.id);
          const scopeKey = integrationCacheKey(tenant.id);
          if (!config.autoSyncEnabled || !config.isConfigured || this.isProcessingTenant.has(scopeKey)) return;
          if (Date.now() - (this.lastRunTimestamps.get(scopeKey) || 0) >= config.syncIntervalMinutes * 60000) {
            await this.processTenantProposals(prisma, tenant.id, config.syncIntervalMinutes).catch(err => logger.warn({ tenantId: tenant.id, promoterId: promoter.id, err }, '[C6 WORKER] Falha na conexão da promotora'));
          }
        });
      }
    } catch (err) {
      logger.error({ err }, '[C6 WORKER] Erro ao listar tenants para o ciclo C6');
    }
  }

  /**
   * Processa lote de propostas C6 elegíveis para um tenant específico
   */
  public static async processTenantProposals(
    prisma: PrismaClient,
    tenantId: string,
    intervalMinutes = 15
  ): Promise<{ processedCount: number; successCount: number; failedCount: number }> {
    if (this.isProcessingTenant.has(integrationCacheKey(tenantId))) {
      throw new Error('Processamento C6 já em andamento para esta empresa.');
    }

    this.isProcessingTenant.add(integrationCacheKey(tenantId));
    this.lastRunTimestamps.set(integrationCacheKey(tenantId), Date.now());

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let lastError: string | null = null;

    try {
      // 1. Identificar propostas elegíveis para sincronização:
      // - Pertencem ao tenant
      // - Não deletadas
      // - Não encerradas (standardCategory NOT IN PAGO, CANCELADO, RECUSADO)
      // - Banco C6 (code '336' ou nome contendo C6) OU c6ProposalNumber preenchido
      // - Última sincronização mais antiga que o intervalo ou nula
      const minSyncDate = new Date(Date.now() - intervalMinutes * 60 * 1000);

      const eligibleProposals = await prisma.proposal.findMany({
        where: {
          tenantId,
          promoterId: (await resolveBankPromoter(prisma, tenantId, currentIntegrationPromoter(), 'DG')).id,
        deletedAt: null,
          standardCategory: {
            notIn: ['PAGO', 'CANCELADO', 'RECUSADO'],
          },
          OR: [
            { bank: { code: '336' } },
            { bank: { name: { contains: 'C6', mode: 'insensitive' } } },
          ],
          AND: [
            {
              OR: [
                { c6LastSyncAt: null },
                { c6LastSyncAt: { lte: minSyncDate } },
              ],
            },
          ],
        },
        select: {
          id: true,
          proposalNumber: true,
          c6ProposalNumber: true,
          c6SyncStatus: true,
        },
        take: 15, // Lote seguro para evitar sobrecarga ou 429
        orderBy: [
          { c6LastSyncAt: { sort: 'asc', nulls: 'first' } },
          { updatedAt: 'desc' },
        ],
      });

      logger.info(
        { tenantId, eligibleCount: eligibleProposals.length },
        '[C6 WORKER] Propostas elegíveis encontradas para sincronização'
      );

      for (const prop of eligibleProposals) {
        processedCount++;
        try {
          const result = await C6BankService.syncProposalStatus(prisma, prop.id, tenantId, {
            queriedBy: 'AUTO_WORKER',
          });

          if (result.success) {
            successCount++;
          } else {
            failedCount++;
            lastError = result.error || 'Falha na sincronização';
          }
        } catch (err: any) {
          failedCount++;
          lastError = err?.message || 'Erro inesperado na sincronização';
          logger.warn({ proposalId: prop.id, err: err?.message }, '[C6 WORKER] Erro ao sincronizar proposta');
        }

        // Delay de 600ms entre propostas para respeitar o rate limit do C6
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      // Atualizar status do worker para o tenant
      const pendingCount = await this.countPendingProposals(prisma, tenantId);
      const recentFailures = await prisma.c6SyncHistory.count({
        where: {
          tenantId,
          proposal: { promoterId: (await resolveBankPromoter(prisma, tenantId, currentIntegrationPromoter(), 'DG')).id },
        success: false,
          queryDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      this.workerStatuses.set(integrationCacheKey(tenantId), {
        isRunning: true,
        autoSyncEnabled: true,
        syncIntervalMinutes: intervalMinutes,
        lastRunAt: new Date().toISOString(),
        lastRunSuccess: failedCount === 0,
        lastRunItemCount: processedCount,
        lastRunError: lastError,
        pendingProposalsCount: pendingCount,
        recentFailuresCount: recentFailures,
        activeLock: false,
      });

      return { processedCount, successCount, failedCount };
    } finally {
      this.isProcessingTenant.delete(integrationCacheKey(tenantId));
    }
  }

  /**
   * Conta a quantidade de propostas C6 pendentes de sincronização
   */
  public static async countPendingProposals(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<number> {
    return prisma.proposal.count({
      where: {
        tenantId,
        promoterId: (await resolveBankPromoter(prisma, tenantId, currentIntegrationPromoter(), 'DG')).id,
        deletedAt: null,
        standardCategory: {
          notIn: ['PAGO', 'CANCELADO', 'RECUSADO'],
        },
        OR: [
          { bank: { code: '336' } },
          { bank: { name: { contains: 'C6', mode: 'insensitive' } } },
        ],
        AND: [
          {
            OR: [
              { c6LastSyncAt: null },
              { c6SyncStatus: 'PENDING' },
              { c6SyncStatus: 'ERROR' },
            ],
          },
        ],
      },
    });
  }

  /**
   * Retorna o status operacional detalhado do worker para visualização administrativa
   */
  public static async getWorkerStatus(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<C6WorkerStatus> {
    const config = await C6BankService.getTenantConfig(prisma, tenantId);
    const cachedStatus = this.workerStatuses.get(integrationCacheKey(tenantId));
    const pendingCount = await this.countPendingProposals(prisma, tenantId);

    const recentFailures = await prisma.c6SyncHistory.count({
      where: {
        tenantId,
        proposal: { promoterId: (await resolveBankPromoter(prisma, tenantId, currentIntegrationPromoter(), 'DG')).id },
        success: false,
        queryDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const isLocked = this.isProcessingTenant.has(integrationCacheKey(tenantId));

    return {
      isRunning: this.isRunning,
      autoSyncEnabled: config.autoSyncEnabled,
      syncIntervalMinutes: config.syncIntervalMinutes,
      lastRunAt: cachedStatus?.lastRunAt || null,
      lastRunSuccess: cachedStatus?.lastRunSuccess ?? true,
      lastRunItemCount: cachedStatus?.lastRunItemCount || 0,
      lastRunError: cachedStatus?.lastRunError || null,
      pendingProposalsCount: pendingCount,
      recentFailuresCount: recentFailures,
      activeLock: isLocked,
    };
  }
}
