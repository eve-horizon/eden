import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { dbContext } from '../common/request.util';
import type { Request } from 'express';

/**
 * Thin proxy to Eve's org member search endpoint.
 *
 * The web app can't call Eve API directly (different origin). This endpoint
 * forwards the user's Bearer token and the org_id from the request context.
 *
 * Permission: requires Eve `orgs:members:read` (all org members have this).
 */
@Controller('org-members')
@UseGuards(AuthGuard)
export class OrgMembersController {
  @Get('search')
  async search(
    @Req() req: Request,
    @Query('q') query: string,
  ) {
    const ctx = dbContext(req);
    const eveApiUrl = process.env.EVE_API_URL || 'http://api.eve.lvh.me';
    const token =
      typeof req.headers.authorization === 'string'
        ? req.headers.authorization.replace(/^Bearer\s+/i, '')
        : '';

    if (!query || query.length < 2) {
      return { data: [] };
    }

    try {
      const res = await fetch(
        `${eveApiUrl}/orgs/${ctx.org_id}/members/search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) return { data: [] };
      return res.json();
    } catch {
      return { data: [] };
    }
  }
}
