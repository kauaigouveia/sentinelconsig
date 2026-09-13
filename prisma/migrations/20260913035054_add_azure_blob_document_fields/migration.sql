-- AlterTable
ALTER TABLE "client_documents" ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "storage_provider" TEXT NOT NULL DEFAULT 'AZURE_BLOB';
