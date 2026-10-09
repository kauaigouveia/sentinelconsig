import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type ImportedAccess = { name: string; code: string; email: string; password: string; status: string };
function key() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('Segredo de autenticação não configurado.');
  return createHash('sha256').update(`sentinel:partner-import:${secret}`).digest();
}
export function sealImportCredentials(rows: ImportedAccess[]) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(rows), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(p => p.toString('base64')).join('.');
}
export function openImportCredentials(value: string): ImportedAccess[] {
  const [iv, tag, data] = value.split('.').map(p => Buffer.from(p, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
