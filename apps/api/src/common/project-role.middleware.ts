import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { DatabaseService } from './database.service';
import { dbContext } from './request.util';

/**
 * Resolves `req.projectRole` for project-scoped routes.
 *
 * Precedence:
 *  1. No projectId in params          → null (non-project route)
 *  2. Agent (job_token)                → null (agents bypass role checks)
 *  3. Org-level owner or admin         → 'owner' (inherited privilege)
 *  4. Explicit project_members row     → row.role
 *  5. Fallback                         → 'viewer'
 */
@Injectable()
export class ProjectRoleMiddleware implements NestMiddleware {
  constructor(private readonly db: DatabaseService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const projectId = req.params.projectId;

    // Non-project route — nothing to resolve
    if (!projectId) {
      (req as any).projectRole = null;
      return next();
    }

    // Agents bypass role checks entirely
    if ((req as any).user?.type === 'job_token') {
      (req as any).projectRole = null;
      return next();
    }

    // Org-level owners and admins inherit project owner rights
    const orgRole = (req as any).user?.role;
    if (orgRole === 'owner' || orgRole === 'admin') {
      (req as any).projectRole = 'owner';
      return next();
    }

    // Look up explicit project membership
    const ctx = dbContext(req);
    const row = await this.db.queryOne<{ role: string }>(
      ctx,
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, ctx.user_id],
    );

    (req as any).projectRole = row?.role ?? 'viewer';
    return next();
  }
}
