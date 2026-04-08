import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Release {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  target_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseSummary extends Release {
  task_count: number;
}

export interface ReleaseTaskSummary {
  id: string;
  display_id: string;
  title: string;
  priority: string | null;
  role: string | null;
  persona_color: string | null;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateReleaseInput {
  name: string;
  target_date?: string;
  status?: string;
}

export interface UpdateReleaseInput {
  name?: string;
  target_date?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReleasesService {
  constructor(private readonly db: DatabaseService) {}

  async list(ctx: DbContext, projectId: string): Promise<ReleaseSummary[]> {
    return this.db.query<ReleaseSummary>(
      ctx,
      `SELECT r.*,
              COALESCE(task_counts.task_count, 0) AS task_count
         FROM releases r
         LEFT JOIN (
           SELECT release_id, count(*)::int AS task_count
             FROM tasks
            WHERE project_id = $1
              AND release_id IS NOT NULL
            GROUP BY release_id
         ) task_counts ON task_counts.release_id = r.id
        WHERE r.project_id = $1
        ORDER BY r.target_date ASC NULLS LAST, r.created_at DESC`,
      [projectId],
    );
  }

  async findById(ctx: DbContext, id: string): Promise<Release> {
    const row = await this.db.queryOne<Release>(
      ctx,
      'SELECT * FROM releases WHERE id = $1',
      [id],
    );
    if (!row) throw new NotFoundException('Release not found');
    return row;
  }

  async listTasks(
    ctx: DbContext,
    id: string,
  ): Promise<ReleaseTaskSummary[]> {
    await this.findById(ctx, id);

    return this.db.query<ReleaseTaskSummary>(
      ctx,
      `SELECT t.id,
              t.display_id,
              t.title,
              t.priority,
              placement.role,
              placement.persona_color
         FROM tasks t
         LEFT JOIN LATERAL (
           SELECT st.role,
                  p.color AS persona_color
             FROM step_tasks st
             JOIN personas p ON p.id = st.persona_id
            WHERE st.task_id = t.id
            ORDER BY CASE st.role
                       WHEN 'owner' THEN 0
                       WHEN 'handoff' THEN 1
                       ELSE 2
                     END,
                     st.sort_order ASC,
                     st.created_at ASC
            LIMIT 1
         ) placement ON TRUE
        WHERE t.release_id = $1
        ORDER BY t.display_id ASC, t.created_at ASC`,
      [id],
    );
  }

  async create(
    ctx: DbContext,
    projectId: string,
    input: CreateReleaseInput,
  ): Promise<Release> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Release>(
        `INSERT INTO releases (org_id, project_id, name, target_date, status)
              VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
        [
          ctx.org_id,
          projectId,
          input.name,
          input.target_date ?? null,
          input.status ?? 'planning',
        ],
      );
      const release = rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'release', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          release.id,
          ctx.user_id ?? null,
          JSON.stringify({
            name: input.name,
            target_date: input.target_date ?? null,
            status: release.status,
          }),
        ],
      );

      return release;
    });
  }

  async update(
    ctx: DbContext,
    id: string,
    input: UpdateReleaseInput,
  ): Promise<Release> {
    await this.findById(ctx, id);

    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Release>(
        `UPDATE releases
            SET name        = COALESCE($1, name),
                target_date = COALESCE($2, target_date),
                status      = COALESCE($3, status)
          WHERE id = $4
      RETURNING *`,
        [
          input.name ?? null,
          input.target_date ?? null,
          input.status ?? null,
          id,
        ],
      );
      const release = rows[0];
      if (!release) throw new NotFoundException('Release not found');

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'release', $3, 'update', $4, $5)`,
        [
          ctx.org_id,
          release.project_id,
          release.id,
          ctx.user_id ?? null,
          JSON.stringify(input),
        ],
      );

      return release;
    });
  }

  async remove(ctx: DbContext, id: string): Promise<void> {
    const release = await this.findById(ctx, id);

    await this.db.withClient(ctx, async (client) => {
      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'release', $3, 'delete', $4, $5)`,
        [
          ctx.org_id,
          release.project_id,
          release.id,
          ctx.user_id ?? null,
          JSON.stringify({ name: release.name }),
        ],
      );

      await client.query('DELETE FROM releases WHERE id = $1', [id]);
    });
  }

  async assignTasks(
    ctx: DbContext,
    id: string,
    taskIds: string[],
  ): Promise<void> {
    const release = await this.findById(ctx, id);

    await this.db.withClient(ctx, async (client) => {
      for (const taskId of taskIds) {
        await client.query(
          'UPDATE tasks SET release_id = $1 WHERE id = $2',
          [id, taskId],
        );
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'release', $3, 'assign_tasks', $4, $5)`,
        [
          ctx.org_id,
          release.project_id,
          release.id,
          ctx.user_id ?? null,
          JSON.stringify({ task_ids: taskIds }),
        ],
      );
    });
  }

  async removeTask(
    ctx: DbContext,
    id: string,
    taskId: string,
  ): Promise<void> {
    const release = await this.findById(ctx, id);

    await this.db.withClient(ctx, async (client) => {
      await client.query(
        'UPDATE tasks SET release_id = NULL WHERE id = $1 AND release_id = $2',
        [taskId, id],
      );

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'release', $3, 'remove_task', $4, $5)`,
        [
          ctx.org_id,
          release.project_id,
          release.id,
          ctx.user_id ?? null,
          JSON.stringify({ task_id: taskId }),
        ],
      );
    });
  }
}
