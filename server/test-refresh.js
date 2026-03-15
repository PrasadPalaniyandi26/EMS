const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ include: { roleRelation: true } });
  console.log("Users:", users.length);
  if (users.length === 0) return;
  const user = users[0];
  
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  const JWT_REFRESH_SECRET = 'kamalam';
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const decoded = jwt.decode(refreshToken);
  
  console.log("refreshToken:", refreshToken);
  console.log("tokenHash:", tokenHash);
  
  // Create token
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(decoded.exp * 1000),
    },
  });
  
  console.log("Created token for user", user.id);
  
  // Find token exactly as in auth.service.ts
  const stored = await prisma.refreshToken.findFirst({
        where: { tokenHash, userId: decoded.id },
  });
  
  console.log("Stored token found?", !!stored);
  if (stored) {
    console.log("Stored ID:", stored.id);
    await prisma.refreshToken.delete({ where: { id: stored.id }});
    console.log("Deleted token");
  } else {
    // maybe try to find by hash alone?
    const byHash = await prisma.refreshToken.findFirst({ where: { tokenHash } });
    console.log("Found by hash only?", !!byHash);
    if (!byHash) {
      const byUser = await prisma.refreshToken.findFirst({ where: { userId: decoded.id } });
      console.log("Found by user only?", !!byUser, "hash is:", byUser ? byUser.tokenHash : 'none');
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
