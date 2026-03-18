import {
  Controller,
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
import { NotificationsService } from './notifications.service';

import type { Request } from 'express';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const ctx = dbContext(req);
    return this.notifications.list(
      ctx,
      ctx.user_id!,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  @Patch(':id/read')
  markRead(@Req() req: Request, @Param('id') id: string) {
    return this.notifications.markRead(dbContext(req), id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Req() req: Request) {
    const ctx = dbContext(req);
    const count = await this.notifications.markAllRead(ctx, ctx.user_id!);
    return { updated: count };
  }
}
