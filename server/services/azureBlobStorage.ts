import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import path from 'path';
import { logger } from '../logger';

let containerClientInstance: ContainerClient | null = null;

function buildConnectionString(): string {
  const rawConn = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'sentinelconsig2026';

  if (!rawConn) {
    throw new Error('[AzureBlobStorage] Variable AZURE_STORAGE_CONNECTION_STRING is missing on server.');
  }

  if (rawConn.startsWith('DefaultEndpointsProtocol=')) {
    return rawConn;
  }

  return `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${rawConn};EndpointSuffix=core.windows.net`;
}

export function getAzureContainerClient(): ContainerClient {
  if (containerClientInstance) {
    return containerClientInstance;
  }

  const connectionString = buildConnectionString();
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'sentinel-documents';

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  containerClientInstance = blobServiceClient.getContainerClient(containerName);
  return containerClientInstance;
}

/**
 * Sanitizes file names to prevent path traversal attacks.
 */
export function sanitizeFileName(originalName: string): string {
  // Strip out path separators, parent directory markers, and control characters
  const basename = path.basename(originalName);
  const cleanName = basename.replace(/[\/\\]/g, '_').replace(/\.\./g, '_').replace(/[^a-zA-Z0-9_\.\-]/g, '_');
  return cleanName || 'document.bin';
}

/**
 * Generates the safe physical blob path:
 * documents/{tenantId}/clients/{clientId}/{documentId}/{safeFileName}
 */
export function buildBlobPath(tenantId: string, clientId: string, documentId: string, originalFileName: string): { blobPath: string; safeFileName: string } {
  // Strict path traversal defense
  if (!tenantId || tenantId.includes('..') || tenantId.includes('/') || tenantId.includes('\\')) {
    throw new Error('Invalid tenantId in blob path construction.');
  }
  if (!clientId || clientId.includes('..') || clientId.includes('/') || clientId.includes('\\')) {
    throw new Error('Invalid clientId in blob path construction.');
  }
  if (!documentId || documentId.includes('..') || documentId.includes('/') || documentId.includes('\\')) {
    throw new Error('Invalid documentId in blob path construction.');
  }

  const safeFileName = sanitizeFileName(originalFileName);
  const blobPath = `documents/${tenantId}/clients/${clientId}/${documentId}/${safeFileName}`;
  return { blobPath, safeFileName };
}

/**
 * Uploads a file buffer/stream to Azure Blob Storage
 */
export async function uploadBlob(blobPath: string, buffer: Buffer, mimeType?: string): Promise<void> {
  const container = getAzureContainerClient();
  const blockBlobClient = container.getBlockBlobClient(blobPath);
  
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimeType || 'application/octet-stream',
    },
  });
}

/**
 * Downloads a blob buffer from Azure Blob Storage
 */
export async function downloadBlob(blobPath: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const container = getAzureContainerClient();
  const blockBlobClient = container.getBlockBlobClient(blobPath);
  
  const downloadResponse = await blockBlobClient.download();
  const contentType = downloadResponse.contentType;
  
  const readableStream = downloadResponse.readableStreamBody;
  if (!readableStream) {
    throw new Error('Failed to retrieve readable stream from Azure Blob.');
  }

  const chunks: Buffer[] = [];
  for await (const chunk of readableStream as any) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  return { buffer, contentType };
}

/**
 * Deletes a blob from Azure Blob Storage idempotently
 */
export async function deleteBlob(blobPath: string): Promise<void> {
  try {
    const container = getAzureContainerClient();
    const blockBlobClient = container.getBlockBlobClient(blobPath);
    await blockBlobClient.deleteIfExists();
  } catch (err: any) {
    logger.warn({ error: err?.message || String(err) }, '[AZURE BLOB WARNING] deleteIfExists failed');
  }
}
