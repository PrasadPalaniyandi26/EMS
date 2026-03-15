/**
 * Migration: Add code and country fields to clients table
 * Run: node prisma/migrate-client-code.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adding code and country columns to clients...');

  await prisma.$executeRawUnsafe(`
    ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS code    VARCHAR(20),
      ADD COLUMN IF NOT EXISTS country VARCHAR(100)
  `);

  console.log('Done.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
