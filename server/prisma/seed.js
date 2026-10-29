/**
 * Prisma Seed Script
 * Seeds the PostgreSQL database with essential initial data.
 * Run with: npx prisma db seed
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── 1. Roles ──
  const coreRoles = [
    { id: 1, name: 'ADMIN', description: 'System Administrator with full access' },
    { id: 2, name: 'FINANCE', description: 'Finance controller with final approval rights' },
    { id: 3, name: 'MANAGER', description: 'Department supervisor' },
    { id: 4, name: 'EMPLOYEE', description: 'Standard business user' },
  ];

  for (const role of coreRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log('  ✓ Roles seeded (ADMIN, FINANCE, MANAGER, EMPLOYEE)');

  // ── 2. Categories ──
  const categories = [
    // Income
    { id: 1, name: 'Salary', type: 'income', icon: 'briefcase', isCustom: false, isActive: true },
    { id: 2, name: 'Freelance', type: 'income', icon: 'laptop', isCustom: false, isActive: true },
    { id: 3, name: 'Investment', type: 'income', icon: 'trending-up', isCustom: false, isActive: true },
    { id: 4, name: 'Other Income', type: 'income', icon: 'plus-circle', isCustom: false, isActive: true },
    // Expense
    { id: 10, name: 'Food & Dining', type: 'expense', icon: 'utensils', isCustom: false, isActive: true },
    { id: 11, name: 'Transport', type: 'expense', icon: 'car', isCustom: false, isActive: true },
    { id: 12, name: 'Utilities', type: 'expense', icon: 'zap', isCustom: false, isActive: true },
    { id: 13, name: 'Entertainment', type: 'expense', icon: 'film', isCustom: false, isActive: true },
    { id: 14, name: 'Shopping', type: 'expense', icon: 'shopping-bag', isCustom: false, isActive: true },
    { id: 15, name: 'Healthcare', type: 'expense', icon: 'heart', isCustom: false, isActive: true },
    { id: 16, name: 'Education', type: 'expense', icon: 'book', isCustom: false, isActive: true },
    { id: 17, name: 'Rent', type: 'expense', icon: 'home', isCustom: false, isActive: true },
    { id: 18, name: 'Insurance', type: 'expense', icon: 'shield', isCustom: false, isActive: true },
    { id: 19, name: 'Other Expense', type: 'expense', icon: 'more-horizontal', isCustom: false, isActive: true },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
      create: cat,
    });
  }
  console.log('  ✓ Categories seeded (4 income + 10 expense)');

  // ── 3. Internal Client ──
  await prisma.client.upsert({
    where: { name: 'Internal' },
    update: {},
    create: {
      id: 1,
      name: 'Internal',
      description: 'Company internal expenses',
      isSystem: true,
      isActive: true,
    },
  });
  console.log('  ✓ Internal client seeded');

  // ── 4. Internal Project Type ──
  await prisma.projectType.upsert({
    where: { name: 'Internal' },
    update: {},
    create: {
      id: 1,
      name: 'Internal',
      isActive: true,
    },
  });
  console.log('  ✓ Internal project type seeded');

  // ── 5. Internal Project ──
  await prisma.project.upsert({
    where: { clientId_name: { clientId: 1, name: 'Internal' } },
    update: {},
    create: {
      id: 1,
      clientId: 1,
      typeId: 1,
      name: 'Internal',
      description: 'General internal project',
      isSystem: true,
      isActive: true,
    },
  });
  console.log('  ✓ Internal project seeded');

  // ── 6. Internal Product Type ──
  await prisma.productType.upsert({
    where: { name: 'Internal' },
    update: {},
    create: {
      id: 1,
      name: 'Internal',
      isActive: true,
    },
  });
  console.log('  ✓ Internal product type seeded');

  // ── 7. Internal Product ──
  await prisma.product.upsert({
    where: { clientId_name: { clientId: 1, name: 'Internal' } },
    update: {},
    create: {
      id: 1,
      clientId: 1,
      typeId: 1,
      name: 'Internal',
      description: 'General internal product',
      isSystem: true,
      isActive: true,
    },
  });
  console.log('  ✓ Internal product seeded');

  // ── 8. Admin User ──
  const passwordHash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { loginName: 'admin' },
    create: {
      username: 'admin',
      loginName: 'admin',
      email: 'admin@fmh.local',
      passwordHash: passwordHash,
      role: 'admin',
      roleId: 1,
      isActive: true,
      currency: 'INR',
    },
  });
  console.log('  ✓ Admin user seeded (admin / admin123)');

  // ── 9. Reset autoincrement sequences to avoid conflicts ──
  // After inserting with explicit IDs, we need to advance the sequences
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('roles', 'role_id'), COALESCE(MAX(role_id), 1)) FROM roles`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE(MAX(id), 1)) FROM categories`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('clients', 'id'), COALESCE(MAX(id), 1)) FROM clients`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('projects', 'id'), COALESCE(MAX(id), 1)) FROM projects`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('project_types', 'id'), COALESCE(MAX(id), 1)) FROM project_types`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('product_types', 'id'), COALESCE(MAX(id), 1)) FROM product_types`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE(MAX(id), 1)) FROM products`);
  await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users`);
  console.log('  ✓ Auto-increment sequences reset');

  console.log('\n🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
