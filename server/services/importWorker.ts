import { Prisma, PrismaClient, ImportJobStatus, ImportJobType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { sseRegistry } from '../realtime.js';
import { logger } from '../logger';
import { AuditLogService } from './auditLogService.js';
import { extractPartnerCode, isValidCpf } from '../../src/lib/utils.js';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './passwordService.js';
import { ImportedAccess, sealImportCredentials, openImportCredentials } from './partnerImportCredentials.js';

export interface ImportProposalRow {
  sourceLine?: number;
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
  sourceLine?: number;
  disbursedValue?: number;
  contractBalance?: number;
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

  private static async isCancellationRequestedPersisted(prisma: PrismaClient, jobId: string): Promise<boolean> {
    if (this.isCancellationRequested(jobId)) return true;
    const job = await prisma.importJob.findUnique({
      where: { id: jobId },
      select: { status: true, metadata: true },
    });
    if (!job || job.status === ImportJobStatus.CANCELLED) return true;
    const metadata = job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata)
      ? job.metadata as Record<string, unknown>
      : {};
    return metadata.cancellationRequested === true;
  }

  private static async finalizeCancellation(
    prisma: PrismaClient,
    jobId: string,
    tenantId: string,
    userId: string
  ): Promise<boolean> {
    if (!await this.isCancellationRequestedPersisted(prisma, jobId)) return false;
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: ImportJobStatus.CANCELLED, cancelledAt: new Date(), completedAt: new Date() },
    });
    sseRegistry.broadcastToTenant(tenantId, {
      type: 'IMPORT_CANCELLED',
      entity: 'ImportJob',
      entityId: jobId,
      userId,
      data: { importId: jobId },
    });
    activeCancellationFlags.delete(jobId);
    return true;
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

  private static parseCsvContent(content: string): string[][] {
    const text = content.replace(/^\uFEFF/, '');
    const firstRecord = text.split(/\r?\n/, 1)[0] || '';
    const delimiters = [',', ';', '\t'];
    let delimiter = ',';
    let maxCount = -1;
    for (const candidate of delimiters) {
      let count = 0;
      let quoted = false;
      for (let i = 0; i < firstRecord.length; i++) {
        if (firstRecord[i] === '"') {
          if (quoted && firstRecord[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (!quoted && firstRecord[i] === candidate) {
          count++;
        }
      }
      if (count > maxCount) {
        maxCount = count;
        delimiter = candidate;
      }
    }

    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"' && cell.trim().length === 0) {
        cell = '';
        quoted = true;
      } else if (char === delimiter) {
        row.push(cell.trim());
        cell = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(cell.trim());
        if (row.some(value => value.length > 0)) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
    }
    if (quoted) throw new Error('O arquivo CSV contém um campo com aspas não finalizadas.');
    return rows;
  }

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
      const rows = ImportWorkerService.parseCsvContent(content);
      if (rows.length > ImportWorkerService.MAX_IMPORT_ROWS) {
        throw new Error(`O arquivo excede o limite máximo permitido de ${ImportWorkerService.MAX_IMPORT_ROWS.toLocaleString('pt-BR')} registros para importação.`);
      }
      return rows;
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
      if (await this.isCancellationRequestedPersisted(prisma, jobId)) return;
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
        prisma.product.findMany({ where: { OR: [{ tenantId }, { tenantId: null }] } }),
        prisma.proposalStatus.findFirst({ where: { tenantId, standardCategory: 'ESTEIRA' } }),
      ]);

      let createdCount = 0;
      let updatedCount = 0;
      let duplicateCount = 0;
      let invalidCount = 0;
      let failedCount = 0;
      let processedCount = 0;
      const rowErrors: Array<{ line: number; identifier: string; message: string }> = [];
      const addRowError = (line: number, identifier: string, message: string) => {
        if (rowErrors.length < 500) rowErrors.push({ line, identifier, message });
      };

      // 3. Process in Chunks
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        // Check for cancellation token before each chunk
        if (await this.isCancellationRequestedPersisted(prisma, jobId)) {
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
        for (let rowOffset = 0; rowOffset < chunk.length; rowOffset++) {
          const item = chunk[rowOffset];
          const sourceLine = Number(item.sourceLine) || start + rowOffset + 2;
          const identifier = String(item.proposalNumber || item.cpf || `LINHA_${sourceLine}`);
          try {
            const cleanCpf = this.normalizeCpf(item.cpf);
            const cleanAde = String(item.proposalNumber || '').trim();

            if (!isValidCpf(cleanCpf)) {
              invalidCount++;
              addRowError(sourceLine, identifier, 'CPF inválido ou não informado. Confira os 11 dígitos e os dígitos verificadores.');
              continue;
            }
            if (!cleanAde) {
              invalidCount++;
              addRowError(sourceLine, identifier, 'Número da proposta/ADE não informado.');
              continue;
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
              const partnerCode = extractPartnerCode(partClean).toUpperCase();
              const foundPart = partners.find(p => p.code.toUpperCase() === partClean) ||
                partners.find(p => p.code.toUpperCase() === partnerCode) ||
                partners.find(p => p.name.toUpperCase() === partClean);
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

            const disbursedVal = item.disbursedValue === undefined ? 0 : Number(item.disbursedValue);
            const contractBal = item.contractBalance === undefined ? disbursedVal : Number(item.contractBalance);
            const maxProposalAmount = 9_999_999_999.99; // Prisma Decimal(12, 2)
            if (!Number.isFinite(disbursedVal) || disbursedVal < 0 || disbursedVal > maxProposalAmount ||
                !Number.isFinite(contractBal) || contractBal < 0 || contractBal > maxProposalAmount) {
              invalidCount++;
              addRowError(sourceLine, identifier, 'Valor liberado ou saldo do contrato inválido. Informe valores entre 0 e R$ 9.999.999.999,99.');
              continue;
            }

            if (!partnerId || !productId || !bankId || !promoterId) {
              invalidCount++;
              const missingCatalogs = [
                !partnerId ? 'parceiro' : null,
                !productId ? 'produto' : null,
                !bankId ? 'banco' : null,
                !promoterId ? 'promotora' : null,
              ].filter(Boolean).join(', ');
              addRowError(sourceLine, identifier, `Não foi possível associar ${missingCatalogs} cadastrado(s) nesta empresa.`);
              continue;
            }

            // Check if proposal already exists in DB for this tenant
            const existingProposal = await prisma.proposal.findFirst({
              where: {
                tenantId,
                proposalNumber: { equals: cleanAde, mode: 'insensitive' },
              },
              include: { client: { select: { cpf: true } } },
            });

            if (existingProposal) {
              if (existingProposal.deletedAt) {
                invalidCount++;
                addRowError(sourceLine, identifier, 'A ADE pertence a uma proposta arquivada. Restaure a proposta antes de importar atualizações.');
                continue;
              }
              if (this.normalizeCpf(existingProposal.client?.cpf) !== cleanCpf) {
                invalidCount++;
                addRowError(sourceLine, identifier, 'A ADE já existe vinculada a outro CPF. Confira o arquivo antes de atualizar os valores.');
                continue;
              }

              // Compare financials for legitimate updates
              const hasDisbursedValue = item.disbursedValue !== undefined;
              const hasContractBalance = item.contractBalance !== undefined;
              const releasedDiff = hasDisbursedValue && Math.abs(disbursedVal - Number(existingProposal.releasedValue || 0)) > 0.01;
              const existingBalance = Number(existingProposal.debtBalance ?? existingProposal.contractValue ?? 0);
              const contractDiff = hasContractBalance && Math.abs(contractBal - existingBalance) > 0.01;

              if (releasedDiff || contractDiff) {
                await prisma.proposal.update({
                  where: { id: existingProposal.id },
                  data: {
                    releasedValue: hasDisbursedValue ? disbursedVal : existingProposal.releasedValue,
                    contractValue: hasContractBalance ? contractBal : existingProposal.contractValue,
                    debtBalance: hasContractBalance ? contractBal : existingProposal.debtBalance,
                    version: { increment: 1 },
                  },
                });
                updatedCount++;
              } else {
                duplicateCount++;
              }
            } else {
              // Create new proposal
              await prisma.$transaction(async (tx) => {
                const client = await tx.client.upsert({
                  where: { tenantId_cpf: { tenantId, cpf: cleanCpf } },
                  update: {},
                  create: {
                    tenantId,
                    cpf: cleanCpf,
                    fullName: this.sanitizeFormula(item.fullName || `Cliente ${cleanCpf}`),
                  },
                });
                const newProp = await tx.proposal.create({
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

                await tx.aDE.create({
                  data: {
                    tenantId,
                    proposalId: newProp.id,
                    adeNumber: cleanAde,
                    value: disbursedVal,
                    installments: item.installments || 1,
                  },
                });
              });

              createdCount++;
            }
          } catch (rowErr: any) {
            logger.error({ importId: jobId, error: rowErr?.message || String(rowErr) }, '[IMPORT WORKER ROW ERROR]');
            failedCount++;
            addRowError(sourceLine, identifier, rowErr?.message || 'Erro inesperado ao processar o registro.');
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
      if (await this.finalizeCancellation(prisma, jobId, tenantId, userId)) return;
      const durationMs = Date.now() - startTime;
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          completedAt: new Date(),
          metadata: {
            rowErrors,
            rowErrorsTruncated: Math.max(0, invalidCount + failedCount - rowErrors.length),
          },
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
          processed: processedCount,
          created: createdCount,
          updated: updatedCount,
          duplicates: duplicateCount,
          invalid: invalidCount,
          failed: failedCount,
          rowErrors,
          rowErrorsTruncated: Math.max(0, invalidCount + failedCount - rowErrors.length),
          durationMs,
        },
      });

      // The UI reloads these tenant-scoped lists after a completed background import.
      if (createdCount > 0 || updatedCount > 0) {
        sseRegistry.broadcastToTenant(tenantId, {
          type: createdCount > 0 ? 'PROPOSAL_CREATED' : 'PROPOSAL_UPDATED',
          entity: 'Proposal',
          entityId: `import-${jobId}`,
          userId,
        });
      }
      if (createdCount > 0) {
        sseRegistry.broadcastToTenant(tenantId, {
          type: 'CLIENT_CREATED',
          entity: 'Client',
          entityId: `import-${jobId}`,
          userId,
        });
      }
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
      if (await this.isCancellationRequestedPersisted(prisma, jobId)) return;
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
      const rowErrors: Array<{ line: number; identifier: string; message: string }> = [];
      const addRowError = (line: number, identifier: string, message: string) => {
        if (rowErrors.length < 500) rowErrors.push({ line, identifier, message });
      };

      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        if (await this.isCancellationRequestedPersisted(prisma, jobId)) {
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

        for (let rowOffset = 0; rowOffset < chunk.length; rowOffset++) {
          const item = chunk[rowOffset];
          const sourceLine = Number(item.sourceLine) || start + rowOffset + 2;
          const cleanAde = String(item.proposalNumberOrAde || '').trim();
          const identifier = cleanAde || `LINHA_${sourceLine}`;
          try {
            const targetStatusName = String(item.targetStatusName || '').trim();

            if (!cleanAde || !targetStatusName) {
              invalidCount++;
              addRowError(sourceLine, identifier, !cleanAde ? 'Número da proposta/ADE não informado.' : 'Status de destino não informado ou mapeado.');
              continue;
            }

            const targetStatus = tenantStatuses.find(
              s => s.name.toUpperCase() === targetStatusName.toUpperCase()
            );

            if (!targetStatus) {
              invalidCount++;
              addRowError(sourceLine, identifier, `Status "${targetStatusName}" não encontrado nesta empresa.`);
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
              addRowError(sourceLine, identifier, 'Proposta não encontrada nesta empresa.');
              continue;
            }

            const disbursedValue = item.disbursedValue === undefined ? undefined : Number(item.disbursedValue);
            const contractBalance = item.contractBalance === undefined ? undefined : Number(item.contractBalance);
            if ((disbursedValue !== undefined && (!Number.isFinite(disbursedValue) || disbursedValue < 0)) ||
                (contractBalance !== undefined && (!Number.isFinite(contractBalance) || contractBalance < 0))) {
              invalidCount++;
              addRowError(sourceLine, identifier, 'Valor liberado ou saldo inválido. Informe valores numéricos não negativos.');
              continue;
            }

            const statusChanged = proposal.statusId !== targetStatus.id;
            const releasedValueChanged = disbursedValue !== undefined && Number(proposal.releasedValue) !== disbursedValue;
            const debtBalanceChanged = contractBalance !== undefined && Number(proposal.debtBalance ?? 0) !== contractBalance;
            if (!statusChanged && !releasedValueChanged && !debtBalanceChanged) continue;

            await prisma.$transaction(async (tx) => {
              await tx.proposal.update({
                where: { id: proposal.id },
                data: {
                  ...(statusChanged ? { statusId: targetStatus.id } : {}),
                  ...(disbursedValue !== undefined ? { releasedValue: disbursedValue } : {}),
                  ...(contractBalance !== undefined ? { debtBalance: contractBalance } : {}),
                  version: { increment: 1 },
                },
              });

              if (statusChanged) {
                await tx.statusHistory.create({
                  data: {
                    tenantId,
                    proposalId: proposal.id,
                    statusId: targetStatus.id,
                    statusName: targetStatus.name,
                    userId,
                    notes: item.observation ? this.sanitizeFormula(item.observation) : 'Atualização em lote via planilha',
                  },
                });
              }
            });
            updatedCount++;
          } catch (rowErr) {
            failedCount++;
            addRowError(sourceLine, identifier, 'Falha inesperada ao atualizar a proposta.');
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

      if (await this.finalizeCancellation(prisma, jobId, tenantId, userId)) return;
      const durationMs = Date.now() - startTime;
      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.COMPLETED,
          completedAt: new Date(),
          metadata: {
            rowErrors,
            rowErrorsTruncated: Math.max(0, invalidCount + failedCount - rowErrors.length),
          },
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
          failed: failedCount,
          rowErrors,
          rowErrorsTruncated: Math.max(0, invalidCount + failedCount - rowErrors.length),
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
    parsedRows: ImportPartnerRow[],
    options: { resume?: boolean; maxRecords?: number; maxDurationMs?: number } = {}
  ): Promise<void> {
    const startTime = Date.now();
    const credentials: ImportedAccess[] = [];
    activeCancellationFlags.delete(jobId);

    try {
      if (await this.isCancellationRequestedPersisted(prisma, jobId)) return;
      const previous = options.resume ? await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } }) : null;
      if (previous && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(previous.status)) return;
      const previousMetadata = previous?.metadata as Record<string, any> | null;
      if (previousMetadata?.credentials) credentials.push(...openImportCredentials(previousMetadata.credentials));
      const totalRecords = parsedRows.length;
      const totalChunks = Math.ceil(totalRecords / this.CHUNK_SIZE) || 1;

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportJobStatus.PROCESSING,
          startedAt: previous?.startedAt || new Date(),
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

      let createdCount = previous?.createdRecords || 0;
      let updatedCount = previous?.updatedRecords || 0;
      let invalidCount = previous?.invalidRecords || 0;
      let failedCount = previous?.failedRecords || 0;
      let processedCount = previous?.processedRecords || 0;
      const initialOffset = processedCount;
      const runRows = parsedRows.slice(initialOffset, initialOffset + (options.maxRecords || parsedRows.length));
      const runChunks = Math.ceil(runRows.length / this.CHUNK_SIZE);

      for (let chunkIdx = 0; chunkIdx < runChunks; chunkIdx++) {
        if (await this.isCancellationRequestedPersisted(prisma, jobId)) {
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
        const end = Math.min(start + this.CHUNK_SIZE, runRows.length);
        const chunk = runRows.slice(start, end);

        for (const item of chunk) {
          if (options.maxDurationMs && processedCount > initialOffset && Date.now() - startTime >= options.maxDurationMs) return;
          if (await this.finalizeCancellation(prisma, jobId, tenantId, userId)) return;
          let committed = false;
          try {
            const cleanName = String(item.name || '').trim();
            const cleanCode = String(item.code || cleanName).trim().toUpperCase();
            const email = String(item.email || '').trim().toLowerCase();

            if (!cleanName || !cleanCode || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
              invalidCount++;
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

            const existingAccess = await prisma.partnerPortalAccess.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } } });
            if (existingAccess && existingAccess.partnerId !== existingPartner?.id) { invalidCount++; continue; }
            const restorePartner = Boolean(existingPartner?.deletedAt);
            const password = existingAccess && !restorePartner ? '' : `Sc!${randomBytes(12).toString('base64url')}`;
            const passwordHash = password ? await hashPassword(password) : null;
            const resultRow = { name: cleanName, code: cleanCode, email, password, status: password ? 'Novo acesso; trocar senha no primeiro login' : 'Acesso existente; senha preservada' };
            await prisma.$transaction(async tx => {
            let partner;
            if (existingPartner) {
              partner = await tx.partner.update({
                where: { id: existingPartner.id },
                data: {
                  name: this.sanitizeFormula(cleanName),
                  promoterId: promoterId || existingPartner.promoterId,
                  deletedAt: null,
                  email,
                  phone: item.phone ? this.sanitizeFormula(item.phone) : existingPartner.phone,
                  status: item.active === false ? 'INATIVO' : 'ATIVO',
                },
              });
            } else {
              partner = await tx.partner.create({
                data: {
                  tenantId,
                  name: this.sanitizeFormula(cleanName),
                  code: cleanCode,
                  promoterId: promoterId || undefined,
                  email,
                  phone: item.phone ? this.sanitizeFormula(item.phone) : undefined,
                  status: item.active === false ? 'INATIVO' : 'ATIVO',
                },
              });
            }
            if (passwordHash) {
              if (existingAccess) {
                await tx.partnerPortalAccess.update({ where: { id: existingAccess.id }, data: { name: cleanName, passwordHash, mustChangePassword: true, active: item.active !== false } });
                await tx.partnerPortalSession.deleteMany({ where: { partnerPortalAccessId: existingAccess.id } });
              } else await tx.partnerPortalAccess.create({ data: { tenantId, partnerId: partner.id, name: cleanName, email, passwordHash, mustChangePassword: true, active: item.active !== false } });
            }
            const job = await tx.importJob.findUniqueOrThrow({ where: { id: jobId }, select: { metadata: true } });
            const metadata = job.metadata && typeof job.metadata === 'object' && !Array.isArray(job.metadata) ? job.metadata : {};
            // Cursor, counters, credentials and partner/access mutations commit together.
            const progressCommit = await tx.importJob.updateMany({ where: {
              id: jobId, processedRecords: processedCount, status: { in: ['QUEUED', 'PROCESSING'] },
              metadata: { equals: job.metadata === null ? Prisma.DbNull : job.metadata as Prisma.InputJsonValue },
            }, data: {
              processedRecords: processedCount + 1, createdRecords: createdCount + (existingPartner ? 0 : 1),
              updatedRecords: updatedCount + (existingPartner ? 1 : 0), invalidRecords: invalidCount, failedRecords: failedCount,
              metadata: { ...metadata, credentials: sealImportCredentials([...credentials, resultRow]), credentialsExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }
            } });
            if (progressCommit.count !== 1) throw new Error('O estado da importação mudou durante esta linha.');
            }, { timeout: 15000 });
            committed = true;
            credentials.push(resultRow);
            if (existingPartner) updatedCount++; else createdCount++;
          } catch (rowErr) {
            failedCount++;
          } finally {
            processedCount++;
            // Publish committed row progress immediately, even for batches smaller than 500.
            if (!committed) await prisma.importJob.update({ where: { id: jobId }, data: {
              processedRecords: processedCount, createdRecords: createdCount,
              updatedRecords: updatedCount, invalidRecords: invalidCount, failedRecords: failedCount,
            } });
            sseRegistry.broadcastToTenant(tenantId, { type: 'IMPORT_PROGRESS', entity: 'ImportJob', entityId: jobId, userId,
              data: { importId: jobId, totalRecords, processed: processedCount, created: createdCount, updated: updatedCount, invalid: invalidCount, failed: failedCount,
                percent: Math.min(100, Math.round(processedCount / totalRecords * 100)) } });
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

      if (processedCount < totalRecords) return;
      if (await this.finalizeCancellation(prisma, jobId, tenantId, userId)) return;
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
