import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// A positive number from the environment, or the default. Zero and junk fall back too: the pg driver treats 0 as "wait forever".
const ms = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: ms('DB_POOL_MAX', 10),
        // A request that cannot get a connection fails after this long instead of hanging
        connectionTimeoutMillis: ms('DB_CONNECT_TIMEOUT_MS', 10000),
        // A query that runs (or waits on a lock) longer than this is cancelled by the database
        statement_timeout: ms('DB_STATEMENT_TIMEOUT_MS', 30000),
        idleTimeoutMillis: ms('DB_IDLE_TIMEOUT_MS', 30000),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
