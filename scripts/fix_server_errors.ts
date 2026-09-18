import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// Fix safeUser scope issues
const oldSafeUser = `        availableMemberships: validMemberships ? validMemberships.map(m => ({
          id: m.id,
          tenantId: m.tenantId,
          tenantName: m.tenant?.name,
          role: m.role
        })) : [],
        requireTenantSelection: validMemberships && validMemberships.length > 1 && !hasDomainTenant && !dbUser.mustChangePassword,`;

const newSafeUser = `        availableMemberships: (typeof validMemberships !== 'undefined' ? validMemberships : []).map(m => ({
          id: m.id,
          tenantId: m.tenantId,
          tenantName: m.tenant?.name,
          role: m.role
        })),
        requireTenantSelection: (typeof validMemberships !== 'undefined' ? validMemberships.length : 0) > 1 && !(typeof hasDomainTenant !== 'undefined' && hasDomainTenant) && !dbUser.mustChangePassword,`;

if (content.includes(oldSafeUser)) {
  content = content.replace(oldSafeUser, newSafeUser);
  console.log('Fixed safeUser in server.ts');
}

fs.writeFileSync('server.ts', content);
