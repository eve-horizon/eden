import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

// ---------------------------------------------------------------------------
// Row types — mirror the DB schema
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  org_id: string;
  project_id: string;
  display_id: string;
  title: string;
  user_story: string | null;
  acceptance_criteria: unknown;
  priority: string;
  status: string;
  device: string | null;
  release_id: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StepTaskRow {
  id: string;
  org_id: string;
  step_id: string;
  task_id: string;
  persona_id: string;
  role: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StepTaskPlacement extends StepTaskRow {
  step_name: string;
  step_display_id: string;
  persona_name: string;
  persona_code: string;
}

export interface TaskDetail extends TaskRow {
  placements: StepTaskPlacement[];
}

// ---------------------------------------------------------------------------
// Filter params for task listing
// ---------------------------------------------------------------------------

export interface TaskListFilter {
  status?: string;
  priority?: string;
  release_id?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  // -------------------------------------------------------------------------
  // Tasks CRUD
  // -------------------------------------------------------------------------

  async list(
    ctx: DbContext,
    projectId: string,
    filter: TaskListFilter,
  ): Promise<TaskRow[]> {
    const conditions = ['t.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filter.status) {
      params.push(filter.status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (filter.priority) {
      params.push(filter.priority);
      conditions.push(`t.priority = $${params.length}`);
    }
    if (filter.release_id) {
      params.push(filter.release_id);
      conditions.push(`t.release_id = $${params.length}`);
    }

    const sql = `
      SELECT t.*
        FROM tasks t
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC
    `;

    return this.db.query<TaskRow>(ctx, sql, params);
  }

  async findById(ctx: DbContext, id: string): Promise<TaskDetail> {
    const task = await this.db.queryOne<TaskRow>(
      ctx,
      'SELECT * FROM tasks WHERE id = $1',
      [id],
    );

    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    const placements = await this.db.query<StepTaskPlacement>(
      ctx,
      `SELECT st.*,
              s.name       AS step_name,
              s.display_id AS step_display_id,
              p.name       AS persona_name,
              p.code       AS persona_code
         FROM step_tasks st
         JOIN steps    s ON s.id = st.step_id
         JOIN personas p ON p.id = st.persona_id
        WHERE st.task_id = $1
        ORDER BY st.sort_order`,
      [id],
    );

    return { ...task, placements };
  }

  async create(
    ctx: DbContext,
    projectId: string,
    data: {
      title: string;
      display_id: string;
      user_story?: string;
      acceptance_criteria?: unknown;
      priority?: string;
      status?: string;
      device?: string;
    },
  ): Promise<TaskRow> {
    return this.db.withClient(ctx, async (client) => {
      const result = await client.query<TaskRow>(
        `INSERT INTO tasks (org_id, project_id, display_id, title, user_story,
                            acceptance_criteria, priority, status, device)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
        [
          ctx.org_id,
          projectId,
          data.display_id,
          data.title,
          data.user_story ?? null,
          JSON.stringify(data.acceptance_criteria ?? []),
          data.priority ?? 'medium',
          data.status ?? 'draft',
          data.device ?? null,
        ],
      );

      const task = result.rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'task', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          task.id,
          ctx.user_id ?? null,
          JSON.stringify({ title: data.title, display_id: data.display_id }),
        ],
      );

      return task;
    });
  }

  async update(
    ctx: DbContext,
    id: string,
    data: Record<string, unknown>,
  ): Promise<TaskRow> {
    // Allowlist of mutable columns
    const allowed = new Set([
      'title',
      'display_id',
      'user_story',
      'acceptance_criteria',
      'priority',
      'status',
      'device',
      'release_id',
    ]);

    const setClauses: string[] = [];
    const params: unknown[] = [id];

    for (const [key, value] of Object.entries(data)) {
      if (!allowed.has(key)) continue;
      params.push(key === 'acceptance_criteria' ? JSON.stringify(value) : value);
      setClauses.push(`${key} = $${params.length}`);
    }

    if (setClauses.length === 0) {
      // Nothing to update — just return the current row
      return this.requireTask(ctx, id);
    }

    return this.db.withClient(ctx, async (client) => {
      const result = await client.query<TaskRow>(
        `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
        params,
      );

      const task = result.rows[0];
      if (!task) {
        throw new NotFoundException(`Task ${id} not found`);
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'task', $3, 'update', $4, $5)`,
        [
          task.org_id,
          task.project_id,
          task.id,
          ctx.user_id ?? null,
          JSON.stringify({ fields: Object.keys(data).filter((k) => allowed.has(k)) }),
        ],
      );

      return task;
    });
  }

  async remove(ctx: DbContext, id: string): Promise<void> {
    const task = await this.requireTask(ctx, id);

    await this.db.withClient(ctx, async (client) => {
      await client.query('DELETE FROM tasks WHERE id = $1', [id]);

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'task', $3, 'delete', $4, $5)`,
        [
          task.org_id,
          task.project_id,
          task.id,
          ctx.user_id ?? null,
          JSON.stringify({ title: task.title, display_id: task.display_id }),
        ],
      );
    });
  }

  // -------------------------------------------------------------------------
  // Step-task placements
  // -------------------------------------------------------------------------

  async place(
    ctx: DbContext,
    taskId: string,
    data: {
      step_id: string;
      persona_id: string;
      role?: string;
      sort_order?: number;
    },
  ): Promise<StepTaskRow> {
    const task = await this.requireTask(ctx, taskId);

    return this.db.withClient(ctx, async (client) => {
      const result = await client.query<StepTaskRow>(
        `INSERT INTO step_tasks (org_id, step_id, task_id, persona_id, role, sort_order)
              VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
        [
          task.org_id,
          data.step_id,
          taskId,
          data.persona_id,
          data.role ?? 'owner',
          data.sort_order ?? 0,
        ],
      );

      const placement = result.rows[0];

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'step_task', $3, 'create', $4, $5)`,
        [
          task.org_id,
          task.project_id,
          placement.id,
          ctx.user_id ?? null,
          JSON.stringify({
            task_id: taskId,
            step_id: data.step_id,
            persona_id: data.persona_id,
          }),
        ],
      );

      return placement;
    });
  }

  async removeStepTask(ctx: DbContext, stepTaskId: string): Promise<void> {
    return this.db.withClient(ctx, async (client) => {
      // Fetch step_task with its parent task's project_id for audit
      const stResult = await client.query<StepTaskRow & { project_id: string }>(
        `SELECT st.*, t.project_id
           FROM step_tasks st
           JOIN tasks t ON t.id = st.task_id
          WHERE st.id = $1`,
        [stepTaskId],
      );

      const stepTask = stResult.rows[0];
      if (!stepTask) {
        throw new NotFoundException(`StepTask ${stepTaskId} not found`);
      }

      await client.query('DELETE FROM step_tasks WHERE id = $1', [stepTaskId]);

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'step_task', $3, 'delete', $4, $5)`,
        [
          stepTask.org_id,
          stepTask.project_id,
          stepTask.id,
          ctx.user_id ?? null,
          JSON.stringify({
            task_id: stepTask.task_id,
            step_id: stepTask.step_id,
          }),
        ],
      );
    });
  }

  async reorder(
    ctx: DbContext,
    projectId: string,
    stepId: string,
    ids: string[],
  ): Promise<void> {
    await this.db.withClient(ctx, async (client) => {
      for (let i = 0; i < ids.length; i++) {
        await client.query(
          `UPDATE step_tasks SET sort_order = $1 WHERE id = $2 AND step_id = $3`,
          [i, ids[i], stepId],
        );
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'step_task', $3, 'reorder', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          stepId,
          ctx.user_id ?? null,
          JSON.stringify({ step_id: stepId, ids }),
        ],
      );
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async requireTask(ctx: DbContext, id: string): Promise<TaskRow> {
    const task = await this.db.queryOne<TaskRow>(
      ctx,
      'SELECT * FROM tasks WHERE id = $1',
      [id],
    );

    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    return task;
  }
}
