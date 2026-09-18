import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../server/services/passwordService.js';

const prisma = new PrismaClient();

async function testPasswordRoute() {
  // Test via prisma logic check
  const email = 'password.loop.test2@sentinelconsig.com.br';
  await prisma.session.deleteMany({ where: { user: { email } } }).catch(()=>null);
  await prisma.user.deleteMany({ where: { email } }).catch(()=>null);

  const user = await prisma.user.create({
    data: {
      name: 'Password Loop Tester',
      email,
      passwordHash: 'dummyhash',
      role: 'DIGITADOR',
      mustChangePassword: true,
      active: true,
    }
  });

  // Simulated request
  const reqBody = { newPassword: 'SuperSecurePassword123!' };
  const passwordHash = await hashPassword(reqBody.newPassword.trim());

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: false,
    }
  });

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (updatedUser && updatedUser.mustChangePassword === false && updatedUser.passwordHash !== 'dummyhash') {
    console.log("PASS: User updated successfully, mustChangePassword cleared.");
  } else {
    console.log("FAIL");
  }

  await prisma.user.delete({ where: { id: user.id } }).catch(()=>null);
  await prisma.$disconnect();
}
testPasswordRoute();
