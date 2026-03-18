import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';
import { MembersService } from '../members/members.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface ProjectInviteRow {
  id: string;
  org_id: string;
  project_id: string;
  email: string;
  role: string;
  eve_invite_code: string | null;
  status: string;
  invited_by: string;
  created_at: string;
  claimed_at: string | null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly members: MembersService,
  ) {}

  /**
   * Invite a user to a project by email.
   *
   * If the user is already in the Eve org, add them as a project member directly.
   * If not, create an Eve org invite (sends email) and record a pending project invite.
   *
   * The caller's Eve JWT is forwarded to Eve API calls.
   */
  async inviteByEmail(
    ctx: DbContext,
    projectId: string,
    body: { email: string; role: string },
    eveApiUrl: string,
    eveAuthToken: string,
  ): Promise<{ status: 'added' | 'invited'; user_id?: string; invite_code?: string }> {
    const email = body.email.trim().toLowerCase();
    const role = body.role;

    if (!['owner', 'editor', 'viewer'].includes(role)) {
      throw new BadRequestException(`Invalid role "${role}"`);
    }

    // 1. Check if user is already in the org
    const searchRes = await fetch(
      `${eveApiUrl}/orgs/${ctx.org_id}/members/search?q=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${eveAuthToken}` } },
    );

    if (searchRes.ok) {
      const data = await searchRes.json() as { data: Array<{ user_id: string; email: string }> };
      const match = data.data?.find(
        (m) => m.email.toLowerCase() === email,
      );

      if (match) {
        // User is in the org — add to project directly
        await this.members.invite(ctx, projectId, {
          user_id: match.user_id,
          email,
          role,
        });
        return { status: 'added', user_id: match.user_id };
      }
    }

    // 2. User is NOT in the org — create Eve org invite + project invite
    const inviteRes = await fetch(`${eveApiUrl}/orgs/${ctx.org_id}/invites`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${eveAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        role: 'member',
        send_email: true,
        redirect_to: process.env.EDEN_WEB_URL
          ? `${process.env.EDEN_WEB_URL}/?project=${projectId}`
          : undefined,
        app_context: { app: 'eden', project_id: projectId, role },
      }),
    });

    if (!inviteRes.ok) {
      const errText = await inviteRes.text();
      this.logger.error(`Eve invite creation failed: ${inviteRes.status} ${errText}`);
      throw new BadRequestException(`Failed to create platform invite: ${inviteRes.status}`);
    }

    const inviteData = await inviteRes.json() as { invite_code: string };

    // Record pending project invite
    await this.db.withClient(ctx, async (client) => {
      await client.query(
        `INSERT INTO project_invites (org_id, project_id, email, role, eve_invite_code, invited_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (project_id, email) DO UPDATE
         SET role = EXCLUDED.role, eve_invite_code = EXCLUDED.eve_invite_code, status = 'pending'`,
        [ctx.org_id, projectId, email, role, inviteData.invite_code, ctx.user_id],
      );
    });

    return { status: 'invited', invite_code: inviteData.invite_code };
  }

  /**
   * List pending invites for a project.
   */
  async listPending(ctx: DbContext, projectId: string): Promise<ProjectInviteRow[]> {
    return this.db.query<ProjectInviteRow>(
      ctx,
      `SELECT * FROM project_invites
       WHERE project_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [projectId],
    );
  }

  /**
   * Cancel a pending project invite.
   */
  async cancel(ctx: DbContext, inviteId: string): Promise<void> {
    await this.db.withClient(ctx, async (client) => {
      await client.query(
        `DELETE FROM project_invites WHERE id = $1 AND status = 'pending'`,
        [inviteId],
      );
    });
  }

  /**
   * Claim any pending invite for this user's email.
   * Called when a user first accesses a project after onboarding.
   * Converts the pending invite into a project_members row.
   */
  async claimIfPending(
    ctx: DbContext,
    projectId: string,
    userId: string,
    email: string,
  ): Promise<{ claimed: boolean; role?: string }> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<ProjectInviteRow>(
        `SELECT * FROM project_invites
         WHERE project_id = $1 AND email = $2 AND status = 'pending'
         LIMIT 1`,
        [projectId, email.toLowerCase()],
      );

      if (!rows[0]) return { claimed: false };

      const invite = rows[0];

      // Add as project member
      await this.members.invite(ctx, projectId, {
        user_id: userId,
        email,
        role: invite.role,
      });

      // Mark invite as claimed
      await client.query(
        `UPDATE project_invites SET status = 'claimed', claimed_at = NOW() WHERE id = $1`,
        [invite.id],
      );

      this.logger.log(
        `Claimed project invite ${invite.id} — user ${userId} added to project ${projectId} as ${invite.role}`,
      );

      return { claimed: true, role: invite.role };
    });
  }
}
