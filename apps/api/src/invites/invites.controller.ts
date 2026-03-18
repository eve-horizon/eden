import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { OwnerGuard } from '../common/owner.guard';
import { dbContext } from '../common/request.util';
import { InvitesService } from './invites.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /**
   * Invite a user to a project by email.
   * If the user is in the org, adds them directly.
   * If not, sends a platform invite email + records pending project invite.
   */
  @Post('projects/:projectId/invite')
  @UseGuards(OwnerGuard)
  @HttpCode(HttpStatus.CREATED)
  async invite(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { email: string; role: string },
  ) {
    const ctx = dbContext(req);
    const eveApiUrl = process.env.EVE_API_URL || 'http://api.eve.lvh.me';
    const authHeader = req.headers.authorization;
    const token = typeof authHeader === 'string'
      ? authHeader.replace(/^Bearer\s+/i, '')
      : '';

    return this.invites.inviteByEmail(ctx, projectId, body, eveApiUrl, token);
  }

  /**
   * List pending project invites (owner only).
   */
  @Get('projects/:projectId/invites')
  @UseGuards(OwnerGuard)
  list(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.invites.listPending(dbContext(req), projectId);
  }

  /**
   * Cancel a pending project invite (owner only).
   */
  @Delete('projects/:projectId/invites/:inviteId')
  @UseGuards(OwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @Req() req: Request,
    @Param('inviteId') inviteId: string,
  ) {
    return this.invites.cancel(dbContext(req), inviteId);
  }

  /**
   * Claim a pending invite for the current user.
   * Called automatically when opening a project.
   */
  @Post('projects/:projectId/claim-invite')
  async claim(@Req() req: Request, @Param('projectId') projectId: string) {
    const ctx = dbContext(req);
    const user = (req as any).user;
    return this.invites.claimIfPending(ctx, projectId, user.id, user.email);
  }
}
