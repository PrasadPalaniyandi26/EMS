/**
 * Migration: Add extra fields to projects and products tables
 * Fields: lead_id, budget, start_date, end_date, category
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adding extra columns to projects table...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS start_date DATE,
      ADD COLUMN IF NOT EXISTS end_date DATE,
      ADD COLUMN IF NOT EXISTS category VARCHAR(100)
  `);

  console.log('Adding extra columns to products table...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS start_date DATE,
      ADD COLUMN IF NOT EXISTS end_date DATE,
      ADD COLUMN IF NOT EXISTS category VARCHAR(100)
  `);

  console.log('Migration complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
