import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Step {
  id: string;
  org_id: string;
  project_id: string;
  activity_id: string;
  display_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ActivityRow {
  id: string;
  org_id: string;
  project_id: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class StepsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * List steps for an activity, ordered by sort_order.
   */
  async listByActivity(ctx: DbContext, activityId: string): Promise<Step[]> {
    return this.db.withClient(ctx, async (client) => {
      // Verify the activity exists (RLS ensures org scoping)
      const activity = await client.query(
        'SELECT id FROM activities WHERE id = $1',
        [activityId],
      );
      if (activity.rows.length === 0) {
        throw new NotFoundException('Activity not found');
      }

      const { rows } = await client.query<Step>(
        `SELECT * FROM steps
         WHERE activity_id = $1
         ORDER BY sort_order, created_at`,
        [activityId],
      );
      return rows;
    });
  }

  /**
   * Create a new step under an activity.
   * Denormalizes project_id from the parent activity.
   */
  async create(
    ctx: DbContext,
    activityId: string,
    data: { name: string; display_id: string; sort_order?: number },
  ): Promise<Step> {
    return this.db.withClient(ctx, async (client) => {
      // Look up the activity to get project_id and verify org access
      const activity = await client.query<ActivityRow>(
        'SELECT id, org_id, project_id FROM activities WHERE id = $1',
        [activityId],
      );
      if (activity.rows.length === 0) {
        throw new NotFoundException('Activity not found');
      }

      const projectId = activity.rows[0].project_id;

      const { rows } = await client.query<Step>(
        `INSERT INTO steps (org_id, project_id, activity_id, display_id, name, sort_order)
              VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
        [
          ctx.org_id,
          projectId,
          activityId,
          data.display_id,
          data.name,
          data.sort_order ?? 0,
        ],
      );
      const step = rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'step', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          step.id,
          ctx.user_id ?? null,
          JSON.stringify({
            name: data.name,
            display_id: data.display_id,
            activity_id: activityId,
          }),
        ],
      );

      return step;
    });
  }

  /**
   * Update a step's mutable fields.
   */
  async update(
    ctx: DbContext,
    id: string,
    data: { name?: string; sort_order?: number },
  ): Promise<Step> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Step>(
        `UPDATE steps
            SET name       = COALESCE($1, name),
                sort_order = COALESCE($2, sort_order)
          WHERE id = $3
        RETURNING *`,
        [data.name ?? null, data.sort_order ?? null, id],
      );
      const step = rows[0];
      if (!step) throw new NotFoundException('Step not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'step', $3, 'update', $4, $5)`,
        [
          step.org_id,
          step.project_id,
          step.id,
          ctx.user_id ?? null,
          JSON.stringify(data),
        ],
      );

      return step;
    });
  }

  /**
   * Delete a step.
   */
  async remove(ctx: DbContext, id: string): Promise<void> {
    await this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Step>(
        'SELECT * FROM steps WHERE id = $1',
        [id],
      );
      const step = rows[0];
      if (!step) throw new NotFoundException('Step not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'step', $3, 'delete', $4, $5)`,
        [
          step.org_id,
          step.project_id,
          step.id,
          ctx.user_id ?? null,
          JSON.stringify({
            name: step.name,
            display_id: step.display_id,
            activity_id: step.activity_id,
          }),
        ],
      );

      await client.query('DELETE FROM steps WHERE id = $1', [id]);
    });
  }

  /**
   * Reorder steps within an activity.
   * Accepts an ordered array of step IDs — each receives sort_order
   * based on its array position.
   */
  async reorder(
    ctx: DbContext,
    activityId: string,
    ids: string[],
  ): Promise<void> {
    await this.db.withClient(ctx, async (client) => {
      // Verify activity exists under this org
      const activity = await client.query<ActivityRow>(
        'SELECT id, project_id FROM activities WHERE id = $1',
        [activityId],
      );
      if (activity.rows.length === 0) {
        throw new NotFoundException('Activity not found');
      }

      const projectId = activity.rows[0].project_id;

      for (let i = 0; i < ids.length; i++) {
        await client.query(
          `UPDATE steps SET sort_order = $1
           WHERE id = $2 AND activity_id = $3`,
          [i, ids[i], activityId],
        );
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'step', $3, 'reorder', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          activityId,
          ctx.user_id ?? null,
          JSON.stringify({ ids }),
        ],
      );
    });
  }
}
