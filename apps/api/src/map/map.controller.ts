import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { dbContext } from '../common/request.util';
import { MapService } from './map.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class MapController {
  constructor(private readonly map: MapService) {}

  @Get('projects/:projectId/map')
  getMap(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query('persona') persona?: string,
    @Query('release') release?: string,
  ) {
    return this.map.getMap(dbContext(req), projectId, { persona, release });
  }
}
