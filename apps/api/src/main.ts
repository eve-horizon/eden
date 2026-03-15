import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { eveUserAuth, eveAuthConfig, verifyEveToken } from '@eve-horizon/auth';
import { getDbStatus } from './db';

import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ---------------------------------------------------------------------------
  // CORS — comma-separated origins from env, or permissive in dev
  // ---------------------------------------------------------------------------
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });

  // ---------------------------------------------------------------------------
  // Eve Auth — non-blocking token verification on every request
  // Attaches req.eveUser when a valid token is present
  // ---------------------------------------------------------------------------
  app.use(eveUserAuth());

  // ---------------------------------------------------------------------------
  // Eve Agent Auth — verifies job/service tokens from Eve agents.
  // Attaches req.agent when a valid job token is present.
  // Non-blocking: falls through silently if no token or invalid token.
  // ---------------------------------------------------------------------------
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    if (!(req as any).eveUser) {
      const authHeader = req.headers.authorization;
      const token = typeof authHeader === 'string'
        ? authHeader.replace(/^Bearer\s+/i, '')
        : undefined;
      if (token) {
        try {
          (req as any).agent = await verifyEveToken(token);
        } catch {
          // Not a valid Eve token — continue without agent context
        }
      }
    }
    next();
  });

  // Bridge req.eveUser or req.agent -> req.user for NestJS guard compatibility
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if ((req as any).eveUser) {
      (req as any).user = { ...(req as any).eveUser };

      // Allow the SPA to override the active org via header (org switcher).
      // The user is already authenticated — the frontend only sends org IDs
      // from the user's own membership list.
      const orgOverride = req.headers['x-eve-org-id'];
      if (typeof orgOverride === 'string' && orgOverride) {
        (req as any).user.orgId = orgOverride;
      }
    } else if ((req as any).agent) {
      // Map Eve agent/job token claims to the user shape AuthGuard expects
      const agent = (req as any).agent;
      (req as any).user = {
        id: agent.user_id || agent.job_id || 'agent',
        orgId: agent.org_id,
        email: agent.email || `${agent.job_id}@eve.agent`,
        type: agent.type,
        jobId: agent.job_id,
        projectId: agent.project_id,
      };
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // Dev auth bypass — inject a fake user when no real token present.
  // Only active when DEV_AUTH_BYPASS=1 (never in production).
  // ---------------------------------------------------------------------------
  if (process.env.DEV_AUTH_BYPASS === '1') {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (!(req as any).user) {
        (req as any).user = {
          id: 'dev-user',
          orgId: 'dev-org',
          email: 'dev@localhost',
        };
      }
      next();
    });
  }

  // ---------------------------------------------------------------------------
  // Auth config endpoint — returns Eve SSO/API URLs for SPA bootstrap
  // Mounted directly on Express before NestJS routing so it stays fast and
  // framework-independent, matching the @eve-horizon/auth README pattern.
  // ---------------------------------------------------------------------------
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/auth/config', eveAuthConfig());

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);

  const dbStatus = await getDbStatus();
  console.log(`Eden API listening on :${port}`);
  console.log(`Database: ${dbStatus.connected ? 'connected' : 'unavailable'}`);
}

bootstrap();
