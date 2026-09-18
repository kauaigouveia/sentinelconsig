const fs = require('fs');
let content = fs.readFileSync('src/lib/utils.ts', 'utf8');

const oldExtract = `export function extractPartnerCode(login: string): string {
  if (!login) return '';
  const trimmed = login.trim();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1 || atIndex === trimmed.length - 1) {
    return '';
  }
  return trimmed.substring(atIndex + 1).trim();
}`;

const newExtract = `export function extractPartnerCode(login: string): string {
  if (!login) return '';
  return login.trim();
}`;

const oldValid = `export function isValidPartnerLogin(login: string): boolean {
  if (!login) return false;
  const trimmed = login.trim();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return false;
  const prefix = trimmed.substring(0, atIndex);
  const code = trimmed.substring(atIndex + 1);
  return prefix.length >= 2 && code.length >= 1;
}`;

const newValid = `export function isValidPartnerLogin(login: string): boolean {
  return !!login && login.trim().length > 0;
}`;

content = content.replace(oldExtract, newExtract);
content = content.replace(oldValid, newValid);

fs.writeFileSync('src/lib/utils.ts', content);
