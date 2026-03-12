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
   *
   * Transforms the server-side EveUser (camelCase, single org) into the
   * shape @eve-horizon/auth-react expects: snake_case fields + full
   * memberships array decoded from the JWT.
   */
  @Get('auth/me')
  @UseGuards(AuthGuard)
  me(@Req() req: Request) {
    const user = (req as any).user;

    // Decode JWT to recover the full org memberships list that the
    // server-side middleware discards (it only keeps the EVE_ORG_ID match).
    const authHeader = req.headers.authorization;
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    let memberships: Array<{ org_id: string; role: string }> | undefined;
    if (token) {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64').toString(),
        );
        if (Array.isArray(payload.orgs)) {
          memberships = payload.orgs.map(
            (o: { id: string; role: string }) => ({
              org_id: o.id,
              role: o.role,
            }),
          );
        }
      } catch {
        // Decode failure — continue without memberships
      }
    }

    return {
      user_id: user.id,
      email: user.email,
      org_id: user.orgId,
      role: user.role,
      ...(memberships ? { memberships } : {}),
    };
  }
}
