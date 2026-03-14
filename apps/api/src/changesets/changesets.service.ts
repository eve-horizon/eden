import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';
import { EveEventsService } from '../common/eve-events.service';

import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Row types — mirror the DB schema
// ---------------------------------------------------------------------------

export interface ChangesetRow {
  id: string
  org_id: string
  project_id: string
  title: string
  reasoning: string | null
  source: string | null
  status: string
  source_id: string | null
  actor: string | null
  created_at: string
  updated_at: string
}

export interface ChangesetItemRow {
  id: string
  org_id: string
  changeset_id: string
  entity_type: string
  operation: string
  before_state: unknown
  after_state: unknown
  status: string
  description: string | null
  display_reference: string | null
  created_at: string
  updated_at: string
}

export interface ChangesetDetail extends ChangesetRow {
  items: ChangesetItemRow[]
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateChangesetInput {
  title: string
  reasoning?: string
  source?: string
  source_id?: string
  actor?: string
  items: {
    entity_type: string
    operation: string
    before_state?: unknown
    after_state?: unknown
    description?: string
    display_reference?: string
  }[]
}

export interface ReviewDecision {
  id: string
  status: 'accepted' | 'rejected'
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ChangesetsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EveEventsService,
  ) {}

  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------

  async list(
    ctx: DbContext,
    projectId: string,
    filter?: { status?: string },
  ): Promise<ChangesetRow[]> {
    const conditions = ['c.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filter?.status) {
      params.push(filter.status);
      conditions.push(`c.status = $${params.length}`);
    }

    const sql = `
      SELECT c.*
        FROM changesets c
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.created_at DESC
    `;

    return this.db.query<ChangesetRow>(ctx, sql, params);
  }

  // -------------------------------------------------------------------------
  // Find by ID (with items)
  // -------------------------------------------------------------------------

  async findById(ctx: DbContext, id: string): Promise<ChangesetDetail> {
    const changeset = await this.db.queryOne<ChangesetRow>(
      ctx,
      'SELECT * FROM changesets WHERE id = $1',
      [id],
    );

    if (!changeset) {
      throw new NotFoundException(`Changeset ${id} not found`);
    }

    const items = await this.db.query<ChangesetItemRow>(
      ctx,
      `SELECT * FROM changeset_items
        WHERE changeset_id = $1
        ORDER BY created_at`,
      [id],
    );

    return { ...changeset, items };
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(
    ctx: DbContext,
    projectId: string,
    input: CreateChangesetInput,
  ): Promise<ChangesetDetail> {
    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<ChangesetRow>(
        `INSERT INTO changesets (org_id, project_id, title, reasoning, source, source_id, actor, status)
              VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
           RETURNING *`,
        [
          ctx.org_id,
          projectId,
          input.title,
          input.reasoning ?? null,
          input.source ?? null,
          input.source_id ?? null,
          input.actor ?? null,
        ],
      );
      const changeset = rows[0];

      const items: ChangesetItemRow[] = [];
      for (const item of input.items) {
        const { rows: itemRows } = await client.query<ChangesetItemRow>(
          `INSERT INTO changeset_items
                  (org_id, changeset_id, entity_type, operation,
                   before_state, after_state, status, description, display_reference)
                VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
             RETURNING *`,
          [
            ctx.org_id,
            changeset.id,
            item.entity_type,
            item.operation,
            JSON.stringify(item.before_state ?? null),
            JSON.stringify(item.after_state ?? null),
            item.description ?? null,
            item.display_reference ?? null,
          ],
        );
        items.push(itemRows[0]);
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'changeset', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          changeset.id,
          ctx.user_id ?? null,
          JSON.stringify({
            title: input.title,
            item_count: items.length,
          }),
        ],
      );

      return { ...changeset, items };
    });
  }

  // -------------------------------------------------------------------------
  // Accept all
  // -------------------------------------------------------------------------

  async accept(ctx: DbContext, id: string): Promise<ChangesetDetail> {
    return this.db.withClient(ctx, async (client) => {
      const changeset = await this.lockChangeset(client, id);
      const projectId = changeset.project_id;

      if (changeset.status !== 'draft') {
        throw new BadRequestException(
          `Changeset is "${changeset.status}", expected "draft"`,
        );
      }

      const { rows: rawItems } = await client.query<ChangesetItemRow>(
        `SELECT * FROM changeset_items
          WHERE changeset_id = $1 AND status = 'pending'
          ORDER BY created_at`,
        [id],
      );

      // Sort by dependency order: persona → activity → step → task/question
      const entityOrder: Record<string, number> = {
        persona: 0,
        activity: 1,
        step: 2,
        task: 3,
        step_task: 4,
        question: 5,
      };
      const items = [...rawItems].sort((a, b) => {
        const aOrder = entityOrder[a.entity_type] ?? 99;
        const bOrder = entityOrder[b.entity_type] ?? 99;
        return aOrder - bOrder;
      });

      for (const item of items) {
        await this.applyItem(client, ctx, item, projectId);
        await client.query(
          `UPDATE changeset_items SET status = 'accepted' WHERE id = $1`,
          [item.id],
        );
      }

      const { rows: updatedRows } = await client.query<ChangesetRow>(
        `UPDATE changesets SET status = 'accepted' WHERE id = $1 RETURNING *`,
        [id],
      );

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'changeset', $3, 'accept', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          id,
          ctx.user_id ?? null,
          JSON.stringify({ items_accepted: items.length }),
        ],
      );

      const { rows: allItems } = await client.query<ChangesetItemRow>(
        `SELECT * FROM changeset_items WHERE changeset_id = $1 ORDER BY created_at`,
        [id],
      );

      const result = { ...updatedRows[0], items: allItems };

      // Emit event outside the transaction (fire-and-forget)
      this.events.emit('changeset.accepted', {
        changeset_id: result.id,
        project_id: result.project_id,
        title: result.title,
        source: result.source,
        items_accepted: items.length,
      });

      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Reject all
  // -------------------------------------------------------------------------

  async reject(ctx: DbContext, id: string): Promise<ChangesetDetail> {
    return this.db.withClient(ctx, async (client) => {
      const changeset = await this.lockChangeset(client, id);
      const projectId = changeset.project_id;

      if (changeset.status !== 'draft') {
        throw new BadRequestException(
          `Changeset is "${changeset.status}", expected "draft"`,
        );
      }

      await client.query(
        `UPDATE changeset_items SET status = 'rejected' WHERE changeset_id = $1`,
        [id],
      );

      const { rows: updatedRows } = await client.query<ChangesetRow>(
        `UPDATE changesets SET status = 'rejected' WHERE id = $1 RETURNING *`,
        [id],
      );

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'changeset', $3, 'reject', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          id,
          ctx.user_id ?? null,
          JSON.stringify({ status: 'rejected' }),
        ],
      );

      const { rows: allItems } = await client.query<ChangesetItemRow>(
        `SELECT * FROM changeset_items WHERE changeset_id = $1 ORDER BY created_at`,
        [id],
      );

      return { ...updatedRows[0], items: allItems };
    });
  }

  // -------------------------------------------------------------------------
  // Review (per-item accept/reject)
  // -------------------------------------------------------------------------

  async review(
    ctx: DbContext,
    id: string,
    decisions: ReviewDecision[],
  ): Promise<ChangesetDetail> {
    return this.db.withClient(ctx, async (client) => {
      const changeset = await this.lockChangeset(client, id);
      const projectId = changeset.project_id;

      if (changeset.status !== 'draft') {
        throw new BadRequestException(
          `Changeset is "${changeset.status}", expected "draft"`,
        );
      }

      for (const decision of decisions) {
        if (decision.status === 'accepted') {
          const { rows } = await client.query<ChangesetItemRow>(
            `SELECT * FROM changeset_items WHERE id = $1 AND changeset_id = $2`,
            [decision.id, id],
          );
          const item = rows[0];
          if (!item) {
            throw new NotFoundException(`Changeset item ${decision.id} not found`);
          }

          await this.applyItem(client, ctx, item, projectId);
          await client.query(
            `UPDATE changeset_items SET status = 'accepted' WHERE id = $1`,
            [decision.id],
          );
        } else {
          await client.query(
            `UPDATE changeset_items SET status = 'rejected' WHERE id = $1 AND changeset_id = $2`,
            [decision.id, id],
          );
        }
      }

      // Determine final changeset status based on all item statuses
      const { rows: allItems } = await client.query<ChangesetItemRow>(
        `SELECT * FROM changeset_items WHERE changeset_id = $1 ORDER BY created_at`,
        [id],
      );

      const allAccepted = allItems.every((i) => i.status === 'accepted');
      const allRejected = allItems.every((i) => i.status === 'rejected');
      const finalStatus = allAccepted
        ? 'accepted'
        : allRejected
          ? 'rejected'
          : 'partial';

      const { rows: updatedRows } = await client.query<ChangesetRow>(
        `UPDATE changesets SET status = $1 WHERE id = $2 RETURNING *`,
        [finalStatus, id],
      );

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'changeset', $3, 'review', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          id,
          ctx.user_id ?? null,
          JSON.stringify({
            decisions: decisions.length,
            final_status: finalStatus,
          }),
        ],
      );

      return { ...updatedRows[0], items: allItems };
    });
  }

  // -------------------------------------------------------------------------
  // Apply a single changeset item to the story map
  // -------------------------------------------------------------------------

  private async applyItem(
    client: PoolClient,
    ctx: DbContext,
    item: ChangesetItemRow,
    projectId: string,
  ): Promise<void> {
    const afterState = (item.after_state ?? {}) as Record<string, unknown>;
    const entityType = item.entity_type;
    const operation = item.operation;
    const key = `${entityType}/${operation}`;

    switch (key) {
      // -- Tasks -----------------------------------------------------------

      case 'task/create': {
        // Auto-generate display_id if not provided
        let displayId = afterState.display_id;
        if (!displayId) {
          const { rows: countRows } = await client.query<{ cnt: string }>(
            'SELECT count(*)::text AS cnt FROM tasks WHERE project_id = $1',
            [projectId],
          );
          const nextNum = parseInt(countRows[0].cnt, 10) + 1;
          displayId = `TSK-${nextNum}`;
        }

        const { rows } = await client.query(
          `INSERT INTO tasks
                  (org_id, project_id, display_id, title, user_story,
                   acceptance_criteria, priority, status, device)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
          [
            ctx.org_id,
            projectId,
            displayId,
            afterState.title ?? 'Untitled',
            afterState.user_story ?? null,
            JSON.stringify(afterState.acceptance_criteria ?? []),
            afterState.priority ?? 'medium',
            afterState.status ?? 'draft',
            afterState.device ?? null,
          ],
        );
        await this.auditAppliedItem(client, ctx, projectId, 'task', rows[0].id, 'create', item);
        break;
      }

      case 'task/update': {
        const taskId = await this.resolveEntityByDisplayRef(
          client, 'tasks', item.display_reference, projectId,
        );
        const setClauses: string[] = [];
        const params: unknown[] = [taskId];
        const allowed = ['title', 'user_story', 'acceptance_criteria', 'priority', 'status', 'device'];

        for (const col of allowed) {
          if (col in afterState) {
            const value = col === 'acceptance_criteria'
              ? JSON.stringify(afterState[col])
              : afterState[col];
            params.push(value);
            setClauses.push(`${col} = $${params.length}`);
          }
        }

        if (setClauses.length > 0) {
          await client.query(
            `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = $1`,
            params,
          );
        }
        await this.auditAppliedItem(client, ctx, projectId, 'task', taskId, 'update', item);
        break;
      }

      case 'task/delete': {
        const taskId = await this.resolveEntityByDisplayRef(
          client, 'tasks', item.display_reference, projectId,
        );
        await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
        await this.auditAppliedItem(client, ctx, projectId, 'task', taskId, 'delete', item);
        break;
      }

      // -- Questions -------------------------------------------------------

      case 'question/create': {
        // Auto-generate display_id: Q-<next>
        const { rows: countRows } = await client.query<{ cnt: string }>(
          'SELECT count(*)::text AS cnt FROM questions WHERE project_id = $1',
          [projectId],
        );
        const nextNum = parseInt(countRows[0].cnt, 10) + 1;
        const displayId = `Q-${nextNum}`;

        const { rows } = await client.query(
          `INSERT INTO questions
                  (org_id, project_id, display_id, question, priority, category)
                VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
          [
            ctx.org_id,
            projectId,
            displayId,
            afterState.question ?? '',
            afterState.priority ?? 'medium',
            afterState.category ?? null,
          ],
        );
        await this.auditAppliedItem(client, ctx, projectId, 'question', rows[0].id, 'create', item);
        break;
      }

      case 'question/update': {
        const questionId = await this.resolveEntityByDisplayRef(
          client, 'questions', item.display_reference, projectId,
        );
        const qSetClauses: string[] = [];
        const qParams: unknown[] = [questionId];
        const qAllowed = ['question', 'answer', 'status', 'priority', 'category'];

        for (const col of qAllowed) {
          if (col in afterState) {
            qParams.push(afterState[col]);
            qSetClauses.push(`${col} = $${qParams.length}`);
          }
        }

        if (qSetClauses.length > 0) {
          await client.query(
            `UPDATE questions SET ${qSetClauses.join(', ')} WHERE id = $1`,
            qParams,
          );
        }
        await this.auditAppliedItem(client, ctx, projectId, 'question', questionId, 'update', item);
        break;
      }

      // -- Activities ------------------------------------------------------

      case 'activity/create': {
        let actDisplayId = afterState.display_id;
        if (!actDisplayId) {
          const { rows: actCount } = await client.query<{ cnt: string }>(
            'SELECT count(*)::text AS cnt FROM activities WHERE project_id = $1',
            [projectId],
          );
          actDisplayId = `ACT-${parseInt(actCount[0].cnt, 10) + 1}`;
        }
        const { rows } = await client.query(
          `INSERT INTO activities
                  (org_id, project_id, display_id, name, sort_order)
                VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
          [
            ctx.org_id,
            projectId,
            actDisplayId,
            afterState.name ?? 'Untitled',
            afterState.sort_order ?? 0,
          ],
        );
        await this.auditAppliedItem(client, ctx, projectId, 'activity', rows[0].id, 'create', item);
        break;
      }

      // -- Steps -----------------------------------------------------------

      case 'step/create': {
        let stepDisplayId = afterState.display_id;
        if (!stepDisplayId) {
          const { rows: stepCount } = await client.query<{ cnt: string }>(
            'SELECT count(*)::text AS cnt FROM steps WHERE project_id = $1',
            [projectId],
          );
          stepDisplayId = `STP-${parseInt(stepCount[0].cnt, 10) + 1}`;
        }

        // Resolve activity_id: prefer UUID, fall back to display_id lookup
        let activityId = afterState.activity_id as string | null;
        if (!activityId && afterState.activity_display_id) {
          activityId = await this.resolveEntityByDisplayRef(
            client, 'activities', afterState.activity_display_id as string, projectId,
          );
        }
        // Also try display_reference as parent activity ref (e.g. "ACT-1")
        if (!activityId && item.display_reference) {
          const ref = item.display_reference as string;
          const actRef = ref.includes('.') ? ref.split('.')[0] : ref;
          if (actRef.startsWith('ACT-')) {
            activityId = await this.resolveEntityByDisplayRef(
              client, 'activities', actRef, projectId,
            );
          }
        }

        const { rows } = await client.query(
          `INSERT INTO steps
                  (org_id, project_id, activity_id, display_id, name, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
          [
            ctx.org_id,
            projectId,
            activityId,
            stepDisplayId,
            afterState.name ?? 'Untitled',
            afterState.sort_order ?? 0,
          ],
        );
        await this.auditAppliedItem(client, ctx, projectId, 'step', rows[0].id, 'create', item);
        break;
      }

      // -- Personas --------------------------------------------------------

      case 'persona/create': {
        const { rows } = await client.query(
          `INSERT INTO personas
                  (org_id, project_id, code, name, color)
                VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
          [
            ctx.org_id,
            projectId,
            afterState.code ?? '',
            afterState.name ?? 'Untitled',
            afterState.color ?? '#888888',
          ],
        );
        await this.auditAppliedItem(client, ctx, projectId, 'persona', rows[0].id, 'create', item);
        break;
      }

      default:
        throw new BadRequestException(
          `Unsupported changeset item: ${key}`,
        );
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Lock the changeset row with SELECT ... FOR UPDATE and return it.
   */
  private async lockChangeset(
    client: PoolClient,
    id: string,
  ): Promise<ChangesetRow> {
    const { rows } = await client.query<ChangesetRow>(
      'SELECT * FROM changesets WHERE id = $1 FOR UPDATE',
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException(`Changeset ${id} not found`);
    }

    return rows[0];
  }

  /**
   * Resolve a display_reference (e.g. 'TSK-1.1.1') to an entity UUID
   * by looking up the display_id column in the target table.
   */
  private async resolveEntityByDisplayRef(
    client: PoolClient,
    table: string,
    displayReference: string | null,
    projectId: string,
  ): Promise<string> {
    if (!displayReference) {
      throw new BadRequestException(
        `display_reference is required for update/delete operations on ${table}`,
      );
    }

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE display_id = $1 AND project_id = $2`,
      [displayReference, projectId],
    );

    if (!rows[0]) {
      throw new NotFoundException(
        `${table} with display_id "${displayReference}" not found in project`,
      );
    }

    return rows[0].id;
  }

  /**
   * Insert an audit_log entry for an applied changeset item.
   */
  private async auditAppliedItem(
    client: PoolClient,
    ctx: DbContext,
    projectId: string,
    entityType: string,
    entityId: string,
    action: string,
    item: ChangesetItemRow,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        ctx.org_id,
        projectId,
        entityType,
        entityId,
        action,
        ctx.user_id ?? null,
        JSON.stringify({
          changeset_item_id: item.id,
          operation: item.operation,
          display_reference: item.display_reference,
        }),
      ],
    );
  }
}
