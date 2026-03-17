import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { EditorGuard } from '../common/editor.guard';
import { OwnerGuard } from '../common/owner.guard';
import { dbContext } from '../common/request.util';
import {
  ChangesetsService,
  CreateChangesetInput,
  ReviewDecision,
} from './changesets.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class ChangesetsController {
  constructor(private readonly changesets: ChangesetsService) {}

  @Get('projects/:projectId/changesets')
  list(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query('status') status?: string,
  ) {
    return this.changesets.list(dbContext(req), projectId, { status });
  }

  @Post('projects/:projectId/changesets')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: CreateChangesetInput,
  ) {
    return this.changesets.create(dbContext(req), projectId, body);
  }

  @Get('changesets/:id')
  findById(@Req() req: Request, @Param('id') id: string) {
    return this.changesets.findById(dbContext(req), id);
  }

  @Post('changesets/:id/accept')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.OK)
  accept(@Req() req: Request, @Param('id') id: string) {
    const projectRole = (req as any).projectRole as string | null;
    return this.changesets.accept(dbContext(req), id, projectRole);
  }

  @Post('changesets/:id/reject')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.OK)
  reject(@Req() req: Request, @Param('id') id: string) {
    return this.changesets.reject(dbContext(req), id);
  }

  @Post('changesets/:id/review')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.OK)
  review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { decisions: ReviewDecision[] },
  ) {
    const projectRole = (req as any).projectRole as string | null;
    return this.changesets.review(dbContext(req), id, body.decisions, projectRole);
  }

  // -------------------------------------------------------------------------
  // Pending approvals (WS2: Two-Stage Approval)
  // -------------------------------------------------------------------------

  @Get('projects/:projectId/pending-approvals')
  pendingApprovals(
    @Req() req: Request,
    @Param('projectId') projectId: string,
  ) {
    return this.changesets.pendingApprovals(dbContext(req), projectId);
  }

  @Post('projects/:projectId/approve-items')
  @UseGuards(OwnerGuard)
  @HttpCode(HttpStatus.OK)
  approveItems(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { item_ids: string[] },
  ) {
    return this.changesets.approveItems(dbContext(req), projectId, body.item_ids);
  }

  @Post('projects/:projectId/reject-items')
  @UseGuards(OwnerGuard)
  @HttpCode(HttpStatus.OK)
  rejectItems(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { item_ids: string[] },
  ) {
    return this.changesets.rejectItems(dbContext(req), projectId, body.item_ids);
  }
}
