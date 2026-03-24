import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Blocks agent (job_token) requests from direct entity mutations.
 *
 * Agents MUST use changesets to modify the story map. This guard prevents
 * agents from bypassing the review gate by calling direct creation endpoints
 * (POST /tasks, POST /personas, POST /activities, POST /steps).
 *
 * Human users are not affected — they can still use direct endpoints.
 */
@Injectable()
export class ChangesetOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    if (request.user?.type === 'job_token') {
      throw new ForbiddenException(
        'Agents must use changesets for map mutations. Use POST /projects/:id/changesets instead.',
      );
    }

    return true;
  }
}
