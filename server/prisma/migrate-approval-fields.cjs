/**
 * Migration: Add final approver fields to transactions table
 * Run: node prisma/migrate-approval-fields.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adding final approver columns to transactions...');

  await prisma.$executeRawUnsafe(`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS approved_by_id       INTEGER,
      ADD COLUMN IF NOT EXISTS approved_by_name     VARCHAR(100),
      ADD COLUMN IF NOT EXISTS approved_by_role     VARCHAR(50),
      ADD COLUMN IF NOT EXISTS approved_at          TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS rejected_by_id       INTEGER,
      ADD COLUMN IF NOT EXISTS rejected_by_name     VARCHAR(100),
      ADD COLUMN IF NOT EXISTS rejected_by_role     VARCHAR(50),
      ADD COLUMN IF NOT EXISTS rejected_at          TIMESTAMP WITH TIME ZONE
  `);

  console.log('Done.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
