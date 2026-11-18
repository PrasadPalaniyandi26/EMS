/**
 * Costing and budget setup for local development and the e2e tests: engineering rate cards, overhead pools,
 * item categories and the budget plan for the current financial year. These are sample figures to start from;
 * change them in the app. Safe to run again: rows are matched by name / year and never overwritten.
 * Run AFTER prisma/seed.js:  npx tsx prisma/seed-costing-setup.js
 */
const { newPrisma } = require('./seed-client');

const prisma = newPrisma();

const RATE_CARDS = [['Controls engineer', 1800], ['Mechanical engineer', 2000], ['Technician', 900], ['Project manager', 2200]];
const ITEM_CATEGORIES = ['Electronics', 'Mechanical', 'Cables', 'Packaging'];
const OVERHEADS = [['Factory and utilities', 3600000], ['Admin and support', 2500000]];
const BASE_HOURS = 14400;
const ENVELOPE = 50000000;

async function main() {
  const settings = await prisma.budgetSetting.findUnique({ where: { id: 1 } });
  const startMonth = settings?.fyStartMonth ?? 4;
  const now = new Date();
  // A financial year is named for the calendar year it starts in (2026 = FY 2026-27)
  const fy = now.getUTCMonth() + 1 >= startMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const fyStart = new Date(Date.UTC(fy, startMonth - 1, 1));

  let added = 0;
  for (const [role, rate] of RATE_CARDS) {
    if (!(await prisma.rateCard.findFirst({ where: { role } }))) {
      await prisma.rateCard.create({ data: { role, ratePerHour: rate, effectiveFrom: fyStart } });
      added++;
    }
  }
  for (const name of ITEM_CATEGORIES) {
    await prisma.itemCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const year of [fy, fy + 1]) {
    await prisma.overheadBase.upsert({ where: { fy: year }, update: {}, create: { fy: year, baseHours: BASE_HOURS } });
    for (const [name, pool] of OVERHEADS) {
      if (!(await prisma.overheadRate.findFirst({ where: { fy: year, name } }))) {
        await prisma.overheadRate.create({ data: { fy: year, name, poolAmount: pool } });
        added++;
      }
    }
  }
  await prisma.budgetPlan.upsert({
    where: { fy },
    update: {},
    create: { fy, name: `Budget FY ${fy}-${String(fy + 1).slice(2)}`, status: 'ACTIVE', envelope: ENVELOPE },
  });
  console.log(`Costing setup ready for FY ${fy}-${String(fy + 1).slice(2)}: ${RATE_CARDS.length} rate cards, ${ITEM_CATEGORIES.length} item categories, overhead pools, budget plan (${added} rows added).`);
}

main()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
