import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { EditorGuard } from '../common/editor.guard';
import { dbContext } from '../common/request.util';
import { ReviewsService } from './reviews.service';

import type { Request } from 'express';

@Controller()
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('projects/:projectId/reviews')
  list(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.reviews.list(dbContext(req), projectId);
  }

  @Get('reviews/:id')
  findById(@Req() req: Request, @Param('id') id: string) {
    return this.reviews.findById(dbContext(req), id);
  }

  @Post('projects/:projectId/reviews')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      title?: string;
      synthesis?: string;
      status?: string;
      eve_job_id?: string;
      expert_opinions?: { expert_slug: string; summary: string }[];
    },
  ) {
    return this.reviews.create(dbContext(req), projectId, body);
  }
}
