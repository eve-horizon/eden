import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Activity {
  id: string;
  org_id: string;
  project_id: string;
  display_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

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

export interface ActivityWithSteps extends Activity {
  steps: Step[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ActivitiesService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * List all activities for a project, each with its steps nested inside,
   * ordered by sort_order.
   */
  async listByProject(
    ctx: DbContext,
    projectId: string,
  ): Promise<ActivityWithSteps[]> {
    return this.db.withClient(ctx, async (client) => {
      const { rows: activities } = await client.query<Activity>(
        `SELECT * FROM activities
          WHERE project_id = $1
          ORDER BY sort_order, created_at`,
        [projectId],
      );

      if (activities.length === 0) return [];

      const activityIds = activities.map((a) => a.id);

      const { rows: steps } = await client.query<Step>(
        `SELECT * FROM steps
          WHERE activity_id = ANY($1)
          ORDER BY sort_order, created_at`,
        [activityIds],
      );

      const stepsByActivity = new Map<string, Step[]>();
      for (const step of steps) {
        const list = stepsByActivity.get(step.activity_id) ?? [];
        list.push(step);
        stepsByActivity.set(step.activity_id, list);
      }

      return activities.map((activity) => ({
        ...activity,
        steps: stepsByActivity.get(activity.id) ?? [],
      }));
    });
  }

  /**
   * Create a new activity within a project.
   * Verifies the project exists (RLS ensures org scoping).
   */
  async create(
    ctx: DbContext,
    projectId: string,
    data: { name: string; display_id: string; sort_order?: number },
  ): Promise<Activity> {
    return this.db.withClient(ctx, async (client) => {
      // Verify project belongs to this org (RLS-scoped)
      const project = await client.query(
        'SELECT id FROM projects WHERE id = $1',
        [projectId],
      );
      if (project.rows.length === 0) {
        throw new NotFoundException('Project not found');
      }

      const { rows } = await client.query<Activity>(
        `INSERT INTO activities (org_id, project_id, display_id, name, sort_order)
              VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
        [ctx.org_id, projectId, data.display_id, data.name, data.sort_order ?? 0],
      );
      const activity = rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'activity', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          activity.id,
          ctx.user_id ?? null,
          JSON.stringify({ name: data.name, display_id: data.display_id }),
        ],
      );

      return activity;
    });
  }

  /**
   * Update an activity's mutable fields.
   */
  async update(
    ctx: DbContext,
    id: string,
    data: { name?: string; sort_order?: number },
  ): Promise<Activity> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Activity>(
        `UPDATE activities
            SET name       = COALESCE($1, name),
                sort_order = COALESCE($2, sort_order)
          WHERE id = $3
        RETURNING *`,
        [data.name ?? null, data.sort_order ?? null, id],
      );
      const activity = rows[0];
      if (!activity) throw new NotFoundException('Activity not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'activity', $3, 'update', $4, $5)`,
        [
          activity.org_id,
          activity.project_id,
          activity.id,
          ctx.user_id ?? null,
          JSON.stringify(data),
        ],
      );

      return activity;
    });
  }

  /**
   * Delete an activity (cascades to its steps via FK).
   */
  async remove(ctx: DbContext, id: string): Promise<void> {
    await this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Activity>(
        'SELECT * FROM activities WHERE id = $1',
        [id],
      );
      const activity = rows[0];
      if (!activity) throw new NotFoundException('Activity not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'activity', $3, 'delete', $4, $5)`,
        [
          activity.org_id,
          activity.project_id,
          activity.id,
          ctx.user_id ?? null,
          JSON.stringify({ name: activity.name, display_id: activity.display_id }),
        ],
      );

      await client.query('DELETE FROM activities WHERE id = $1', [id]);
    });
  }

  /**
   * Reorder activities within a project.
   * Accepts an ordered array of activity IDs — each receives sort_order
   * based on its array position.
   */
  async reorder(
    ctx: DbContext,
    projectId: string,
    ids: string[],
  ): Promise<void> {
    await this.db.withClient(ctx, async (client) => {
      // Verify project exists under this org
      const project = await client.query(
        'SELECT id FROM projects WHERE id = $1',
        [projectId],
      );
      if (project.rows.length === 0) {
        throw new NotFoundException('Project not found');
      }

      for (let i = 0; i < ids.length; i++) {
        await client.query(
          `UPDATE activities SET sort_order = $1
           WHERE id = $2 AND project_id = $3`,
          [i, ids[i], projectId],
        );
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'activity', $3, 'reorder', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          projectId,
          ctx.user_id ?? null,
          JSON.stringify({ ids }),
        ],
      );
    });
  }
}
