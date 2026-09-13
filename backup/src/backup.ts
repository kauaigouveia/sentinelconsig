import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

// Validate and clean/sanitize database URI logs
function sanitizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = '******';
    return url.toString();
  } catch {
    return 'Invalid or unparseable connection string';
  }
}

async function runBackup() {
  console.log('===================================================');
  console.log('       INICIANDO PROCESSO DE BACKUP POSTGRESQL     ');
  console.log('===================================================');

  // 1. Read and validate environment variables
  const databaseUrl = process.env.DATABASE_URL;
  const backupEnv = process.env.BACKUP_ENVIRONMENT || 'staging';
  const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const storageContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'sentinel-backups';

  if (!databaseUrl) {
    console.error('[ERRO DE SEGURANÇA] Variável DATABASE_URL não está configurada.');
    process.exit(1);
  }

  if (!storageAccountName) {
    console.error('[ERRO DE SEGURANÇA] Variável AZURE_STORAGE_ACCOUNT_NAME não está configurada.');
    process.exit(1);
  }

  console.log(`[INFO] Ambiente de Backup: ${backupEnv}`);
  console.log(`[INFO] Conta de Armazenamento Azure: ${storageAccountName}`);
  console.log(`[INFO] Container Azure: ${storageContainerName}`);
  console.log(`[INFO] Banco de Dados de Origem: ${sanitizeConnectionString(databaseUrl)}`);

  // Create temporary secure file path
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sentinel-backup-'));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  const dateObj = new Date();
  const year = dateObj.getUTCFullYear().toString();
  const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getUTCDate().toString().padStart(2, '0');
  const hours = dateObj.getUTCHours().toString().padStart(2, '0');
  const minutes = dateObj.getUTCMinutes().toString().padStart(2, '0');
  const seconds = dateObj.getUTCSeconds().toString().padStart(2, '0');
  
  const formattedDate = `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
  
  const dumpFileName = `sentinel-consig-${backupEnv}-${formattedDate}.dump`;
  const jsonFileName = `sentinel-consig-${backupEnv}-${formattedDate}.json`;
  
  const dumpFilePath = path.join(tempDir, dumpFileName);
  const jsonFilePath = path.join(tempDir, jsonFileName);

  try {
    // 2. Execute pg_dump
    console.log('[PROC] Executando pg_dump...');
    
    // Command: pg_dump -d <db_url> -F c -f <output_file>
    await new Promise<void>((resolve, reject) => {
      execFile('pg_dump', ['-d', databaseUrl, '-F', 'c', '-f', dumpFilePath], (error, stdout, stderr) => {
        if (error) {
          console.error('[ERRO] pg_dump falhou ao executar.');
          if (stderr) {
            // Be careful not to leak potential password in standard output/error
            const cleanStderr = stderr.replace(databaseUrl, sanitizeConnectionString(databaseUrl));
            console.error(`[DETALHES DO ERRO]: ${cleanStderr}`);
          }
          reject(error);
        } else {
          console.log('[PROC] pg_dump concluído com sucesso!');
          resolve();
        }
      });
    });

    // 3. Obtain file size and SHA-256
    console.log('[PROC] Calculando SHA-256 e tamanho do arquivo...');
    const fileStats = await fs.stat(dumpFilePath);
    const fileSizeBytes = fileStats.size;

    const fileBuffer = await fs.readFile(dumpFilePath);
    const hash = crypto.createHash('sha256');
    hash.update(fileBuffer);
    const sha256 = hash.digest('hex');

    console.log(`[INFO] Tamanho do dump: ${fileSizeBytes} bytes`);
    console.log(`[INFO] Hash SHA-256: ${sha256}`);

    // Parse database name safely from URL
    let dbName = 'unknown';
    try {
      const parsedUrl = new URL(databaseUrl);
      dbName = parsedUrl.pathname.replace(/^\//, '') || 'unknown';
    } catch {
      // Ignored
    }

    // 4. Create metadata JSON
    const metadata = {
      environment: backupEnv,
      generatedAt: new Date().toISOString(),
      fileSizeBytes,
      sha256,
      database: dbName,
      backupFormat: 'custom',
      schemaVersion: 'Prisma-6.x'
    };

    const metadataContent = JSON.stringify(metadata, null, 2);
    await fs.writeFile(jsonFilePath, metadataContent, 'utf-8');
    console.log('[PROC] Metadados de backup criados.');

    // 5. Connect and Upload to Azure Blob Storage
    console.log('[PROC] Conectando ao Azure Blob Storage usando Managed Identity (DefaultAzureCredential)...');
    
    const accountUrl = `https://${storageAccountName}.blob.core.windows.net`;
    const blobServiceClient = new BlobServiceClient(accountUrl, new DefaultAzureCredential());
    const containerClient = blobServiceClient.getContainerClient(storageContainerName);

    // Path inside blob: backups/staging/YYYY/MM/DD/
    const blobPrefix = `backups/${backupEnv}/${year}/${month}/${day}`;
    const destDumpBlobName = `${blobPrefix}/${dumpFileName}`;
    const destJsonBlobName = `${blobPrefix}/${jsonFileName}`;

    console.log(`[PROC] Enviando arquivo .dump para: ${destDumpBlobName}...`);
    const dumpBlockBlobClient = containerClient.getBlockBlobClient(destDumpBlobName);
    await dumpBlockBlobClient.uploadFile(dumpFilePath, {
      blobHTTPHeaders: {
        blobContentType: 'application/octet-stream',
      },
      metadata: {
        environment: backupEnv,
        sha256: sha256,
      }
    });
    console.log('[PROC] Envio do arquivo .dump realizado com sucesso!');

    console.log(`[PROC] Enviando arquivo de metadados .json para: ${destJsonBlobName}...`);
    const jsonBlockBlobClient = containerClient.getBlockBlobClient(destJsonBlobName);
    await jsonBlockBlobClient.uploadData(Buffer.from(metadataContent, 'utf-8'), {
      blobHTTPHeaders: {
        blobContentType: 'application/json',
      }
    });
    console.log('[PROC] Envio de metadados concluído!');

    console.log('===================================================');
    console.log('      PROCESSO DE BACKUP CONCLUÍDO COM SUCESSO!     ');
    console.log('===================================================');

  } catch (error) {
    console.error('[ERRO CRÍTICO] Falha geral no processo de backup:', error);
    process.exit(1);
  } finally {
    // 6. Safe temporary directory cleanup (success or failure)
    console.log('[PROC] Limpando diretório temporário seguro...');
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      console.log('[PROC] Limpeza temporária finalizada.');
    } catch (cleanupError) {
      console.error('[ERRO] Falha ao excluir arquivos temporários:', cleanupError);
    }
  }
}

runBackup();
