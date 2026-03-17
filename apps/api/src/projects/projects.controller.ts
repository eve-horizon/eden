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
import { OwnerGuard } from '../common/owner.guard';
import { dbContext } from '../common/request.util';
import { ProjectsService } from './projects.service';

import type { Request } from 'express';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.projects.list(dbContext(req));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: Request, @Body() body: { name: string; slug: string }) {
    return this.projects.create(dbContext(req), body);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.projects.findById(dbContext(req), id);
  }

  @Patch(':id')
  @UseGuards(OwnerGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { name?: string },
  ) {
    return this.projects.update(dbContext(req), id, body);
  }

  @Delete(':id')
  @UseGuards(OwnerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.projects.remove(dbContext(req), id);
  }
}
