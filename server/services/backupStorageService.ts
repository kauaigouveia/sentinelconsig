import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { uploadBlob, downloadBlob, deleteBlob, getAzureContainerClient } from './azureBlobStorage';
import { logger } from '../logger';

export interface IBackupStorageService {
  putBackup(backupId: string, content: string): Promise<string>;
  getBackup(storagePathOrBlobKey: string): Promise<string>;
  deleteBackup(storagePathOrBlobKey: string): Promise<void>;
  existsBackup(storagePathOrBlobKey: string): Promise<boolean>;
}

export class BackupStorageService implements IBackupStorageService {
  private provider: 'azure' | 'local';

  constructor() {
    // 15. A seleção de provider deve ser explícita por ambiente/configuração.
    const envProvider = process.env.BACKUP_PROVIDER?.toLowerCase();
    if (envProvider === 'azure' || envProvider === 'azure_blob') {
      this.provider = 'azure';
    } else if (envProvider === 'local' || envProvider === 'filesystem') {
      this.provider = 'local';
    } else {
      // Default to azure in production, local in development/testing
      this.provider = process.env.NODE_ENV === 'production' ? 'azure' : 'local';
    }
    logger.info({ provider: this.provider }, '[BackupStorageService] Initialized backup storage provider');
  }

  public getProvider(): 'azure' | 'local' {
    return this.provider;
  }

  public async putBackup(backupId: string, content: string): Promise<string> {
    if (this.provider === 'azure') {
      const blobKey = `backups/${backupId}.json`;
      const buffer = Buffer.from(content, 'utf-8');
      await uploadBlob(blobKey, buffer, 'application/json');
      logger.info({ backupId, blobKey }, '[BackupStorageService] Backup successfully uploaded to Azure Blob Storage');
      return blobKey;
    } else {
      // 12. O diretório storage/ pode continuar sendo utilizado SOMENTE em testes locais onde explicitamente necessário.
      // Lazy initialization of storage path on local putBackup
      const backupsDir = path.join(process.cwd(), 'storage', 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      const filePath = path.join(backupsDir, `${backupId}.json`);
      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info({ backupId, filePath }, '[BackupStorageService] Backup successfully written to local filesystem');
      return filePath;
    }
  }

  public async getBackup(storagePathOrBlobKey: string): Promise<string> {
    if (this.provider === 'azure') {
      logger.info({ blobKey: storagePathOrBlobKey }, '[BackupStorageService] Fetching backup from Azure Blob Storage');
      const { buffer } = await downloadBlob(storagePathOrBlobKey);
      return buffer.toString('utf-8');
    } else {
      logger.info({ filePath: storagePathOrBlobKey }, '[BackupStorageService] Reading backup from local filesystem');
      if (!fs.existsSync(storagePathOrBlobKey)) {
        throw new Error(`Arquivo de backup não encontrado no filesystem: ${storagePathOrBlobKey}`);
      }
      return fs.readFileSync(storagePathOrBlobKey, 'utf-8');
    }
  }

  public async deleteBackup(storagePathOrBlobKey: string): Promise<void> {
    if (this.provider === 'azure') {
      logger.info({ blobKey: storagePathOrBlobKey }, '[BackupStorageService] Deleting backup from Azure Blob Storage');
      await deleteBlob(storagePathOrBlobKey);
    } else {
      logger.info({ filePath: storagePathOrBlobKey }, '[BackupStorageService] Deleting backup from local filesystem');
      if (fs.existsSync(storagePathOrBlobKey)) {
        fs.unlinkSync(storagePathOrBlobKey);
      }
    }
  }

  public async existsBackup(storagePathOrBlobKey: string): Promise<boolean> {
    if (this.provider === 'azure') {
      try {
        const container = getAzureContainerClient();
        const blockBlobClient = container.getBlockBlobClient(storagePathOrBlobKey);
        return await blockBlobClient.exists();
      } catch (err: any) {
        logger.warn({ error: err?.message || String(err), blobKey: storagePathOrBlobKey }, '[BackupStorageService] Error checking backup existence in Azure');
        return false;
      }
    } else {
      return fs.existsSync(storagePathOrBlobKey);
    }
  }
}

export const backupStorageService = new BackupStorageService();
