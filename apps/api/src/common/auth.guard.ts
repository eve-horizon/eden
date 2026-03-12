import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { EveUser } from '@eve-horizon/auth';

/**
 * NestJS guard that enforces authentication.
 *
 * By the time a request reaches this guard, eveUserAuth() middleware has
 * already run. If a valid token was present, req.user (bridged from
 * req.eveUser in main.ts) contains the authenticated EveUser.
 *
 * This guard simply rejects requests where that user is missing.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: EveUser | undefined = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    return true;
  }
}
