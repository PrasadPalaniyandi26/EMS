// Migration: Add code columns to projects, products, budgets, recurring_transactions
// Run with: node prisma/migrate-naming-codes.cjs

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Running naming codes migration...');

  // Add code columns
  await prisma.$executeRawUnsafe(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS code VARCHAR(20) UNIQUE`);
  console.log('Added code to projects');

  await prisma.$executeRawUnsafe(`ALTER TABLE products ADD COLUMN IF NOT EXISTS code VARCHAR(20) UNIQUE`);
  console.log('Added code to products');

  await prisma.$executeRawUnsafe(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS code VARCHAR(20)`);
  console.log('Added code to budgets');

  await prisma.$executeRawUnsafe(`ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS code VARCHAR(20)`);
  console.log('Added code to recurring_transactions');

  // Backfill existing rows
  await prisma.$executeRawUnsafe(`UPDATE projects SET code = 'PRJ-' || LPAD((10000 + id)::text, 5, '0') WHERE code IS NULL`);
  console.log('Backfilled project codes');

  await prisma.$executeRawUnsafe(`UPDATE products SET code = 'PRD-' || LPAD((10000 + id)::text, 5, '0') WHERE code IS NULL`);
  console.log('Backfilled product codes');

  await prisma.$executeRawUnsafe(`UPDATE budgets SET code = 'BUD-' || LPAD((10000 + id)::text, 5, '0') WHERE code IS NULL`);
  console.log('Backfilled budget codes');

  await prisma.$executeRawUnsafe(`UPDATE recurring_transactions SET code = 'REC-' || LPAD((10000 + id)::text, 5, '0') WHERE code IS NULL`);
  console.log('Backfilled recurring codes');

  console.log('Migration completed successfully');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
