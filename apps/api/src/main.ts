import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { eveAuth, eveAuthConfig } from '@eve-horizon/auth';
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
  // Eve Auth (unified) — handles both user and agent job tokens.
  // Sets req.eveIdentity with normalized shape including isAgent flag.
  // ---------------------------------------------------------------------------
  app.use(eveAuth());

  // ---------------------------------------------------------------------------
  // Bridge req.eveIdentity → req.user for NestJS guard compatibility
  // ---------------------------------------------------------------------------
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const identity = (req as any).eveIdentity;
    if (identity) {
      (req as any).user = {
        id: identity.id,
        email: identity.email,
        orgId: identity.orgId,
        role: identity.role,
        // Guards check this to bypass role checks for agents
        ...(identity.isAgent ? { type: 'job_token' } : {}),
        ...(identity.jobId ? { jobId: identity.jobId } : {}),
        ...(identity.agentSlug ? { agentSlug: identity.agentSlug } : {}),
        ...(identity.projectId ? { projectId: identity.projectId } : {}),
      };

      // Allow the SPA to override the active org via header (org switcher).
      // The user is already authenticated — the frontend only sends org IDs
      // from the user's own membership list.
      const orgOverride = req.headers['x-eve-org-id'];
      if (typeof orgOverride === 'string' && orgOverride) {
        (req as any).user.orgId = orgOverride;
      }
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
