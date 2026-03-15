const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Running user fields migration...');

  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS contact_no VARCHAR(20),
      ADD COLUMN IF NOT EXISTS house_apt VARCHAR(100),
      ADD COLUMN IF NOT EXISTS address VARCHAR(255),
      ADD COLUMN IF NOT EXISTS city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS country VARCHAR(100),
      ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS user_status VARCHAR(20) DEFAULT 'ACTIVE'
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE users SET user_status = 'ACTIVE' WHERE is_active = true AND user_status IS NULL
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE users SET user_status = 'INACTIVE' WHERE is_active = false AND user_status IS NULL
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permissions JSONB NOT NULL DEFAULT '{}',
      single_limit DECIMAL(12,2) DEFAULT 10000,
      monthly_limit DECIMAL(12,2) DEFAULT 50000,
      data_scope VARCHAR(20) DEFAULT 'Department',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  console.log('Migration complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
