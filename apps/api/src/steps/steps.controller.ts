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
import { StepsService } from './steps.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class StepsController {
  constructor(private readonly steps: StepsService) {}

  @Get('activities/:activityId/steps')
  list(@Req() req: Request, @Param('activityId') activityId: string) {
    return this.steps.listByActivity(dbContext(req), activityId);
  }

  @Post('activities/:activityId/steps')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('activityId') activityId: string,
    @Body() body: { name: string; display_id: string; sort_order?: number },
  ) {
    return this.steps.create(dbContext(req), activityId, body);
  }

  @Post('activities/:activityId/steps/reorder')
  @UseGuards(EditorGuard)
  reorder(
    @Req() req: Request,
    @Param('activityId') activityId: string,
    @Body() body: { ids: string[] },
  ) {
    return this.steps.reorder(dbContext(req), activityId, body.ids);
  }

  @Patch('steps/:id')
  @UseGuards(EditorGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string; sort_order?: number },
  ) {
    return this.steps.update(dbContext(req), id, body);
  }

  @Delete('steps/:id')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.steps.remove(dbContext(req), id);
  }
}
