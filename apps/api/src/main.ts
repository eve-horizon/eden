import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { eveUserAuth, eveAuthConfig } from '@eve-horizon/auth';
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

  // Bridge req.eveUser -> req.user for NestJS guard/controller compatibility
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if ((req as any).eveUser) {
      (req as any).user = (req as any).eveUser;
    }
    next();
  });

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
