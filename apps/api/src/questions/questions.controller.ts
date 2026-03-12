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
import { dbContext } from '../common/request.util';
import {
  CreateQuestionInput,
  QuestionsService,
  UpdateQuestionInput,
} from './questions.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('projects/:projectId/questions')
  list(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.questions.list(dbContext(req), projectId, {
      status,
      category,
    });
  }

  @Post('projects/:projectId/questions')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: CreateQuestionInput,
  ) {
    return this.questions.create(dbContext(req), projectId, body);
  }

  @Get('questions/:id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.questions.findById(dbContext(req), id);
  }

  @Patch('questions/:id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateQuestionInput,
  ) {
    return this.questions.update(dbContext(req), id, body);
  }

  @Delete('questions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: Request, @Param('id') id: string) {
    await this.questions.remove(dbContext(req), id);
  }
}
