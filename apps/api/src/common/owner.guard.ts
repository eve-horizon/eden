import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Restricts the action to project owners only.
 * Agents (job_token) bypass role checks entirely.
 */
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Agents bypass role checks
    if (request.user?.type === 'job_token') return true;

    // Only owners can perform this action
    if (request.projectRole !== 'owner') {
      throw new ForbiddenException('Owner role required');
    }

    return true;
  }
}
