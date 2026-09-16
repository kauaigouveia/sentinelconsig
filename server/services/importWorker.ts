import { PrismaClient, ImportJobStatus, ImportJobType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { sseRegistry } from '../realtime.js';
import { logger } from '../logger';
import { AuditLogService } from './auditLogService.js';

export interface ImportProposalRow {
  cpf: string;
  fullName?: string;
  proposalNumber: string;
  partnerCodeOrLogin?: string;
  productName?: string;
  bankName?: string;
  promoterName?: string;
  disbursedValue?: number;
  contractBalance?: number;
  installments?: number;
  installmentValue?: number;
  termMonths?: number;
  tableType?: string;
  operationType?: string;
  statusName?: string;
  digitizerName?: string;
  notes?: string;
}

export interface ImportStatusRow {
  proposalNumberOrAde: string;
  targetStatusName: string;
  observation?: string;
  subStatus?: string;
  paymentDate?: string;
}

export interface ImportPartnerRow {
  name: string;
  code?: string;
  login?: string;
  promoterName?: string;
  email?: string;
  phone?: string;
  active?: boolean;
}

export interface ImportSimulationRow {
  cpf: string;
  clientName?: string;
  partnerCodeOrLogin?: string;
  productName?: string;
  bankName?: string;
  requestedValue?: number;
  notes?: string;
}

// In-memory registry of cancelation tokens for ongoing jobs
const activeCancellationFlags = new Set<string>();

export class ImportWorkerService {
  private static CHUNK_SIZE = 500;

  public static requestCancellation(jobId: string): void {
    activeCancellationFlags.add(jobId);
  }

  public static isCancellationRequested(jobId: string): boolean {
    return activeCancellationFlags.has(jobId);
  }

  /**
   * Sanitizes strings against CSV/Excel formula injection
   */
  public static sanitizeFormula(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@') || str.startsWith('\t') || str.startsWith('\r')) {
      return `'${str}`;
    }
    return str;
  }

  /**
   * Normalizes CPF to 11 digits
   */
  public static normalizeCpf(raw: any): string {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 11) {
      return digits.padStart(11, '0');
    }
    return digits;
  }

  /**
   * Helper to parse currency/numbers
   */
  public static parseCurrency(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const str = String(val).replace(/R\$\s?/gi, '').trim();
    if (!str) return 0;
    // Format "1.234,56" or "1234.56"
    if (str.includes(',') && str.includes('.')) {
      return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (str.includes(',')) {
      return parseFloat(str.replace(',', '.')) || 0;
    }
    return parseFloat(str) || 0;
  }

  public static readonly MAX_IMPORT_ROWS = 50000;

  /**
   * Helper to parse tabular data from Buffer (xlsx, csv)
   */
  public static async parseFileToRows(buffer: Buffer, fileName: string): Promise<any[][]> {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.xls')) {
      throw new Error('Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.');
    }

    const isCsv = lowerName.endsWith('.csv');

    if (isCsv) {
      const content = buffer.toString('utf-8');
      const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) return [];
      if (lines.length > ImportWorkerService.MAX_IMPORT_ROWS) {
        throw new Error(`O arquivo excede o limite máximo permitido de ${ImportWorkerService.MAX_IMPORT_ROWS.toLocaleString('pt-BR')} registros para importação.`);
      }
      const delimiter = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
      return lines.map(line => line.split(delimiter).map(cell => cell.replace(/^["']|["']$/g, '').trim()));
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('O arquivo não contém planilhas legíveis.');
    }

    const rows: any[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(
        rowValues.map(v => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') {
            if ('result' in v && v.result !== undefined) return v.result;
            if ('text' in v && v.text !== undefined) return v.text;
            if ('hyperlink' in v && 'text' in v) return v.text;
            if (v instanceof Date) return v.toISOString();
          }
          return v;
        })
      );
    });

    if (rows.length > ImportWorkerService.MAX_IMPORT_ROWS) {
      throw new Error(`O arquivo excede o limite máximo permitido de ${ImportWorkerService.MAX_IMPORT_ROWS.toLocaleString('pt-BR')} registros para importação.`);
    }

    return rows;
  }

  /**
   * Background runner for Proposals Bulk Import
   */
  public static async processProposalsJob(
    prisma: PrismaClient,
    jobId: string,
    tenantId: string,
    userId: string,
    parsedRows: ImportProposalRow[]
  ): Promise<void> {
    const startTime = Date.now();
    activeCancellationFlags.delete(jobId);

    try {
      // 1. Mark Job as PROCESSING
      const totalRecords = parsedRows.length;
      const totalChunks = Math.ceil(totalRecords / this.CHUNK_SIZE) || 1;

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.PROCESSING,
          startedAt: new Date(),
          totalRecords,
          totalChunks,
        },
      });

      // Emit SSE IMPORT_STARTED
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_STARTED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          totalRecords,
          fileName: (await prisma.importJob.findUnique({ where: { id: jobId } }))?.fileName,
        },
      });

      // 2. Pre-fetch existing catalogues for the tenant
      const [banks, promoters, partners, products, defaultStatus] = await Promise.all([
        prisma.bank.findMany({ where: { tenantId } }),
        prisma.promoter.findMany({ where: { tenantId } }),
        prisma.partner.findMany({ where: { tenantId } }),
        prisma.product.findMany({ where: { tenantId } }),
        prisma.proposalStatus.findFirst({ where: { tenantId, standardCategory: 'ESTEIRA' } }),
      ]);

      let createdCount = 0;
      let updatedCount = 0;
      let duplicateCount = 0;
      let invalidCount = 0;
      let failedCount = 0;
      let processedCount = 0;

      // 3. Process in Chunks
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        // Check for cancellation token before each chunk
        if (this.isCancellationRequested(jobId)) {
          console.log(`[IMPORT WORKER] Job [${jobId}] cancelado a pedido do usuário no chunk ${chunkIdx + 1}`);
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              status: ImportJobStatus.CANCELLED,
              cancelledAt: new Date(),
              processedRecords: processedCount,
              createdRecords: createdCount,
              updatedRecords: updatedCount,
              duplicateRecords: duplicateCount,
              invalidRecords: invalidCount,
              failedRecords: failedCount,
              currentChunk: chunkIdx,
            },
          });

          await AuditLogService.record(prisma, {
            tenantId,
            userId,
            action: 'IMPORT_CANCELLED',
            entity: 'ImportJob',
            entityId: jobId,
            newData: {
              processedRecords: processedCount,
              createdRecords: createdCount,
              updatedRecords: updatedCount,
              durationMs: Date.now() - startTime,
            },
          });

          sseRegistry.broadcastToTenant(tenantId, {
            type: 'IMPORT_CANCELLED',
            entity: 'ImportJob',
            entityId: jobId,
            userId,
            data: { importId: jobId },
          });

          activeCancellationFlags.delete(jobId);
          return;
        }

        const start = chunkIdx * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, totalRecords);
        const chunk = parsedRows.slice(start, end);

        // Process chunk items safely
        for (const item of chunk) {
          try {
            const cleanCpf = this.normalizeCpf(item.cpf);
            const cleanAde = String(item.proposalNumber || '').trim();

            if (!cleanCpf || cleanCpf.length !== 11 || !cleanAde) {
              invalidCount++;
              processedCount++;
              continue;
            }

            // Find or create Client (Scoped strictly to tenantId)
            let client = await prisma.client.findUnique({
              where: {
                tenantId_cpf: {
                  tenantId,
                  cpf: cleanCpf,
                },
              },
            });

            if (!client) {
              client = await prisma.client.create({
                data: {
                  tenantId,
                  cpf: cleanCpf,
                  fullName: this.sanitizeFormula(item.fullName || `Cliente ${cleanCpf}`),
                },
              });
            }

            // Match Bank, Promoter, Partner, Product
            let bankId: string | null = null;
            if (item.bankName) {
              const bUpper = item.bankName.toUpperCase();
              const foundB = banks.find(b => b.name.toUpperCase() === bUpper || bUpper.includes(b.name.toUpperCase()));
              if (foundB) bankId = foundB.id;
            }

            let promoterId: string | null = null;
            if (item.promoterName) {
              const pUpper = item.promoterName.toUpperCase();
              const foundP = promoters.find(p => p.name.toUpperCase() === pUpper || pUpper.includes(p.name.toUpperCase()));
              if (foundP) promoterId = foundP.id;
            }

            let partnerId: string | null = null;
            if (item.partnerCodeOrLogin) {
              const partClean = item.partnerCodeOrLogin.toUpperCase();
              const foundPart = partners.find(p => p.code.toUpperCase() === partClean || p.name.toUpperCase().includes(partClean));
              if (foundPart) {
                partnerId = foundPart.id;
                if (!promoterId && foundPart.promoterId) promoterId = foundPart.promoterId;
              }
            }

            let productId: string | null = null;
            if (item.productName) {
              const prodUpper = item.productName.toUpperCase();
              const foundProd = products.find(p => p.name.toUpperCase() === prodUpper || prodUpper.includes(p.name.toUpperCase()));
              if (foundProd) productId = foundProd.id;
            }

            const disbursedVal = item.disbursedValue || 0;
            const contractBal = item.contractBalance || disbursedVal;

            // Check if proposal already exists in DB for this tenant
            const existingProposal = await prisma.proposal.findUnique({
              where: {
                tenantId_proposalNumber: {
                  tenantId,
                  proposalNumber: cleanAde,
                },
              },
            });

            if (existingProposal) {
              // Compare financials for legitimate updates
              const releasedDiff = disbursedVal > 0 && Math.abs(disbursedVal - Number(existingProposal.releasedValue || 0)) > 0.01;
              const contractDiff = contractBal > 0 && Math.abs(contractBal - Number(existingProposal.contractValue || 0)) > 0.01;

              if (releasedDiff || contractDiff) {
                await prisma.proposal.update({
                  where: { id: existingProposal.id },
                  data: {
                    releasedValue: disbursedVal > 0 ? disbursedVal : existingProposal.releasedValue,
                    contractValue: contractBal > 0 ? contractBal : existingProposal.contractValue,
                    debtBalance: contractBal > 0 ? contractBal : existingProposal.debtBalance,
                    version: { increment: 1 },
                  },
                });
                updatedCount++;
              } else {
                duplicateCount++;
              }
            } else {
              // Create new proposal
              const newProp = await prisma.proposal.create({
                data: {
                  tenantId,
                  proposalNumber: cleanAde,
                  clientId: client.id,
                  createdById: userId,
                  bankId: bankId || undefined,
                  promoterId: promoterId || undefined,
                  partnerId: partnerId || undefined,
                  productId: productId || undefined,
                  statusId: defaultStatus?.id,
                  releasedValue: disbursedVal,
                  contractValue: contractBal,
                  debtBalance: contractBal,
                  installmentValue: item.installmentValue || 0,
                  installmentsCount: item.installments || item.termMonths || 84,
                  type: (item.operationType as any) || 'NOVO',
                },
              });

              // Create ADE entry
              await prisma.aDE.create({
                data: {
                  tenantId,
                  proposalId: newProp.id,
                  adeNumber: cleanAde,
                  value: disbursedVal,
                  installments: item.installments || 1,
                },
              }).catch(() => {});

              createdCount++;
            }
          } catch (rowErr: any) {
            logger.error({ importId: jobId, error: rowErr?.message || String(rowErr) }, '[IMPORT WORKER ROW ERROR]');
            failedCount++;
          } finally {
            processedCount++;
          }
        }

        // Update Job progress in DB
        const currentChunkNum = chunkIdx + 1;
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            processedRecords: processedCount,
            createdRecords: createdCount,
            updatedRecords: updatedCount,
            duplicateRecords: duplicateCount,
            invalidRecords: invalidCount,
            failedRecords: failedCount,
            currentChunk: currentChunkNum,
          },
        });

        // Broadcast SSE IMPORT_PROGRESS
        const percent = Math.min(100, Math.round((processedCount / totalRecords) * 100));
        sseRegistry.broadcastToTenant(tenantId, {
          type: 'IMPORT_PROGRESS',
          entity: 'ImportJob',
          entityId: jobId,
          userId,
          data: {
            importId: jobId,
            totalRecords,
            processed: processedCount,
            created: createdCount,
            updated: updatedCount,
            duplicates: duplicateCount,
            invalid: invalidCount,
            failed: failedCount,
            percent,
            currentChunk: currentChunkNum,
            totalChunks,
          },
        });
      }

      // 4. Complete Job
      const durationMs = Date.now() - startTime;
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      // Audit Log
      await AuditLogService.record(prisma, {
        tenantId,
        userId,
        action: 'IMPORT_COMPLETED',
        entity: 'ImportJob',
        entityId: jobId,
        newData: {
          totalRecords,
          createdRecords: createdCount,
          updatedRecords: updatedCount,
          duplicateRecords: duplicateCount,
          invalidRecords: invalidCount,
          failedRecords: failedCount,
          durationMs,
        },
      });

      // Broadcast SSE IMPORT_COMPLETED
      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_COMPLETED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          total: totalRecords,
          created: createdCount,
          updated: updatedCount,
          duplicates: duplicateCount,
          invalid: invalidCount,
          durationMs,
        },
      });
    } catch (jobErr: any) {
      console.error(`[IMPORT WORKER FATAL] Falha no job [${jobId}]:`, jobErr);
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.FAILED,
          errorMessage: jobErr?.message || 'Erro interno no processamento do lote.',
          completedAt: new Date(),
        },
      }).catch(() => {});

      await AuditLogService.record(prisma, {
        tenantId,
        userId,
        action: 'IMPORT_FAILED',
        entity: 'ImportJob',
        entityId: jobId,
        newData: {
          error: jobErr?.message || 'Erro fatal',
          durationMs: Date.now() - startTime,
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_FAILED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          error: jobErr?.message || 'Erro no processamento da importação.',
        },
      });
    } finally {
      activeCancellationFlags.delete(jobId);
    }
  }

  /**
   * Background runner for Status Updates Bulk Import
   */
  public static async processStatusJob(
    prisma: PrismaClient,
    jobId: string,
    tenantId: string,
    userId: string,
    parsedRows: ImportStatusRow[]
  ): Promise<void> {
    const startTime = Date.now();
    activeCancellationFlags.delete(jobId);

    try {
      const totalRecords = parsedRows.length;
      const totalChunks = Math.ceil(totalRecords / this.CHUNK_SIZE) || 1;

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.PROCESSING,
          startedAt: new Date(),
          totalRecords,
          totalChunks,
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_STARTED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          totalRecords,
          fileName: (await prisma.importJob.findUnique({ where: { id: jobId } }))?.fileName,
        },
      });

      const tenantStatuses = await prisma.proposalStatus.findMany({ where: { tenantId } });

      let updatedCount = 0;
      let invalidCount = 0;
      let failedCount = 0;
      let processedCount = 0;

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        if (this.isCancellationRequested(jobId)) {
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              status: ImportJobStatus.CANCELLED,
              cancelledAt: new Date(),
              processedRecords: processedCount,
              updatedRecords: updatedCount,
              invalidRecords: invalidCount,
              failedRecords: failedCount,
            },
          });
          sseRegistry.broadcastToTenant(tenantId, {
            type: 'IMPORT_CANCELLED',
            entity: 'ImportJob',
            entityId: jobId,
            userId,
            data: { importId: jobId },
          });
          activeCancellationFlags.delete(jobId);
          return;
        }

        const start = chunkIdx * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, totalRecords);
        const chunk = parsedRows.slice(start, end);

        for (const item of chunk) {
          try {
            const cleanAde = String(item.proposalNumberOrAde || '').trim();
            const targetStatusName = String(item.targetStatusName || '').trim();

            if (!cleanAde || !targetStatusName) {
              invalidCount++;
              processedCount++;
              continue;
            }

            const targetStatus = tenantStatuses.find(
              s => s.name.toUpperCase() === targetStatusName.toUpperCase()
            );

            if (!targetStatus) {
              invalidCount++;
              processedCount++;
              continue;
            }

            const proposal = await prisma.proposal.findUnique({
              where: {
                tenantId_proposalNumber: {
                  tenantId,
                  proposalNumber: cleanAde,
                },
              },
            });

            if (!proposal) {
              invalidCount++;
              processedCount++;
              continue;
            }

            if (proposal.statusId !== targetStatus.id) {
              await prisma.proposal.update({
                where: { id: proposal.id },
                data: {
                  statusId: targetStatus.id,
                  version: { increment: 1 },
                },
              });

              await prisma.statusHistory.create({
                data: {
                  tenantId,
                  proposalId: proposal.id,
                  statusId: targetStatus.id,
                  statusName: targetStatus.name,
                  userId,
                  notes: item.observation ? this.sanitizeFormula(item.observation) : 'Atualização em lote via planilha',
                },
              });

              updatedCount++;
            }
          } catch (rowErr) {
            failedCount++;
          } finally {
            processedCount++;
          }
        }

        const currentChunkNum = chunkIdx + 1;
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            processedRecords: processedCount,
            updatedRecords: updatedCount,
            invalidRecords: invalidCount,
            failedRecords: failedCount,
            currentChunk: currentChunkNum,
          },
        });

        const percent = Math.min(100, Math.round((processedCount / totalRecords) * 100));
        sseRegistry.broadcastToTenant(tenantId, {
          type: 'IMPORT_PROGRESS',
          entity: 'ImportJob',
          entityId: jobId,
          userId,
          data: {
            importId: jobId,
            totalRecords,
            processed: processedCount,
            updated: updatedCount,
            invalid: invalidCount,
            failed: failedCount,
            percent,
            currentChunk: currentChunkNum,
            totalChunks,
          },
        });
      }

      const durationMs = Date.now() - startTime;
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await AuditLogService.record(prisma, {
        tenantId,
        userId,
        action: 'IMPORT_COMPLETED',
        entity: 'ImportJob',
        entityId: jobId,
        newData: {
          type: 'STATUS_UPDATE',
          totalRecords,
          updatedRecords: updatedCount,
          invalidRecords: invalidCount,
          failedRecords: failedCount,
          durationMs,
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_COMPLETED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          total: totalRecords,
          updated: updatedCount,
          invalid: invalidCount,
          durationMs,
        },
      });
    } catch (jobErr: any) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.FAILED,
          errorMessage: jobErr?.message || 'Erro ao processar atualização de status.',
          completedAt: new Date(),
        },
      }).catch(() => {});

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_FAILED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          error: jobErr?.message || 'Erro no processamento da planilha.',
        },
      });
    } finally {
      activeCancellationFlags.delete(jobId);
    }
  }

  /**
   * Background runner for Partners Bulk Import
   */
  public static async processPartnersJob(
    prisma: PrismaClient,
    jobId: string,
    tenantId: string,
    userId: string,
    parsedRows: ImportPartnerRow[]
  ): Promise<void> {
    const startTime = Date.now();
    activeCancellationFlags.delete(jobId);

    try {
      const totalRecords = parsedRows.length;
      const totalChunks = Math.ceil(totalRecords / this.CHUNK_SIZE) || 1;

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.PROCESSING,
          startedAt: new Date(),
          totalRecords,
          totalChunks,
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_STARTED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          totalRecords,
          fileName: (await prisma.importJob.findUnique({ where: { id: jobId } }))?.fileName,
        },
      });

      const promoters = await prisma.promoter.findMany({ where: { tenantId } });

      let createdCount = 0;
      let updatedCount = 0;
      let invalidCount = 0;
      let failedCount = 0;
      let processedCount = 0;

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        if (this.isCancellationRequested(jobId)) {
          await prisma.importJob.update({
            where: { id: jobId },
            data: {
              status: ImportJobStatus.CANCELLED,
              cancelledAt: new Date(),
              processedRecords: processedCount,
              createdRecords: createdCount,
              updatedRecords: updatedCount,
              invalidRecords: invalidCount,
              failedRecords: failedCount,
            },
          });
          sseRegistry.broadcastToTenant(tenantId, {
            type: 'IMPORT_CANCELLED',
            entity: 'ImportJob',
            entityId: jobId,
            userId,
            data: { importId: jobId },
          });
          activeCancellationFlags.delete(jobId);
          return;
        }

        const start = chunkIdx * this.CHUNK_SIZE;
        const end = Math.min(start + this.CHUNK_SIZE, totalRecords);
        const chunk = parsedRows.slice(start, end);

        for (const item of chunk) {
          try {
            const cleanName = String(item.name || '').trim();
            const cleanCode = String(item.code || cleanName).trim().toUpperCase();

            if (!cleanName || !cleanCode) {
              invalidCount++;
              processedCount++;
              continue;
            }

            let promoterId: string | null = null;
            if (item.promoterName) {
              const pUpper = item.promoterName.toUpperCase();
              const foundP = promoters.find(p => p.name.toUpperCase() === pUpper || pUpper.includes(p.name.toUpperCase()));
              if (foundP) promoterId = foundP.id;
            }

            const existingPartner = await prisma.partner.findUnique({
              where: {
                tenantId_code: {
                  tenantId,
                  code: cleanCode,
                },
              },
            });

            if (existingPartner) {
              await prisma.partner.update({
                where: { id: existingPartner.id },
                data: {
                  name: this.sanitizeFormula(cleanName),
                  promoterId: promoterId || existingPartner.promoterId,
                  email: item.email ? this.sanitizeFormula(item.email) : existingPartner.email,
                  phone: item.phone ? this.sanitizeFormula(item.phone) : existingPartner.phone,
                  status: item.active === false ? 'INATIVO' : 'ATIVO',
                },
              });
              updatedCount++;
            } else {
              await prisma.partner.create({
                data: {
                  tenantId,
                  name: this.sanitizeFormula(cleanName),
                  code: cleanCode,
                  promoterId: promoterId || undefined,
                  email: item.email ? this.sanitizeFormula(item.email) : undefined,
                  phone: item.phone ? this.sanitizeFormula(item.phone) : undefined,
                  status: item.active === false ? 'INATIVO' : 'ATIVO',
                },
              });
              createdCount++;
            }
          } catch (rowErr) {
            failedCount++;
          } finally {
            processedCount++;
          }
        }

        const currentChunkNum = chunkIdx + 1;
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            processedRecords: processedCount,
            createdRecords: createdCount,
            updatedRecords: updatedCount,
            invalidRecords: invalidCount,
            failedRecords: failedCount,
            currentChunk: currentChunkNum,
          },
        });

        const percent = Math.min(100, Math.round((processedCount / totalRecords) * 100));
        sseRegistry.broadcastToTenant(tenantId, {
          type: 'IMPORT_PROGRESS',
          entity: 'ImportJob',
          entityId: jobId,
          userId,
          data: {
            importId: jobId,
            totalRecords,
            processed: processedCount,
            created: createdCount,
            updated: updatedCount,
            invalid: invalidCount,
            failed: failedCount,
            percent,
            currentChunk: currentChunkNum,
            totalChunks,
          },
        });
      }

      const durationMs = Date.now() - startTime;
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_COMPLETED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          total: totalRecords,
          created: createdCount,
          updated: updatedCount,
          invalid: invalidCount,
          durationMs,
        },
      });
    } catch (jobErr: any) {
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.FAILED,
          errorMessage: jobErr?.message || 'Erro ao processar importação de parceiros.',
          completedAt: new Date(),
        },
      }).catch(() => {});

      sseRegistry.broadcastToTenant(tenantId, {
        type: 'IMPORT_FAILED',
        entity: 'ImportJob',
        entityId: jobId,
        userId,
        data: {
          importId: jobId,
          error: jobErr?.message || 'Erro no processamento da planilha.',
        },
      });
    } finally {
      activeCancellationFlags.delete(jobId);
    }
  }
}
