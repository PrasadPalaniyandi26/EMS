/**
 * Migration: Add extended fields to budgets table
 * Run: node prisma/migrate-budget-fields.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adding extended columns to budgets table...');
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS name VARCHAR(150)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS department VARCHAR(100)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS financial_year INTEGER`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS details TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS start_date DATE`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS end_date DATE`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS strict_enforcement BOOLEAN DEFAULT true`);
  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS auto_rollover BOOLEAN DEFAULT false`);
  // Back-fill financial_year from period_year for existing records
  await prisma.$executeRawUnsafe(`UPDATE budgets SET financial_year = period_year WHERE financial_year IS NULL`);
  console.log('Migration complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
