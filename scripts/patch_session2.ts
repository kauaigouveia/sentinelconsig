import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

const sessionSafeUserOld = `      const safeUser = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        active: session.user.active,
        tenantId: session.effectiveTenantId || undefined,
        customPermissions: session.user.customPermissions || [],
        isMasterProtected: session.user.isMasterProtected || false,
        mustChangePassword: session.user.mustChangePassword,
        createdAt: session.user.createdAt.toISOString(),
        updatedAt: session.user.updatedAt.toISOString(),
      };`;

const sessionSafeUserNew = `      const activeMemberships = await prisma.userTenantMembership.findMany({
        where: { userId: session.user.id, active: true },
        include: { tenant: true },
      });
      const validMemberships = activeMemberships.filter(
        m => m.tenant && m.tenant.status === 'ACTIVE' && !m.tenant.deletedAt
      );

      const safeUser = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.activeRole || session.user.role,
        active: session.user.active,
        tenantId: session.effectiveTenantId || undefined,
        customPermissions: session.activePermissions || session.user.customPermissions || [],
        isMasterProtected: session.user.isMasterProtected || false,
        mustChangePassword: session.user.mustChangePassword,
        availableMemberships: validMemberships.map(m => ({
          id: m.id,
          tenantId: m.tenantId,
          tenantName: m.tenant?.name,
          role: m.role
        })),
        requireTenantSelection: !session.effectiveTenantId && validMemberships.length > 1 && session.user.role !== 'PLATFORM_MASTER' && !session.user.mustChangePassword,
        createdAt: session.user.createdAt.toISOString(),
        updatedAt: session.user.updatedAt.toISOString(),
      };`;

if (content.includes(sessionSafeUserOld)) {
  content = content.replace(sessionSafeUserOld, sessionSafeUserNew);
  console.log('Session safe user patched');
} else {
  console.log('Session safe user not found');
}

fs.writeFileSync('server.ts', content);
