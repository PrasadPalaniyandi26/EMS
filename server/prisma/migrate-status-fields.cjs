/**
 * Migration: Add status column to projects and products tables
 * Run: node prisma/migrate-status-fields.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Adding status column to projects table...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'Active'
  `);
  // Set status based on is_active for existing records
  await prisma.$executeRawUnsafe(`
    UPDATE projects SET status = CASE WHEN is_active = true THEN 'Active' ELSE 'On-Hold' END WHERE status IS NULL OR status = 'Active'
  `);

  console.log('Adding status column to products table...');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'R&D'
  `);
  // Set status based on is_active for existing records
  await prisma.$executeRawUnsafe(`
    UPDATE products SET status = CASE WHEN is_active = true THEN 'R&D' ELSE 'R&D' END WHERE status IS NULL
  `);

  console.log('Migration complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
