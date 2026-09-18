import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

const loginSnippetOld = `        const primaryMembership = validMemberships[0];
        effectiveTenantId = primaryMembership.tenantId;
        effectiveMembershipId = primaryMembership.id;
        activeRole = primaryMembership.role;
        activePermissions = primaryMembership.customPermissions || [];`;

const loginSnippetNew = `        if (validMemberships.length > 1 && !hasDomainTenant) {
          // Multiple memberships and not locked to a specific domain
          effectiveTenantId = null;
          effectiveMembershipId = null;
          activeRole = 'DIGITADOR'; // Default minimum role until selection
          activePermissions = [];
        } else {
          // Only one membership or domain forces a specific one
          const primaryMembership = validMemberships[0];
          effectiveTenantId = primaryMembership.tenantId;
          effectiveMembershipId = primaryMembership.id;
          activeRole = primaryMembership.role;
          activePermissions = primaryMembership.customPermissions || [];
        }`;

if (content.includes(loginSnippetOld)) {
  content = content.replace(loginSnippetOld, loginSnippetNew);
  console.log('Login patched');
} else {
  console.log('Login snippet not found');
}

// Add availableMemberships to safeUser
const safeUserOld = `      const safeUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: activeRole,
        active: dbUser.active,
        tenantId: effectiveTenantId || undefined,
        customPermissions: activePermissions,
        isMasterProtected: dbUser.isMasterProtected || false,
        mustChangePassword: dbUser.mustChangePassword,
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      };`;

const safeUserNew = `      const safeUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: activeRole,
        active: dbUser.active,
        tenantId: effectiveTenantId || undefined,
        customPermissions: activePermissions,
        isMasterProtected: dbUser.isMasterProtected || false,
        mustChangePassword: dbUser.mustChangePassword,
        availableMemberships: validMemberships ? validMemberships.map(m => ({
          id: m.id,
          tenantId: m.tenantId,
          tenantName: m.tenant?.name,
          role: m.role
        })) : [],
        requireTenantSelection: validMemberships && validMemberships.length > 1 && !hasDomainTenant && !dbUser.mustChangePassword,
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      };`;

if (content.includes(safeUserOld)) {
  content = content.replace(safeUserOld, safeUserNew);
  console.log('Safe user patched');
} else {
  console.log('Safe user not found');
}

fs.writeFileSync('server.ts', content);
