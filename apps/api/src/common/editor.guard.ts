import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Blocks viewers from write operations.
 * Agents (job_token) bypass role checks entirely.
 */
@Injectable()
export class EditorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Agents bypass role checks
    if (request.user?.type === 'job_token') return true;

    // Viewers cannot write
    if (request.projectRole === 'viewer') {
      throw new ForbiddenException('Editor or owner role required');
    }

    return true;
  }
}
