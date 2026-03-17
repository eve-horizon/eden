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
import { PersonasService } from './personas.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class PersonasController {
  constructor(private readonly personas: PersonasService) {}

  @Get('projects/:projectId/personas')
  list(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.personas.listByProject(dbContext(req), projectId);
  }

  @Post('projects/:projectId/personas')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: { code: string; name: string; color: string },
  ) {
    return this.personas.create(dbContext(req), projectId, body);
  }

  @Patch('personas/:id')
  @UseGuards(EditorGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string; color?: string },
  ) {
    return this.personas.update(dbContext(req), id, body);
  }

  @Delete('personas/:id')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.personas.remove(dbContext(req), id);
  }
}
