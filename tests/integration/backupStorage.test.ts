import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../../server';
import { BackupStorageService } from '../../server/services/backupStorageService';
import type { Server } from 'http';
import fs from 'fs';
import path from 'path';

describe('Integration: BackupStorageService Isolation and Server Startup Resilience', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'string' ? 0 : addr?.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should successfully call /api/health and return status 200', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('should allow explicit backup provider configuration based on env variables', () => {
    // Save original env
    const originalProvider = process.env.BACKUP_PROVIDER;
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      // Test filesystem explicit configuration
      process.env.BACKUP_PROVIDER = 'local';
      const localService = new BackupStorageService();
      expect(localService.getProvider()).toBe('local');

      // Test Azure Blob explicit configuration
      process.env.BACKUP_PROVIDER = 'azure';
      const azureService = new BackupStorageService();
      expect(azureService.getProvider()).toBe('azure');

      // Test production default (without explicit provider, node_env = production -> azure)
      delete process.env.BACKUP_PROVIDER;
      process.env.NODE_ENV = 'production';
      const prodDefaultService = new BackupStorageService();
      expect(prodDefaultService.getProvider()).toBe('azure');
    } finally {
      // Restore env
      process.env.BACKUP_PROVIDER = originalProvider;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should initialize BackupStorageService lazily and create storage path on demand when writing backup', async () => {
    const testService = new BackupStorageService();
    expect(testService.getProvider()).toBe('local');

    const testBackupId = `test-lazy-storage-${Date.now()}`;
    const testPayload = JSON.stringify({ test: true, timestamp: Date.now() });

    // Writing backup triggers on-demand directory creation if not present
    const createdPath = await testService.putBackup(testBackupId, testPayload);
    expect(fs.existsSync(createdPath)).toBe(true);

    // Reading backup verifies content
    const readContent = await testService.getBackup(createdPath);
    expect(readContent).toBe(testPayload);

    // Cleanup test file
    await testService.deleteBackup(createdPath);
    expect(fs.existsSync(createdPath)).toBe(false);
  });
});
