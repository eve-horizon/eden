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
import { dbContext } from '../common/request.util';
import { WizardService } from './wizard.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class WizardController {
  constructor(private readonly wizard: WizardService) {}

  @Post('projects/:projectId/generate-map')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  generateMap(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      description?: string;
      audience?: string;
      capabilities?: string;
      constraints?: string;
      source_id?: string;
    },
  ) {
    return this.wizard.generateMap(dbContext(req), projectId, body);
  }

  @Get('projects/:projectId/generate-map/status')
  getStatus(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query('job_id') jobId: string,
  ) {
    const projectRole = (req as any).projectRole as string | null;
    return this.wizard.getGenerateStatus(
      dbContext(req),
      projectId,
      jobId,
      projectRole,
    );
  }
}
