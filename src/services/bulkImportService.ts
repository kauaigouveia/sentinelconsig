/**
 * Bulk Import & Batch Processing Service for Sentinel Consig SaaS
 * Supports processing up to 20,000+ records with chunks, transactions, deduplication,
 * progress reporting, and error resilience.
 */

import { StorageService } from './storageService';
import { Proposal } from '../types';

export interface BulkImportProgress {
  total: number;
  processed: number;
  updated: number;
  created: number;
  duplicates: number;
  invalid: number;
  percent: number;
  currentChunk: number;
  totalChunks: number;
  errors: Array<{ line: number; identifier: string; message: string }>;
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
}

export interface BulkImportRecord {
  cpf: string;
  clientName: string;
  proposalNumber: string;
  releasedValue?: number;
  contractValue?: number;
  installmentValue?: number;
  installmentsCount?: number;
  bankName?: string;
  promoterName?: string;
  partnerCode?: string;
  productName?: string;
  statusName?: string;
  adeNumber?: string;
}

export class BulkImportService {
  private static CHUNK_SIZE = 250; // Optimized batch chunking

  /**
   * Process a large collection of proposal records in chunked transactions
   */
  public static async processBulkBatch(
    records: BulkImportRecord[],
    tenantId: string,
    onProgress?: (progress: BulkImportProgress) => void
  ): Promise<BulkImportProgress> {
    const total = records.length;
    const totalChunks = Math.ceil(total / this.CHUNK_SIZE);
    
    const progress: BulkImportProgress = {
      total,
      processed: 0,
      updated: 0,
      created: 0,
      duplicates: 0,
      invalid: 0,
      percent: 0,
      currentChunk: 0,
      totalChunks,
      errors: [],
      status: 'PROCESSING',
    };

    const existingProposals = StorageService.getProposals();
    const proposalMap = new Map<string, Proposal>();
    existingProposals.forEach(p => {
      proposalMap.set(p.proposalNumber.trim().toUpperCase(), p);
    });

    const existingClients = StorageService.getClients();
    const clientMap = new Map<string, string>(); // CPF -> ClientId
    existingClients.forEach(c => {
      clientMap.set(c.cpf.replace(/\D/g, ''), c.id);
    });

    const banks = StorageService.getBanks();
    const promoters = StorageService.getPromoters();
    const partners = StorageService.getPartners();
    const products = StorageService.getProducts();
    const statuses = StorageService.getStatuses();

    const defaultBankId = banks[0]?.id || 'bank-default';
    const defaultPromoterId = promoters[0]?.id || 'promoter-default';
    const defaultPartnerId = partners[0]?.id || 'partner-default';
    const defaultProductId = products[0]?.id || 'prod-default';
    const defaultStatusId = statuses[0]?.id || 'status-default';

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      progress.currentChunk = chunkIdx + 1;
      const start = chunkIdx * this.CHUNK_SIZE;
      const chunk = records.slice(start, start + this.CHUNK_SIZE);

      // Process chunk
      for (let i = 0; i < chunk.length; i++) {
        const line = start + i + 1;
        const item = chunk[i];

        try {
          const rawCpf = (item.cpf || '').replace(/\D/g, '');
          const propNum = (item.proposalNumber || '').trim().toUpperCase();

          if (!rawCpf || rawCpf.length !== 11) {
            progress.invalid++;
            progress.errors.push({
              line,
              identifier: item.proposalNumber || 'SEM_NUMERO',
              message: 'CPF inválido ou não informado (deve conter 11 dígitos).',
            });
            continue;
          }

          if (!propNum) {
            progress.invalid++;
            progress.errors.push({
              line,
              identifier: rawCpf,
              message: 'Número da proposta não fornecido.',
            });
            continue;
          }

          // 1. Get or Create Client
          let clientId = clientMap.get(rawCpf);
          if (!clientId) {
            const newClient = StorageService.getOrCreateClient({
              cpf: rawCpf,
              fullName: (item.clientName || 'CLIENTE IMPORTADO').trim().toUpperCase(),
            });
            clientId = newClient.id;
            clientMap.set(rawCpf, clientId);
          }

          // 2. Check for existing proposal
          const existingProp = proposalMap.get(propNum);
          if (existingProp) {
            // Update existing
            StorageService.updateProposal(existingProp.id, {
              disbursedValue: item.releasedValue !== undefined ? item.releasedValue : existingProp.disbursedValue,
              contractBalance: item.contractValue !== undefined ? item.contractValue : existingProp.contractBalance,
            });
            progress.updated++;
          } else {
            // Create new proposal
            const created = StorageService.createProposal({
              proposalNumber: propNum,
              clientId,
              productId: defaultProductId,
              bankId: defaultBankId,
              promoterId: defaultPromoterId,
              partnerId: defaultPartnerId,
              statusId: defaultStatusId,
              disbursedValue: item.releasedValue || 0,
              contractBalance: item.contractValue || 0,
            });
            proposalMap.set(propNum, created);
            progress.created++;
          }
        } catch (err: any) {
          progress.invalid++;
          progress.errors.push({
            line,
            identifier: item.proposalNumber || `LINHA_${line}`,
            message: err.message || 'Erro inesperado no processamento do registro.',
          });
        }

        progress.processed++;
      }

      progress.percent = Math.round((progress.processed / total) * 100);
      if (onProgress) {
        onProgress({ ...progress });
      }

      // Small tick delay between chunks to yield event loop
      if (chunkIdx < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }

    progress.status = 'COMPLETED';
    if (onProgress) {
      onProgress({ ...progress });
    }

    // Log bulk import action to audit
    StorageService.addAuditLog({
      action: 'PROPOSALS_BULK_IMPORT',
      entity: 'Proposal',
      entityId: `batch_${Date.now()}`,
      newData: JSON.stringify({
        total,
        created: progress.created,
        updated: progress.updated,
        invalid: progress.invalid,
        tenantId,
      }),
    });

    return progress;
  }

  /**
   * Batch update status for multiple selected proposals with transaction logging
   */
  public static async bulkUpdateStatus(
    proposalIds: string[],
    newStatusId: string,
    notes?: string
  ): Promise<{ successCount: number; failedCount: number }> {
    let successCount = 0;
    let failedCount = 0;

    const statuses = StorageService.getStatuses();
    const targetStatus = statuses.find(s => s.id === newStatusId);
    if (!targetStatus) {
      throw new Error(`Status ID ${newStatusId} não encontrado.`);
    }

    for (const id of proposalIds) {
      try {
        StorageService.updateProposalStatus(id, newStatusId, notes);
        successCount++;
      } catch (e) {
        failedCount++;
      }
    }

    StorageService.addAuditLog({
      action: 'PROPOSALS_BULK_STATUS_CHANGE',
      entity: 'Proposal',
      entityId: `batch_status_${Date.now()}`,
      newData: JSON.stringify({
        proposalCount: proposalIds.length,
        successCount,
        failedCount,
        newStatusName: targetStatus.name,
      }),
    });

    return { successCount, failedCount };
  }
}

