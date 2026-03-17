import {
  Body,
  Controller,
  Delete,
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
import { EditorGuard } from '../common/editor.guard';
import { dbContext } from '../common/request.util';
import { ActivitiesService } from './activities.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('projects/:projectId/activities')
  list(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.activities.listByProject(dbContext(req), projectId);
  }

  @Post('projects/:projectId/activities')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { name: string; display_id: string; sort_order?: number },
  ) {
    return this.activities.create(dbContext(req), projectId, body);
  }

  @Post('projects/:projectId/activities/reorder')
  @UseGuards(EditorGuard)
  reorder(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { ids: string[] },
  ) {
    return this.activities.reorder(dbContext(req), projectId, body.ids);
  }

  @Patch('activities/:id')
  @UseGuards(EditorGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string; sort_order?: number },
  ) {
    return this.activities.update(dbContext(req), id, body);
  }

  @Delete('activities/:id')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.activities.remove(dbContext(req), id);
  }
}
