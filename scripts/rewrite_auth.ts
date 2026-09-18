import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// 1. ADD /api/auth/update-password BEFORE /api/auth/session
if (!content.includes('app.post(\'/api/auth/update-password\'')) {
  const passwordRoute = `
  app.post('/api/auth/update-password', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autorizado.' });
      
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: 'Senha é obrigatória.' });

      const { hashPassword } = await import('./server/utils/auth.js');
      const passwordHash = await hashPassword(password);
      
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          passwordHash,
          mustChangePassword: false,
        }
      });
      
      return res.json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // 3. GET /api/auth/session
`;
  content = content.replace('  // 3. GET /api/auth/session', passwordRoute);
}

// 2. UPDATE login endpoint for memberships
// It's easier to just add the validMemberships map to safeUser
const oldSafeUserLogin = `      const safeUser = {
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

const newSafeUserLogin = `
      // Load active memberships for login output
      const activeMemberships = await prisma.userTenantMembership.findMany({
        where: { userId: dbUser.id, active: true },
        include: { tenant: true }
      });
      const validMemberships = activeMemberships.filter(m => m.tenant && m.tenant.status === 'ACTIVE' && !m.tenant.deletedAt);
      const hasDomainTenantLocal = !!domainResolution.tenant && (domainResolution.type === 'PLATFORM_SUBDOMAIN' || domainResolution.type === 'CUSTOM_DOMAIN');
      
      const safeUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: activeRole,
        active: dbUser.active,
        tenantId: effectiveTenantId || undefined,
        customPermissions: activePermissions,
        isMasterProtected: dbUser.isMasterProtected || false,
        mustChangePassword: dbUser.mustChangePassword,
        availableMemberships: validMemberships.map(m => ({
          id: m.id, tenantId: m.tenantId, tenantName: m.tenant.name, role: m.role
        })),
        requireTenantSelection: validMemberships.length > 1 && !hasDomainTenantLocal && !dbUser.mustChangePassword && dbUser.role !== 'PLATFORM_MASTER',
        createdAt: dbUser.createdAt.toISOString(),
        updatedAt: dbUser.updatedAt.toISOString(),
      };`;

if (content.includes(oldSafeUserLogin)) {
  content = content.replace(oldSafeUserLogin, newSafeUserLogin);
}

// 3. UPDATE session endpoint for memberships
const oldSafeUserSession = `      const safeUser = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.activeRole || session.user.role,
        active: session.user.active,
        tenantId: session.effectiveTenantId || undefined,
        customPermissions: session.activePermissions || session.user.customPermissions || [],
        isMasterProtected: session.user.isMasterProtected || false,
        mustChangePassword: session.user.mustChangePassword,
        createdAt: session.user.createdAt.toISOString(),
        updatedAt: session.user.updatedAt.toISOString(),
      };`;

const newSafeUserSession = `
      const activeMemberships = await prisma.userTenantMembership.findMany({
        where: { userId: session.user.id, active: true },
        include: { tenant: true }
      });
      const validMemberships = activeMemberships.filter(m => m.tenant && m.tenant.status === 'ACTIVE' && !m.tenant.deletedAt);
      
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
          id: m.id, tenantId: m.tenantId, tenantName: m.tenant.name, role: m.role
        })),
        requireTenantSelection: !session.effectiveTenantId && validMemberships.length > 1 && session.user.role !== 'PLATFORM_MASTER' && !session.user.mustChangePassword,
        createdAt: session.user.createdAt.toISOString(),
        updatedAt: session.user.updatedAt.toISOString(),
      };`;

if (content.includes(oldSafeUserSession)) {
  content = content.replace(oldSafeUserSession, newSafeUserSession);
}

// 4. Also fix POST /api/users to set mustChangePassword = true
content = content.replace(
  "passwordHash: await hashPassword(String(password).trim()),\n          role: role || 'DIGITADOR',",
  "passwordHash: await hashPassword(String(password).trim()),\n          mustChangePassword: true,\n          role: role || 'DIGITADOR',"
);

// 5. Rewrite switch-tenant if needed? No, standard user block is already in the original server.ts if I check carefully.
// Wait, is it? Let me check. Let's just make sure it's correct.

fs.writeFileSync('server.ts', content);
console.log('Rewritten auth endpoints.');
