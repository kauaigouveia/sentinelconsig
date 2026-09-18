import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// The if block starts like this:
const oldIf = `      if (dbUser.role !== 'PLATFORM_MASTER') {`;
const newIf = `      let validMemberships: any[] = [];
      let hasDomainTenant = false;
      if (dbUser.role !== 'PLATFORM_MASTER') {`;

if (content.includes(oldIf) && !content.includes('let validMemberships: any[] = [];')) {
  content = content.replace(oldIf, newIf);
}

// And in the block:
const oldMemberships = `const validMemberships = activeMemberships.filter(`;
const newMemberships = `validMemberships = activeMemberships.filter(`;
content = content.replace(oldMemberships, newMemberships);

const oldDomain = `const hasDomainTenant = domainResolution.tenant && (domainResolution.type === 'PLATFORM_SUBDOMAIN' || domainResolution.type === 'CUSTOM_DOMAIN');`;
const newDomain = `hasDomainTenant = !!(domainResolution.tenant && (domainResolution.type === 'PLATFORM_SUBDOMAIN' || domainResolution.type === 'CUSTOM_DOMAIN'));`;
content = content.replace(oldDomain, newDomain);

const oldSafeUser1 = `availableMemberships: (typeof validMemberships !== 'undefined' ? validMemberships : [] as any[]).map((m: any) => ({`;
const newSafeUser1 = `availableMemberships: validMemberships.map((m: any) => ({`;
content = content.replace(oldSafeUser1, newSafeUser1);

const oldSafeUser2 = `requireTenantSelection: (typeof validMemberships !== 'undefined' ? (validMemberships as any[]).length : 0) > 1 && !(typeof hasDomainTenant !== 'undefined' && hasDomainTenant) && !dbUser.mustChangePassword,`;
const newSafeUser2 = `requireTenantSelection: validMemberships.length > 1 && !hasDomainTenant && !dbUser.mustChangePassword,`;
content = content.replace(oldSafeUser2, newSafeUser2);

fs.writeFileSync('server.ts', content);
console.log('Fixed TS declarations in server.ts');
