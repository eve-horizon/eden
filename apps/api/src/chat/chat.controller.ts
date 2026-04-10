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
import {
  ChatGatewayService,
  type ChatRoutingMetadata,
} from './chat-gateway.service';

import type { Request } from 'express';

function bearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
}

@Controller()
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatGatewayService) {}

  @Get('projects/:projectId/chat/threads')
  listThreads(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.chat.listThreads(bearerToken(req), projectId);
  }

  @Post('projects/:projectId/chat/threads')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  createThread(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: {
      message: string;
      metadata?: ChatRoutingMetadata;
      new_thread?: boolean;
    },
  ) {
    const ctx = dbContext(req);
    const user = (req as any).user;
    return this.chat.createThread(
      body.message,
      ctx.user_id ?? 'anonymous',
      user?.email,
      bearerToken(req),
      projectId,
      body.metadata,
      body.new_thread,
    );
  }

  @Get('chat/threads/:threadId/messages')
  listMessages(
    @Req() req: Request,
    @Param('threadId') threadId: string,
  ) {
    return this.chat.listMessages(threadId, bearerToken(req));
  }

  @Post('chat/threads/:threadId/messages')
  @UseGuards(EditorGuard)
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @Req() req: Request,
    @Param('threadId') threadId: string,
    @Body() body: {
      message: string;
      metadata?: ChatRoutingMetadata;
      projectId?: string;
    },
  ) {
    const ctx = dbContext(req);
    const user = (req as any).user;
    return this.chat.sendMessage(
      threadId,
      body.message,
      ctx.user_id ?? 'anonymous',
      user?.email,
      bearerToken(req),
      body.projectId,
      body.metadata,
    );
  }

  @Get('chat/threads/:threadId/poll')
  pollMessages(
    @Req() req: Request,
    @Param('threadId') threadId: string,
  ) {
    return this.chat.listMessages(threadId, bearerToken(req));
  }
}
