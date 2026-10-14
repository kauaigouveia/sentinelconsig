import { currentIntegrationPromoter } from './bankPromoterConfig.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../logger.js';
import { FactaBankService } from './factaBankService.js';
import { FactaWorkerStatus } from './factaBankTypes.js';

export class FactaSyncWorker {
  private static isRunning = false;
  private static intervalHandle: NodeJS.Timeout | null = null;
  private static lastRunTimestamps: Map<string, number> = new Map();
  private static workerStatuses: Map<string, FactaWorkerStatus> = new Map();
  private static isProcessingTenant: Set<string> = new Set();

  /**
   * Inicia o worker periódico no background do servidor para a FACTA Financeira
   */
  public static start(prisma: PrismaClient, checkIntervalMs = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('[FACTA WORKER] Iniciando background worker de sincronização FACTA Financeira...');

    // Executar primeira checagem após 20 segundos de inicialização do servidor
    setTimeout(() => {
      this.runCycle(prisma).catch((err) => {
        logger.error({ err }, '[FACTA WORKER] Erro no ciclo inicial de sincronização FACTA');
      });
    }, 20000);

    // Ciclo periódico
    this.intervalHandle = setInterval(() => {
      this.runCycle(prisma).catch((err) => {
        logger.error({ err }, '[FACTA WORKER] Erro no ciclo de sincronização FACTA');
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
    logger.info('[FACTA WORKER] Worker de sincronização FACTA encerrado.');
  }

  /**
   * Ciclo principal: varre tenants ativos e processa propostas FACTA
   */
  private static async runCycle(prisma: PrismaClient): Promise<void> {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true },
      });

      for (const tenant of tenants) {
        for (const config of await FactaBankService.getPromoterConfigs(prisma, tenant.id)) {
          if (!config.autoSyncEnabled || !config.isConfigured || !config.promoterId) continue;
          const scopeKey = `${tenant.id}:${config.promoterId}`;
          if (this.isProcessingTenant.has(scopeKey)) continue;
          if (Date.now() - (this.lastRunTimestamps.get(scopeKey) || 0) >= config.syncIntervalMinutes * 60000) {
            await this.processTenantProposals(prisma, tenant.id, config.syncIntervalMinutes, config.promoterId).catch(err => {
              logger.warn({ tenantId: tenant.id, promoterId: config.promoterId, err }, '[FACTA WORKER] Falha na conexão da promotora');
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err }, '[FACTA WORKER] Erro ao listar tenants para o ciclo FACTA');
    }
  }

  /**
   * Processa lote de propostas FACTA para um tenant específico
   */
  public static async processTenantProposals(
    prisma: PrismaClient,
    tenantId: string,
    intervalMinutes = 15,
    promoterId?: string
  ): Promise<{
    processedCount: number;
    updatedCount: number;
    unlinkedCount: number;
    failedCount: number;
  }> {
    promoterId ||= currentIntegrationPromoter();
    if (!promoterId) {
      const total = { processedCount: 0, updatedCount: 0, unlinkedCount: 0, failedCount: 0 };
      for (const config of await FactaBankService.getPromoterConfigs(prisma, tenantId)) {
        if (!config.isConfigured || !config.promoterId) continue;
        const result = await this.processTenantProposals(prisma, tenantId, config.syncIntervalMinutes, config.promoterId);
        for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += result[key];
      }
      return total;
    }
    await FactaBankService.getTenantConfig(prisma, tenantId, promoterId);
    const scopeKey = `${tenantId}:${promoterId}`;
    if (this.isProcessingTenant.has(scopeKey)) throw new Error('Sincronização já em andamento para esta promotora.');
    this.isProcessingTenant.add(scopeKey);
    this.lastRunTimestamps.set(scopeKey, Date.now());

    let processedCount = 0;
    let updatedCount = 0;
    let unlinkedCount = 0;
    let failedCount = 0;
    let lastError: string | null = null;

    try {
      const batchResult = await FactaBankService.processBatchProposals(prisma, tenantId, {
        daysBack: 30,
        queriedBy: 'AUTO_WORKER',
        promoterId,
      });

      processedCount = batchResult.processedCount;
      updatedCount = batchResult.updatedCount;
      unlinkedCount = batchResult.unlinkedCount;
      failedCount = batchResult.failedCount;

      if (batchResult.errors && batchResult.errors.length > 0) {
        lastError = batchResult.errors[0];
      }

      const pendingCount = await this.countPendingProposals(prisma, tenantId, promoterId);
      const recentFailures = await prisma.factaSyncHistory.count({
        where: {
          tenantId,
          proposal: { promoterId },
        success: false,
          queryDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      this.workerStatuses.set(scopeKey, {
        isRunning: true,
        autoSyncEnabled: true,
        syncIntervalMinutes: intervalMinutes,
        lastRunAt: new Date().toISOString(),
        lastRunSuccess: failedCount === 0,
        lastRunProcessedCount: processedCount,
        lastRunUpdatedCount: updatedCount,
        lastRunUnlinkedCount: unlinkedCount,
        lastRunError: lastError,
        pendingProposalsCount: pendingCount,
        recentFailuresCount: recentFailures,
        activeLock: false,
      });

      return { processedCount, updatedCount, unlinkedCount, failedCount };
    } catch (err: any) {
      lastError = err.message || 'Erro inesperado na sincronização FACTA';
      logger.error({ tenantId, err }, '[FACTA WORKER] Erro crítico ao processar lote FACTA');
      throw err;
    } finally {
      this.isProcessingTenant.delete(scopeKey);
    }
  }

  /**
   * Conta a quantidade de propostas FACTA pendentes no Sentinel
   */
  public static async countPendingProposals(
    prisma: PrismaClient,
    tenantId: string,
    promoterId?: string
  ): Promise<number> {
    return prisma.proposal.count({
      where: {
        tenantId,
        promoterId,
        deletedAt: null,
        standardCategory: {
          notIn: ['PAGO', 'CANCELADO', 'RECUSADO'],
        },
        bank: { OR: [{ name: { contains: 'FACTA', mode: 'insensitive' } }, { code: '149' }] },
        AND: [
          {
            OR: [
              { factaLastSyncAt: null },
              { factaSyncStatus: 'PENDING' },
              { factaSyncStatus: 'ERROR' },
              { factaSyncStatus: 'UNLINKED' },
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
    tenantId: string,
    promoterId?: string
  ): Promise<FactaWorkerStatus> {
    const config = await FactaBankService.getTenantConfig(prisma, tenantId, promoterId);
    const cachedStatus = this.workerStatuses.get(`${tenantId}:${config.promoterId}`);
    const pendingCount = await this.countPendingProposals(prisma, tenantId, config.promoterId);

    const recentFailures = await prisma.factaSyncHistory.count({
      where: {
        tenantId,
        proposal: { promoterId: config.promoterId },
        success: false,
        queryDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const isLocked = this.isProcessingTenant.has(`${tenantId}:${config.promoterId}`);

    return {
      isRunning: this.isRunning,
      autoSyncEnabled: config.autoSyncEnabled,
      syncIntervalMinutes: config.syncIntervalMinutes,
      lastRunAt: cachedStatus?.lastRunAt || null,
      lastRunSuccess: cachedStatus?.lastRunSuccess ?? true,
      lastRunProcessedCount: cachedStatus?.lastRunProcessedCount || 0,
      lastRunUpdatedCount: cachedStatus?.lastRunUpdatedCount || 0,
      lastRunUnlinkedCount: cachedStatus?.lastRunUnlinkedCount || 0,
      lastRunError: cachedStatus?.lastRunError || null,
      pendingProposalsCount: pendingCount,
      recentFailuresCount: recentFailures,
      activeLock: isLocked,
    };
  }
}
