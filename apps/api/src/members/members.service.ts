import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface ProjectMemberRow {
  id: string;
  org_id: string;
  project_id: string;
  user_id: string;
  email: string | null;
  role: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

const VALID_ROLES = ['owner', 'editor', 'viewer'];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MembersService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Resolve the effective project role for a user.
   *
   * Precedence:
   *  1. Org-level owner or admin  -> 'owner' (inherited privilege)
   *  2. Explicit project_members row -> row.role
   *  3. Fallback -> 'viewer'
   */
  async resolveRole(
    ctx: DbContext,
    projectId: string,
    userId: string,
    orgRole?: string,
  ): Promise<string> {
    if (orgRole === 'owner' || orgRole === 'admin') {
      return 'owner';
    }

    const row = await this.db.queryOne<{ role: string }>(
      ctx,
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId],
    );

    return row?.role ?? 'viewer';
  }

  /**
   * Find a single member by ID.
   */
  async findById(ctx: DbContext, memberId: string): Promise<ProjectMemberRow> {
    const row = await this.db.queryOne<ProjectMemberRow>(
      ctx,
      'SELECT * FROM project_members WHERE id = $1',
      [memberId],
    );
    if (!row) throw new NotFoundException('Project member not found');
    return row;
  }

  /**
   * List all explicit members of a project.
   */
  async list(ctx: DbContext, projectId: string): Promise<ProjectMemberRow[]> {
    return this.db.query<ProjectMemberRow>(
      ctx,
      'SELECT * FROM project_members WHERE project_id = $1 ORDER BY created_at',
      [projectId],
    );
  }

  /**
   * Invite a user to a project with a given role.
   */
  async invite(
    ctx: DbContext,
    projectId: string,
    data: { user_id: string; email?: string; role: string },
  ): Promise<ProjectMemberRow> {
    if (!VALID_ROLES.includes(data.role)) {
      throw new BadRequestException(
        `Invalid role "${data.role}". Must be one of: ${VALID_ROLES.join(', ')}`,
      );
    }

    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<ProjectMemberRow>(
        `INSERT INTO project_members (org_id, project_id, user_id, email, role, invited_by)
              VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
        [
          ctx.org_id,
          projectId,
          data.user_id,
          data.email ?? null,
          data.role,
          ctx.user_id ?? null,
        ],
      );
      const member = rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'project_member', $3, 'invite', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          member.id,
          ctx.user_id ?? null,
          JSON.stringify({
            user_id: data.user_id,
            email: data.email ?? null,
            role: data.role,
          }),
        ],
      );

      return member;
    });
  }

  /**
   * Update the role of an existing project member.
   */
  async updateRole(
    ctx: DbContext,
    memberId: string,
    role: string,
  ): Promise<ProjectMemberRow> {
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException(
        `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`,
      );
    }

    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<ProjectMemberRow>(
        `UPDATE project_members SET role = $1 WHERE id = $2 RETURNING *`,
        [role, memberId],
      );
      const member = rows[0];
      if (!member) throw new NotFoundException('Project member not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'project_member', $3, 'update_role', $4, $5)`,
        [
          ctx.org_id,
          member.project_id,
          member.id,
          ctx.user_id ?? null,
          JSON.stringify({ role }),
        ],
      );

      return member;
    });
  }

  /**
   * Remove a member from a project.
   */
  async remove(ctx: DbContext, memberId: string): Promise<void> {
    return this.db.withClient(ctx, async (client) => {
      // Fetch before deleting so we can audit with context
      const { rows } = await client.query<ProjectMemberRow>(
        'SELECT * FROM project_members WHERE id = $1',
        [memberId],
      );
      const member = rows[0];
      if (!member) throw new NotFoundException('Project member not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'project_member', $3, 'remove', $4, $5)`,
        [
          ctx.org_id,
          member.project_id,
          member.id,
          ctx.user_id ?? null,
          JSON.stringify({
            user_id: member.user_id,
            email: member.email,
            role: member.role,
          }),
        ],
      );

      await client.query('DELETE FROM project_members WHERE id = $1', [
        memberId,
      ]);
    });
  }
}
