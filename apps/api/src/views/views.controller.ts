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
import { CreateViewInput, UpdateViewInput, ViewsService } from './views.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class ViewsController {
  constructor(private readonly views: ViewsService) {}

  @Get('projects/:projectId/views')
  list(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.views.list(dbContext(req), projectId);
  }

  @Post('projects/:projectId/views')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: CreateViewInput,
  ) {
    return this.views.create(dbContext(req), projectId, body);
  }

  @Patch('views/:id')
  @UseGuards(EditorGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateViewInput,
  ) {
    return this.views.update(dbContext(req), id, body);
  }

  @Delete('views/:id')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.views.remove(dbContext(req), id);
  }
}
