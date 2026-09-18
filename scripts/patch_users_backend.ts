import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf-8');

// We will use replace with regex for the GET /api/users
const getUsersOld = `      const users = await prisma.user.findMany({
        where: whereCondition,
        orderBy: { name: 'asc' },
      });`;

const getUsersNew = `      const users = await prisma.user.findMany({
        where: whereCondition,
        orderBy: { name: 'asc' },
        include: {
          memberships: {
            include: {
              tenant: true
            }
          }
        }
      });`;

if (content.includes(getUsersOld)) {
  content = content.replace(getUsersOld, getUsersNew);
  console.log('GET /api/users patched');
}

// POST /api/users
const postUsersOld = `      const { id, name, email, password, role, customPermissions, tenantId, phone } = req.body;`;
const postUsersNew = `      const { id, name, email, password, role, customPermissions, tenantId, phone, memberships } = req.body;`;
if (content.includes(postUsersOld)) {
  content = content.replace(postUsersOld, postUsersNew);
  console.log('POST /api/users params patched');
}

const postUsersCreateOld = `      if (user.tenantId) {
        await prisma.userTenantMembership.create({
          data: {
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role,
            customPermissions: { set: user.customPermissions },
            active: user.active,
          },
        });
      }`;
const postUsersCreateNew = `      if (memberships && Array.isArray(memberships)) {
        for (const m of memberships) {
          if (m.tenantId) {
            await prisma.userTenantMembership.create({
              data: {
                userId: user.id,
                tenantId: m.tenantId,
                role: m.role || 'DIGITADOR',
                customPermissions: { set: m.customPermissions || [] },
                active: m.active !== false,
              }
            });
          }
        }
      } else if (user.tenantId) {
        await prisma.userTenantMembership.create({
          data: {
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role,
            customPermissions: { set: user.customPermissions },
            active: user.active,
          },
        });
      }`;
if (content.includes(postUsersCreateOld)) {
  content = content.replace(postUsersCreateOld, postUsersCreateNew);
  console.log('POST /api/users creation patched');
}

// PUT /api/users/:id
const putUsersOld = `const { name, active, role, customPermissions, tenantId, phone, password } = req.body;`;
const putUsersNew = `const { name, active, role, customPermissions, tenantId, phone, password, memberships } = req.body;`;
if (content.includes(putUsersOld)) {
  content = content.replace(putUsersOld, putUsersNew);
  console.log('PUT /api/users params patched');
}

const putUsersUpdateOld = `      if (updatedUser.tenantId) {
        await prisma.userTenantMembership.upsert({
          where: {
            userId_tenantId: {
              userId: updatedUser.id,
              tenantId: updatedUser.tenantId,
            },
          },
          create: {
            userId: updatedUser.id,
            tenantId: updatedUser.tenantId,
            role: updatedUser.role,
            customPermissions: { set: updatedUser.customPermissions },
            active: updatedUser.active,
          },
          update: {
            role: updatedUser.role,
            customPermissions: { set: updatedUser.customPermissions },
            active: updatedUser.active,
          },
        });
      }`;
const putUsersUpdateNew = `      if (memberships && Array.isArray(memberships)) {
        // Find existing memberships
        const existingMemberships = await prisma.userTenantMembership.findMany({ where: { userId: updatedUser.id } });
        
        for (const m of memberships) {
          if (m.tenantId) {
            await prisma.userTenantMembership.upsert({
              where: {
                userId_tenantId: {
                  userId: updatedUser.id,
                  tenantId: m.tenantId,
                }
              },
              create: {
                userId: updatedUser.id,
                tenantId: m.tenantId,
                role: m.role || 'DIGITADOR',
                customPermissions: { set: m.customPermissions || [] },
                active: m.active !== false,
              },
              update: {
                role: m.role || 'DIGITADOR',
                customPermissions: { set: m.customPermissions || [] },
                active: m.active !== false,
              }
            });
          }
        }
        
        // Remove memberships not in the new array (only if isPlatformMaster or admin)
        if (canUpdateUsers) {
          const newTenantIds = memberships.map(m => m.tenantId).filter(Boolean);
          const toDelete = existingMemberships.filter(em => !newTenantIds.includes(em.tenantId));
          for (const dm of toDelete) {
            await prisma.userTenantMembership.delete({ where: { id: dm.id } });
          }
        }
      } else if (updatedUser.tenantId) {
        await prisma.userTenantMembership.upsert({
          where: {
            userId_tenantId: {
              userId: updatedUser.id,
              tenantId: updatedUser.tenantId,
            },
          },
          create: {
            userId: updatedUser.id,
            tenantId: updatedUser.tenantId,
            role: updatedUser.role,
            customPermissions: { set: updatedUser.customPermissions },
            active: updatedUser.active,
          },
          update: {
            role: updatedUser.role,
            customPermissions: { set: updatedUser.customPermissions },
            active: updatedUser.active,
          },
        });
      }`;

if (content.includes(putUsersUpdateOld)) {
  content = content.replace(putUsersUpdateOld, putUsersUpdateNew);
  console.log('PUT /api/users update patched');
}

fs.writeFileSync('server.ts', content);
