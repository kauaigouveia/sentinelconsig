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
        if (this.isProcessingTenant.has(tenant.id)) {
          continue;
        }

        const config = await FactaBankService.getTenantConfig(prisma, tenant.id);
        if (!config.autoSyncEnabled || !config.isConfigured) {
          continue;
        }

        const now = Date.now();
        const lastRun = this.lastRunTimestamps.get(tenant.id) || 0;
        const intervalMs = config.syncIntervalMinutes * 60 * 1000;

        if (now - lastRun >= intervalMs) {
          this.processTenantProposals(prisma, tenant.id, config.syncIntervalMinutes).catch((err) => {
            logger.warn({ tenantId: tenant.id, err }, '[FACTA WORKER] Falha ao processar tenant FACTA');
          });
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
    intervalMinutes = 15
  ): Promise<{
    processedCount: number;
    updatedCount: number;
    unlinkedCount: number;
    failedCount: number;
  }> {
    if (this.isProcessingTenant.has(tenantId)) {
      throw new Error('Processamento FACTA já em andamento para esta empresa.');
    }

    this.isProcessingTenant.add(tenantId);
    this.lastRunTimestamps.set(tenantId, Date.now());

    let processedCount = 0;
    let updatedCount = 0;
    let unlinkedCount = 0;
    let failedCount = 0;
    let lastError: string | null = null;

    try {
      const batchResult = await FactaBankService.processBatchProposals(prisma, tenantId, {
        daysBack: 30,
        queriedBy: 'AUTO_WORKER',
      });

      processedCount = batchResult.processedCount;
      updatedCount = batchResult.updatedCount;
      unlinkedCount = batchResult.unlinkedCount;
      failedCount = batchResult.failedCount;

      if (batchResult.errors && batchResult.errors.length > 0) {
        lastError = batchResult.errors[0];
      }

      const pendingCount = await this.countPendingProposals(prisma, tenantId);
      const recentFailures = await prisma.factaSyncHistory.count({
        where: {
          tenantId,
          success: false,
          queryDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      this.workerStatuses.set(tenantId, {
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
      this.isProcessingTenant.delete(tenantId);
    }
  }

  /**
   * Conta a quantidade de propostas FACTA pendentes no Sentinel
   */
  public static async countPendingProposals(
    prisma: PrismaClient,
    tenantId: string
  ): Promise<number> {
    return prisma.proposal.count({
      where: {
        tenantId,
        deletedAt: null,
        standardCategory: {
          notIn: ['PAGO', 'CANCELADO', 'RECUSADO'],
        },
        OR: [
          { bank: { name: { contains: 'FACTA', mode: 'insensitive' } } },
          { bank: { code: '149' } },
          { factaProposalNumber: { not: null } },
          { factaAfCode: { not: null } },
        ],
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
    tenantId: string
  ): Promise<FactaWorkerStatus> {
    const config = await FactaBankService.getTenantConfig(prisma, tenantId);
    const cachedStatus = this.workerStatuses.get(tenantId);
    const pendingCount = await this.countPendingProposals(prisma, tenantId);

    const recentFailures = await prisma.factaSyncHistory.count({
      where: {
        tenantId,
        success: false,
        queryDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const isLocked = this.isProcessingTenant.has(tenantId);

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
