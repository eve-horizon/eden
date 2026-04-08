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
import {
  CreateReleaseInput,
  ReleasesService,
  UpdateReleaseInput,
} from './releases.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Get('projects/:projectId/releases')
  list(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.releases.list(dbContext(req), projectId);
  }

  @Get('releases/:id/tasks')
  listTasks(@Req() req: Request, @Param('id') id: string) {
    return this.releases.listTasks(dbContext(req), id);
  }

  @Post('projects/:projectId/releases')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: CreateReleaseInput,
  ) {
    return this.releases.create(dbContext(req), projectId, body);
  }

  @Patch('releases/:id')
  @UseGuards(EditorGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateReleaseInput,
  ) {
    return this.releases.update(dbContext(req), id, body);
  }

  @Delete('releases/:id')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.releases.remove(dbContext(req), id);
  }

  @Post('releases/:id/tasks')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.OK)
  assignTasks(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { task_ids: string[] },
  ) {
    return this.releases.assignTasks(dbContext(req), id, body.task_ids);
  }

  @Delete('releases/:id/tasks/:taskId')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
  ) {
    await this.releases.removeTask(dbContext(req), id, taskId);
  }
}
