import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { OwnerGuard } from '../common/owner.guard';
import { dbContext } from '../common/request.util';
import { MembersService } from './members.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('projects/:projectId/members')
  list(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.members.list(dbContext(req), projectId);
  }

  @Post('projects/:projectId/members')
  @UseGuards(OwnerGuard)
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { user_id: string; email?: string; role: string },
  ) {
    return this.members.invite(dbContext(req), projectId, body);
  }

  @Patch('project-members/:memberId')
  async updateRole(
    @Req() req: Request,
    @Param('memberId') memberId: string,
    @Body() body: { role: string },
  ) {
    await this.requireOwnerForMember(req, memberId);
    return this.members.updateRole(dbContext(req), memberId, body.role);
  }

  @Delete('project-members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('memberId') memberId: string) {
    await this.requireOwnerForMember(req, memberId);
    await this.members.remove(dbContext(req), memberId);
  }

  @Get('projects/:projectId/my-role')
  async myRole(@Req() req: Request, @Param('projectId') projectId: string) {
    const ctx = dbContext(req);
    const orgRole = (req as any).user?.role;
    const role = await this.members.resolveRole(
      ctx,
      projectId,
      ctx.user_id!,
      orgRole,
    );
    return { role };
  }

  /**
   * For routes like /project-members/:memberId that lack :projectId in the URL,
   * look up the member to find its project, then resolve the caller's role.
   */
  private async requireOwnerForMember(req: Request, memberId: string) {
    const user = (req as any).user;

    // Agents bypass
    if (user?.type === 'job_token') return;

    // Org owners/admins are always project owners
    if (user?.role === 'owner' || user?.role === 'admin') return;

    // Look up the member to find its project
    const ctx = dbContext(req);
    const member = await this.members.findById(ctx, memberId);
    const role = await this.members.resolveRole(
      ctx,
      member.project_id,
      ctx.user_id!,
      user?.role,
    );
    if (role !== 'owner') {
      throw new ForbiddenException('Owner role required');
    }
  }
}
