const fs = require('fs');
let content = fs.readFileSync('src/lib/utils.ts', 'utf8');

const oldFunc = `export function extractPartnerCode(login: string): string {
  if (!login) return '';
  return login.trim();
}`;

const newFunc = `export function extractPartnerCode(login: string): string {
  if (!login) return '';
  const trimmed = login.trim();
  const lastAtIndex = trimmed.lastIndexOf('@');
  if (lastAtIndex !== -1) {
    return trimmed.substring(lastAtIndex + 1).trim();
  }
  return trimmed;
}`;

content = content.replace(oldFunc, newFunc);
fs.writeFileSync('src/lib/utils.ts', content);
