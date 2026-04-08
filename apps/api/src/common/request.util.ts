import type { Request } from 'express';
import type { DbContext } from './database.service';

/**
 * Extract a DbContext from the authenticated request.
 * Assumes AuthGuard has already verified that req.user exists.
 */
export function dbContext(req: Request): DbContext {
  const user = (req as any).user;
  const projectRole = (req as any).projectRole as string | null | undefined;
  return {
    org_id: user.orgId,
    user_id: user.id,
    project_role: projectRole ?? null,
  };
}
