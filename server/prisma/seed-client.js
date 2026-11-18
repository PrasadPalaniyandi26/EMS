// Shared by the seed scripts. Prisma 7 needs the generated client plus a database adapter,
// and it no longer reads .env by itself. Run the seeds with: npx tsx prisma/seed.js
require('dotenv/config');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../src/generated/prisma/client');

module.exports = {
  newPrisma: () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }),
};
