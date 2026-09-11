import { DatabaseBackupSnapshot, BackupScheduleConfig, SystemConfig } from '../types';
import { StorageService } from './storageService';

const BACKUP_STORAGE_KEY = 'cg_backup_snapshots';

export const DEFAULT_BACKUP_SCHEDULE: BackupScheduleConfig = {
  enabled: true,
  intervalHours: 6, // Default: every 6 hours
  lastRunAt: null,
  nextRunAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
  maxSnapshotsToKeep: 15,
  autoDownload: false,
};

export class BackupService {
  /**
   * Generates a complete dump object of all system tables
   */
  public static generateFullDatabaseDump(): Record<string, any> {
    const activeUser = StorageService.getActiveUser();
    
    return {
      metadata: {
        system: StorageService.getWhiteLabel().companyName,
        version: '2.4.0',
        exportedAt: new Date().toISOString(),
        exportedBy: activeUser ? `${activeUser.name} (${activeUser.email})` : 'Sistema Cron',
      },
      users: StorageService.getUsers(),
      promoters: StorageService.getPromoters(),
      banks: StorageService.getBanks(),
      bankPromoters: StorageService.getBankPromoters(),
      partners: StorageService.getPartners(),
      products: StorageService.getProducts(),
      clients: StorageService.getClients(),
      statuses: StorageService.getStatuses(),
      proposals: StorageService.getProposals(),
      proposalRelations: StorageService.getProposalRelations(),
      history: StorageService.getHistory(),
      comments: StorageService.getComments(),
      pendings: StorageService.getPendings(),
      holidays: StorageService.getHolidays(),
      notifications: StorageService.getNotifications(),
      auditLogs: StorageService.getAuditLogs(),
      exportLogs: StorageService.getExportLogs(),
      config: StorageService.getConfig(),
    };
  }

  /**
   * Retrieves all saved snapshots
   */
  public static getSnapshots(): DatabaseBackupSnapshot[] {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
      if (!raw) return [];
      const list: DatabaseBackupSnapshot[] = JSON.parse(raw);
      return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e) {
      console.error('Erro ao ler snapshots de backup:', e);
      return [];
    }
  }

  /**
   * Saves a list of snapshots
   */
  private static saveSnapshots(snapshots: DatabaseBackupSnapshot[]): void {
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(snapshots));
  }

  /**
   * Retrieves current backup schedule configuration
   */
  public static getScheduleConfig(): BackupScheduleConfig {
    const config = StorageService.getConfig();
    return config.backupSchedule || DEFAULT_BACKUP_SCHEDULE;
  }

  /**
   * Updates backup schedule configuration
   */
  public static updateScheduleConfig(schedule: Partial<BackupScheduleConfig>): BackupScheduleConfig {
    const config = StorageService.getConfig();
    const current = config.backupSchedule || DEFAULT_BACKUP_SCHEDULE;
    const updated: BackupScheduleConfig = {
      ...current,
      ...schedule,
    };

    // Calculate next run if interval changed or enabled
    if (schedule.intervalHours || schedule.enabled) {
      const now = Date.now();
      const intervalMs = (updated.intervalHours || 6) * 3600 * 1000;
      updated.nextRunAt = new Date(now + intervalMs).toISOString();
    }

    StorageService.updateConfig({
      ...config,
      backupSchedule: updated,
    });

    StorageService.addAuditLog({
      action: 'CONFIGURAR_CRON_BACKUP',
      entity: 'SystemConfig',
      entityId: 'backupSchedule',
      newData: JSON.stringify(updated),
    });

    return updated;
  }

  /**
   * Creates a backup snapshot, saves it to history, and handles rotation
   */
  public static createBackupSnapshot(
    type: 'AUTOMATICO_CRON' | 'MANUAL' = 'MANUAL',
    note?: string
  ): DatabaseBackupSnapshot {
    const dump = this.generateFullDatabaseDump();
    const jsonString = JSON.stringify(dump);
    const sizeBytes = new Blob([jsonString]).size;
    const now = new Date();
    
    const timestampStr = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .split('.')[0];
    const fileName = `evolve_backup_${type.toLowerCase()}_${timestampStr}.json`;

    const activeUser = StorageService.getActiveUser();

    const snapshot: DatabaseBackupSnapshot = {
      id: `bkp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: now.toISOString(),
      type,
      fileName,
      fileSizeBytes: sizeBytes,
      stats: {
        proposalsCount: dump.proposals?.length || 0,
        clientsCount: dump.clients?.length || 0,
        partnersCount: dump.partners?.length || 0,
        banksCount: dump.banks?.length || 0,
        historyCount: dump.history?.length || 0,
        pendingsCount: dump.pendings?.length || 0,
        usersCount: dump.users?.length || 0,
      },
      dataDump: dump,
      createdByUserName: type === 'AUTOMATICO_CRON' ? 'Serviço Cron Automático' : activeUser.name,
      note: note || (type === 'AUTOMATICO_CRON' ? 'Backup automático agendado por rotina cron' : 'Backup manual executado pelo operador'),
    };

    // Save and rotate snapshots
    const schedule = this.getScheduleConfig();
    const maxKeep = schedule.maxSnapshotsToKeep || 15;
    const currentSnapshots = this.getSnapshots();
    
    const updatedSnapshots = [snapshot, ...currentSnapshots].slice(0, maxKeep);
    this.saveSnapshots(updatedSnapshots);

    // Update schedule last run & next run
    const intervalMs = (schedule.intervalHours || 6) * 3600 * 1000;
    this.updateScheduleConfig({
      ...schedule,
      lastRunAt: now.toISOString(),
      nextRunAt: new Date(now.getTime() + intervalMs).toISOString(),
    });

    // Audit log
    StorageService.addAuditLog({
      action: type === 'AUTOMATICO_CRON' ? 'BACKUP_AUTOMATICO_CRON' : 'BACKUP_MANUAL',
      entity: 'DatabaseBackup',
      entityId: snapshot.id,
      newData: JSON.stringify({
        fileName: snapshot.fileName,
        sizeKb: Math.round(sizeBytes / 1024),
        stats: snapshot.stats,
      }),
    });

    // Notify user
    StorageService.addNotification({
      title: type === 'AUTOMATICO_CRON' ? 'Backup Automático Concluído' : 'Backup Manual Concluído',
      message: `Snapshot salvo: ${snapshot.stats.proposalsCount} propostas, ${snapshot.stats.clientsCount} clientes (${(sizeBytes / 1024).toFixed(1)} KB).`,
      type: 'ALTERACAO_IMPORTANTE',
      priority: 'NORMAL',
    });

    // Optionally auto-download if requested
    if (schedule.autoDownload && type === 'AUTOMATICO_CRON') {
      this.downloadBackupAsFile(snapshot);
    }

    return snapshot;
  }

  /**
   * Downloads a snapshot or current database dump to a local JSON file
   */
  public static downloadBackupAsFile(
    snapshotOrData?: DatabaseBackupSnapshot | Record<string, any>,
    customFileName?: string
  ): void {
    let dataToExport: Record<string, any>;
    let fileName: string;

    if (snapshotOrData && 'dataDump' in snapshotOrData) {
      dataToExport = snapshotOrData.dataDump;
      fileName = snapshotOrData.fileName;
    } else if (snapshotOrData) {
      dataToExport = snapshotOrData;
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
      fileName = customFileName || `evolve_database_dump_${ts}.json`;
    } else {
      const snapshot = this.createBackupSnapshot('MANUAL', 'Download direto de arquivo de backup');
      dataToExport = snapshot.dataDump;
      fileName = snapshot.fileName;
    }

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Validates and restores the entire database from a dump object
   */
  public static restoreDatabaseFromDump(dataDump: Record<string, any>): {
    success: boolean;
    error?: string;
    restoredStats?: Record<string, number>;
  } {
    if (!dataDump || typeof dataDump !== 'object') {
      return { success: false, error: 'Arquivo ou formato de backup inválido.' };
    }

    // Validation: ensure at least basic structures exist
    const hasUsers = Array.isArray(dataDump.users);
    const hasStatuses = Array.isArray(dataDump.statuses);
    const hasProposals = Array.isArray(dataDump.proposals);

    if (!hasUsers || !hasStatuses || !hasProposals) {
      return {
        success: false,
        error: 'Estrutura de dados incompatível. O arquivo deve conter tabelas de usuários, status e propostas.',
      };
    }

    // Step 1: Create an emergency safety snapshot of current state before replacing!
    try {
      this.createBackupSnapshot('MANUAL', 'Snapshot de segurança pré-restauração emergencial');
    } catch (e) {
      console.warn('Aviso: falha ao salvar snapshot emergencial:', e);
    }

    try {
      // Step 2: Restore all primary keys
      if (Array.isArray(dataDump.users)) localStorage.setItem('cg_users', JSON.stringify(dataDump.users));
      if (Array.isArray(dataDump.promoters)) localStorage.setItem('cg_promoters', JSON.stringify(dataDump.promoters));
      if (Array.isArray(dataDump.banks)) localStorage.setItem('cg_banks', JSON.stringify(dataDump.banks));
      if (Array.isArray(dataDump.bankPromoters)) localStorage.setItem('cg_bank_promoters', JSON.stringify(dataDump.bankPromoters));
      if (Array.isArray(dataDump.partners)) localStorage.setItem('cg_partners', JSON.stringify(dataDump.partners));
      if (Array.isArray(dataDump.products)) localStorage.setItem('cg_products', JSON.stringify(dataDump.products));
      if (Array.isArray(dataDump.clients)) localStorage.setItem('cg_clients', JSON.stringify(dataDump.clients));
      if (Array.isArray(dataDump.statuses)) localStorage.setItem('cg_statuses', JSON.stringify(dataDump.statuses));
      if (Array.isArray(dataDump.proposals)) localStorage.setItem('cg_proposals', JSON.stringify(dataDump.proposals));
      if (Array.isArray(dataDump.proposalRelations)) localStorage.setItem('cg_proposal_relations', JSON.stringify(dataDump.proposalRelations));
      if (Array.isArray(dataDump.history)) localStorage.setItem('cg_history', JSON.stringify(dataDump.history));
      if (Array.isArray(dataDump.comments)) localStorage.setItem('cg_comments', JSON.stringify(dataDump.comments));
      if (Array.isArray(dataDump.pendings)) localStorage.setItem('cg_pendings', JSON.stringify(dataDump.pendings));
      if (Array.isArray(dataDump.holidays)) localStorage.setItem('cg_holidays', JSON.stringify(dataDump.holidays));
      if (Array.isArray(dataDump.notifications)) localStorage.setItem('cg_notifications', JSON.stringify(dataDump.notifications));
      if (Array.isArray(dataDump.auditLogs)) localStorage.setItem('cg_audit_logs', JSON.stringify(dataDump.auditLogs));
      if (Array.isArray(dataDump.exportLogs)) localStorage.setItem('cg_export_logs', JSON.stringify(dataDump.exportLogs));
      if (dataDump.config && typeof dataDump.config === 'object') localStorage.setItem('cg_config', JSON.stringify(dataDump.config));

      const stats = {
        proposals: dataDump.proposals?.length || 0,
        clients: dataDump.clients?.length || 0,
        partners: dataDump.partners?.length || 0,
        banks: dataDump.banks?.length || 0,
        history: dataDump.history?.length || 0,
      };

      StorageService.addAuditLog({
        action: 'RESTAURAR_BANCO_DADOS',
        entity: 'Database',
        entityId: 'full_restore',
        newData: JSON.stringify(stats),
      });

      return {
        success: true,
        restoredStats: stats,
      };
    } catch (err: any) {
      console.error('Erro ao restaurar banco:', err);
      return { success: false, error: err?.message || 'Falha desconhecida ao aplicar restauração.' };
    }
  }

  /**
   * Deletes a snapshot by ID
   */
  public static deleteSnapshot(id: string): void {
    const list = this.getSnapshots().filter(s => s.id !== id);
    this.saveSnapshots(list);

    StorageService.addAuditLog({
      action: 'EXCLUIR_SNAPSHOT_BACKUP',
      entity: 'DatabaseBackupSnapshot',
      entityId: id,
    });
  }

  /**
   * Checks if a scheduled backup is due and runs it
   */
  public static checkAndExecuteScheduledBackup(): { executed: boolean; message: string; snapshot?: DatabaseBackupSnapshot } {
    const schedule = this.getScheduleConfig();
    if (!schedule.enabled) {
      return { executed: false, message: 'Agendamento de backup automático desativado.' };
    }

    const now = Date.now();
    const nextRun = schedule.nextRunAt ? new Date(schedule.nextRunAt).getTime() : 0;

    // Check if due (or if never ran before)
    if (!schedule.lastRunAt || now >= nextRun) {
      const snapshot = this.createBackupSnapshot('AUTOMATICO_CRON', 'Executado automaticamente pelo serviço de cron');
      return {
        executed: true,
        message: `Backup automático realizado com sucesso (${snapshot.stats.proposalsCount} propostas salvas).`,
        snapshot,
      };
    }

    const minutesRemaining = Math.max(1, Math.round((nextRun - now) / 60000));
    return {
      executed: false,
      message: `Próximo backup agendado em aproximadamente ${minutesRemaining} minutos.`,
    };
  }
}
