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

  async accept(
    ctx: DbContext,
    id: string,
    projectRole?: string | null,
    callerIsAgent = false,
  ): Promise<ChangesetDetail> {
    return this.db.withClient(ctx, async (client) => {
      const changeset = await this.lockChangeset(client, id);
      const projectId = changeset.project_id;

      if (changeset.status !== 'draft') {
        throw new BadRequestException(
          `Changeset is "${changeset.status}", expected "draft"`,
        );
      }

      // Agents cannot accept or reject changesets — all changesets require
      // human review. This is unconditional to prevent agents from gaming
      // the source field to bypass the guard.
      if (callerIsAgent) {
        throw new BadRequestException(
          `Agents cannot accept changesets. Human review required.`,
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

      // Two-stage approval: editors create preview items, owners create approved items
      const isOwner = projectRole === 'owner' || projectRole === null; // null = agent bypass
      const taskApproval = isOwner ? 'approved' : 'preview';
      const itemApprovalStatus = isOwner ? 'applied' : 'pending_approval';

      for (const item of items) {
        await this.applyItem(client, ctx, item, projectId, taskApproval);
        await client.query(
          `UPDATE changeset_items SET status = 'accepted', approval_status = $2 WHERE id = $1`,
          [item.id, itemApprovalStatus],
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
          JSON.stringify({ items_accepted: items.length, approval: taskApproval }),
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
    projectRole?: string | null,
  ): Promise<ChangesetDetail> {
    return this.db.withClient(ctx, async (client) => {
      const changeset = await this.lockChangeset(client, id);
      const projectId = changeset.project_id;

      if (changeset.status !== 'draft') {
        throw new BadRequestException(
          `Changeset is "${changeset.status}", expected "draft"`,
        );
      }

      const isOwner = projectRole === 'owner' || projectRole === null;
      const taskApproval = isOwner ? 'approved' : 'preview';
      const itemApprovalStatus = isOwner ? 'applied' : 'pending_approval';

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

          await this.applyItem(client, ctx, item, projectId, taskApproval);
          await client.query(
            `UPDATE changeset_items SET status = 'accepted', approval_status = $2 WHERE id = $1`,
            [decision.id, itemApprovalStatus],
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

      const result = { ...updatedRows[0], items: allItems };

      // Emit changeset.accepted event when per-item review fully accepts
      if (finalStatus === 'accepted') {
        this.events.emit('changeset.accepted', {
          changeset_id: result.id,
          project_id: result.project_id,
          title: result.title,
          source: result.source,
          items_accepted: allItems.filter((i) => i.status === 'accepted').length,
        });
      }

      return result;
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
    taskApproval: string = 'approved',
  ): Promise<void> {
    const afterState = (item.after_state ?? {}) as Record<string, unknown>;
    const entityType = item.entity_type;
    const operation = item.operation;
    const key = `${entityType}/${operation}`;

    switch (key) {
      // -- Tasks -----------------------------------------------------------

      case 'task/create': {
        // Auto-generate display_id if not provided
        let displayId = afterState.display_id ?? item.display_reference;
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
                   acceptance_criteria, priority, status, device, approval)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
          [
            ctx.org_id,
            projectId,
            displayId,
            afterState.title ?? afterState.name ?? 'Untitled',
            afterState.user_story ?? afterState.description ?? null,
            JSON.stringify(afterState.acceptance_criteria ?? []),
            afterState.priority ?? 'medium',
            afterState.status ?? 'draft',
            afterState.device ?? null,
            taskApproval,
          ],
        );
        const taskId = rows[0].id;

        // Link task to step via step_tasks junction if step reference provided
        const stepRef = (afterState.step_ref ?? afterState.step_display_id) as string | null;
        if (stepRef) {
          try {
            const stepId = await this.resolveEntityByDisplayRef(
              client, 'steps', stepRef, projectId,
            );
            // Resolve persona: use persona from after_state, or first persona in project
            let personaId: string | null = null;
            const personaRef = afterState.persona_ref as string | null;
            if (personaRef) {
              try {
                personaId = await this.resolveEntityByDisplayRef(
                  client, 'personas', personaRef, projectId,
                );
              } catch { /* persona not found */ }
            }
            if (!personaId) {
              const { rows: personas } = await client.query<{ id: string }>(
                'SELECT id FROM personas WHERE project_id = $1 LIMIT 1',
                [projectId],
              );
              personaId = personas[0]?.id ?? null;
            }
            if (personaId) {
              await client.query(
                `INSERT INTO step_tasks (org_id, step_id, task_id, persona_id, sort_order)
                 VALUES ($1, $2, $3, $4, 0)
                 ON CONFLICT DO NOTHING`,
                [ctx.org_id, stepId, taskId, personaId],
              );
            }
          } catch {
            // Step not yet created or ref invalid — skip junction, task still created
          }
        }

        await this.auditAppliedItem(client, ctx, projectId, 'task', taskId, 'create', item);
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
        let actDisplayId = afterState.display_id ?? item.display_reference;
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
        let stepDisplayId = afterState.display_id ?? item.display_reference;
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
        // Also accept activity_ref as alias for activity_display_id (agents use this field name)
        if (!activityId && afterState.activity_ref) {
          activityId = await this.resolveEntityByDisplayRef(
            client, 'activities', afterState.activity_ref as string, projectId,
          );
        }
        // Also try display_reference as parent activity ref (e.g. "ACT-1" or "ACT-1/STP-1")
        if (!activityId && item.display_reference) {
          const ref = item.display_reference as string;
          // Split on / or . to get the activity portion
          const actRef = ref.split(/[/.]/)[0];
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
  // Pending approvals (WS2: Two-Stage Approval)
  // -------------------------------------------------------------------------

  async pendingApprovals(
    ctx: DbContext,
    projectId: string,
  ): Promise<ChangesetItemRow[]> {
    return this.db.query<ChangesetItemRow>(
      ctx,
      `SELECT ci.*
         FROM changeset_items ci
         JOIN changesets c ON c.id = ci.changeset_id
        WHERE c.project_id = $1
          AND ci.approval_status = 'pending_approval'
        ORDER BY ci.created_at`,
      [projectId],
    );
  }

  async approveItems(
    ctx: DbContext,
    projectId: string,
    itemIds: string[],
  ): Promise<{ approved: number }> {
    if (itemIds.length === 0) return { approved: 0 };

    return this.db.withClient(ctx, async (client) => {
      let approved = 0;

      for (const itemId of itemIds) {
        // Update changeset item approval status
        const { rowCount } = await client.query(
          `UPDATE changeset_items
              SET approval_status = 'owner_approved',
                  approved_by = $2,
                  approved_at = NOW()
            WHERE id = $1 AND approval_status = 'pending_approval'`,
          [itemId, ctx.user_id ?? null],
        );

        if (rowCount && rowCount > 0) {
          approved++;

          // Promote any tasks that were created as 'preview' to 'approved'
          // Find tasks created by this changeset item via audit trail
          await client.query(
            `UPDATE tasks SET approval = 'approved'
              WHERE id IN (
                SELECT entity_id::uuid FROM audit_log
                 WHERE details->>'changeset_item_id' = $1
                   AND entity_type = 'task'
                   AND action = 'create'
              )`,
            [itemId],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'changeset_item', $3, 'owner_approve', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          itemIds[0],
          ctx.user_id ?? null,
          JSON.stringify({ item_count: approved, item_ids: itemIds }),
        ],
      );

      return { approved };
    });
  }

  async rejectItems(
    ctx: DbContext,
    projectId: string,
    itemIds: string[],
  ): Promise<{ rejected: number }> {
    if (itemIds.length === 0) return { rejected: 0 };

    return this.db.withClient(ctx, async (client) => {
      let rejected = 0;

      for (const itemId of itemIds) {
        const { rowCount } = await client.query(
          `UPDATE changeset_items
              SET approval_status = 'owner_rejected',
                  approved_by = $2,
                  approved_at = NOW()
            WHERE id = $1 AND approval_status = 'pending_approval'`,
          [itemId, ctx.user_id ?? null],
        );

        if (rowCount && rowCount > 0) {
          rejected++;

          // Remove preview tasks that were created by this changeset item
          await client.query(
            `DELETE FROM tasks
              WHERE approval = 'preview'
                AND id IN (
                  SELECT entity_id::uuid FROM audit_log
                   WHERE details->>'changeset_item_id' = $1
                     AND entity_type = 'task'
                     AND action = 'create'
                )`,
            [itemId],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'changeset_item', $3, 'owner_reject', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          itemIds[0],
          ctx.user_id ?? null,
          JSON.stringify({ item_count: rejected, item_ids: itemIds }),
        ],
      );

      return { rejected };
    });
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
   *
   * Personas are special: they use `code` instead of `display_id`.
   * The display_reference format is PER-{CODE} (e.g. PER-DOE → code DOE).
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

    // Personas don't have display_id — look up by code instead
    if (table === 'personas') {
      const code = displayReference.replace(/^PER-/i, '');
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM personas WHERE code = $1 AND project_id = $2`,
        [code, projectId],
      );
      if (!rows[0]) {
        throw new NotFoundException(
          `persona with code "${code}" not found in project`,
        );
      }
      return rows[0].id;
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
