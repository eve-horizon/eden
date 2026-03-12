import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { getDbStatus } from '../db';
import { AuthGuard } from '../common/auth.guard';

import type { Request } from 'express';

@Controller()
export class HealthController {
  /**
   * GET /health — unauthenticated liveness probe.
   * Returns 200 with DB connectivity status.
   */
  @Get('health')
  async health() {
    const db = await getDbStatus();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: {
        connected: db.connected,
        ...(db.version ? { version: db.version } : {}),
        ...(db.error ? { error: db.error } : {}),
      },
    };
  }

  /**
   * GET /auth/me — returns the authenticated user's identity.
   * Protected by AuthGuard; returns 401 if no valid token.
   */
  @Get('auth/me')
  @UseGuards(AuthGuard)
  me(@Req() req: Request) {
    return (req as any).user;
  }
}
