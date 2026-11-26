import { INestApplication } from '@nestjs/common';
import { json, Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { loginWhere } from '../auth/login-identity';

// The limits that depend on knowing who is calling. Call before the app starts listening.
export function applyEdgeSecurity(app: INestApplication) {
  // The proxy in front runs on this machine. It must overwrite X-Forwarded-For with the caller's real address:
  // Next's /api rewrite passes a caller's own header through, so it is not enough on its own.
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');

  const prisma = app.get(PrismaService);
  // The account behind the typed name; an unknown name is counted as typed
  const account = async (req: Request) => {
    const typed = typeof req.body?.username === 'string' ? req.body.username : '';
    const user = typed ? await prisma.user.findFirst({ where: loginWhere(typed), select: { id: true } }) : null;
    return user ? `user:${user.id}` : `name:${typed.trim().toLowerCase()}`;
  };
  const address = (req: Request) => ipKeyGenerator(req.ip ?? '');

  // Only failed sign-ins count, over 15 minutes
  const failures = (limit: number, keyGenerator: (req: Request) => string | Promise<string>) => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    skipSuccessfulRequests: true,
    keyGenerator,
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, data: null, error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many failed sign-ins. Wait 15 minutes and try again.' } },
  });

  // The account name is needed before Nest reads the body. Wrapped, because Nest skips its own parser for every
  // route when it finds a middleware still named jsonParser.
  const parse = json({ limit: '10kb' });
  const loginBody: typeof parse = (req, res, next) => parse(req, res, next);
  app.use(
    '/api/v1/auth/login', loginBody,
    failures(50, address),
    failures(10, async (req) => `${address(req)}|${await account(req)}`),
    // Whatever address is claimed. The cost: someone failing on purpose can pause one account's sign-in for 15 minutes.
    failures(30, account),
  );
}
