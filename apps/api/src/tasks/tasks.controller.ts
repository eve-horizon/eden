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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { EditorGuard } from '../common/editor.guard';
import { dbContext } from '../common/request.util';
import { TasksService } from './tasks.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  // -------------------------------------------------------------------------
  // Task CRUD
  // -------------------------------------------------------------------------

  @Get('projects/:projectId/tasks')
  list(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('release_id') releaseId?: string,
  ) {
    return this.tasks.list(dbContext(req), projectId, {
      status,
      priority,
      release_id: releaseId,
    });
  }

  @Post('projects/:projectId/tasks')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      title: string;
      display_id: string;
      user_story?: string;
      acceptance_criteria?: unknown;
      priority?: string;
      status?: string;
      device?: string;
      lifecycle?: string;
      source_type?: string;
      source_excerpt?: string;
    },
  ) {
    return this.tasks.create(dbContext(req), projectId, body);
  }

  @Get('tasks/:id')
  findById(@Req() req: Request, @Param('id') id: string) {
    return this.tasks.findById(dbContext(req), id);
  }

  @Patch('tasks/:id')
  @UseGuards(EditorGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.tasks.update(dbContext(req), id, body);
  }

  @Delete('tasks/:id')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.tasks.remove(dbContext(req), id);
  }

  // -------------------------------------------------------------------------
  // Step-task placements
  // -------------------------------------------------------------------------

  @Post('tasks/:id/place')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  place(
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    body: {
      step_id: string;
      persona_id: string;
      role?: string;
      sort_order?: number;
    },
  ) {
    return this.tasks.place(dbContext(req), id, body);
  }

  @Delete('step-tasks/:id')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStepTask(@Req() req: Request, @Param('id') id: string) {
    await this.tasks.removeStepTask(dbContext(req), id);
  }

  @Post('projects/:projectId/tasks/reorder')
  @UseGuards(EditorGuard)
  reorder(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { step_id: string; ids: string[] },
  ) {
    return this.tasks.reorder(dbContext(req), projectId, body.step_id, body.ids);
  }
}
