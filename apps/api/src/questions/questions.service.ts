import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';
import { EveEventsService } from '../common/eve-events.service';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Question {
  id: string;
  org_id: string;
  project_id: string;
  display_id: string;
  question: string;
  answer: string | null;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionReference {
  id: string;
  org_id: string;
  question_id: string;
  entity_type: string;
  entity_id: string;
  display_id: string | null;
  created_at: string;
}

export interface QuestionWithReferences extends Question {
  references: QuestionReference[];
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateQuestionInput {
  question: string;
  priority?: string;
  category?: string;
  is_cross_cutting?: boolean;
  references?: { entity_type: string; entity_id: string }[];
}

export interface UpdateQuestionInput {
  answer?: string;
  status?: string;
  priority?: string;
  category?: string;
}

export interface ListQuestionsFilter {
  status?: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ENTITY_TYPES = [
  'task',
  'activity',
  'step',
  'persona',
  'project',
] as const;

/** Maps entity_type to the table that holds its display_id (or name for persona). */
const ENTITY_TABLE: Record<string, string> = {
  task: 'tasks',
  activity: 'activities',
  step: 'steps',
  persona: 'personas',
  project: 'projects',
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class QuestionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EveEventsService,
  ) {}

  async list(
    ctx: DbContext,
    projectId: string,
    filter: ListQuestionsFilter,
  ): Promise<Question[]> {
    const conditions = ['q.project_id = $1'];
    const params: unknown[] = [projectId];
    let idx = 2;

    if (filter.status) {
      conditions.push(`q.status = $${idx++}`);
      params.push(filter.status);
    }
    if (filter.category) {
      conditions.push(`q.category = $${idx++}`);
      params.push(filter.category);
    }

    const where = conditions.join(' AND ');
    return this.db.query<Question>(
      ctx,
      `SELECT q.* FROM questions q WHERE ${where} ORDER BY q.created_at DESC`,
      params,
    );
  }

  async findById(ctx: DbContext, id: string): Promise<QuestionWithReferences> {
    const question = await this.db.queryOne<Question>(
      ctx,
      'SELECT * FROM questions WHERE id = $1',
      [id],
    );
    if (!question) throw new NotFoundException('Question not found');

    const references = await this.db.query<QuestionReference>(
      ctx,
      `SELECT * FROM question_references WHERE question_id = $1 ORDER BY created_at`,
      [id],
    );

    return { ...question, references };
  }

  async create(
    ctx: DbContext,
    projectId: string,
    input: CreateQuestionInput,
  ): Promise<QuestionWithReferences> {
    if (input.references?.length) {
      this.validateEntityTypes(input.references);
    }

    return this.db.withClient(ctx, async (client) => {
      // Generate display_id: Q-<next sequence number>
      const { rows: countRows } = await client.query<{ cnt: string }>(
        'SELECT count(*)::text AS cnt FROM questions WHERE project_id = $1',
        [projectId],
      );
      const nextNum = parseInt(countRows[0].cnt, 10) + 1;
      const displayId = `Q-${nextNum}`;

      // Insert question
      const { rows } = await client.query<Question>(
        `INSERT INTO questions (org_id, project_id, display_id, question, priority, category, is_cross_cutting)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
        [
          ctx.org_id,
          projectId,
          displayId,
          input.question,
          input.priority ?? 'medium',
          input.category ?? null,
          input.is_cross_cutting ?? false,
        ],
      );
      const question = rows[0];

      // Insert references
      const references: QuestionReference[] = [];
      if (input.references?.length) {
        for (const ref of input.references) {
          const displayIdForRef = await this.resolveDisplayId(
            client,
            ref.entity_type,
            ref.entity_id,
          );

          const { rows: refRows } = await client.query<QuestionReference>(
            `INSERT INTO question_references (org_id, question_id, entity_type, entity_id, display_id)
                  VALUES ($1, $2, $3, $4, $5)
               RETURNING *`,
            [
              ctx.org_id,
              question.id,
              ref.entity_type,
              ref.entity_id,
              displayIdForRef,
            ],
          );
          references.push(refRows[0]);
        }
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'question', $3, 'create', $4, $5)`,
        [
          ctx.org_id,
          projectId,
          question.id,
          ctx.user_id ?? null,
          JSON.stringify({
            question: input.question,
            priority: question.priority,
            category: question.category,
            reference_count: references.length,
          }),
        ],
      );

      return { ...question, references };
    });
  }

  async update(
    ctx: DbContext,
    id: string,
    input: UpdateQuestionInput,
  ): Promise<QuestionWithReferences> {
    // Verify existence (RLS-scoped)
    await this.findById(ctx, id);

    return this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Question>(
        `UPDATE questions
            SET answer   = COALESCE($1, answer),
                status   = COALESCE($2, status),
                priority = COALESCE($3, priority),
                category = COALESCE($4, category)
          WHERE id = $5
      RETURNING *`,
        [
          input.answer ?? null,
          input.status ?? null,
          input.priority ?? null,
          input.category ?? null,
          id,
        ],
      );
      const question = rows[0];
      if (!question) throw new NotFoundException('Question not found');

      const references = await client.query<QuestionReference>(
        'SELECT * FROM question_references WHERE question_id = $1 ORDER BY created_at',
        [id],
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'question', $3, 'update', $4, $5)`,
        [
          ctx.org_id,
          question.project_id,
          question.id,
          ctx.user_id ?? null,
          JSON.stringify(input),
        ],
      );

      return { ...question, references: references.rows };
    });
  }

  async remove(ctx: DbContext, id: string): Promise<void> {
    const question = await this.findById(ctx, id);

    await this.db.withClient(ctx, async (client) => {
      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'question', $3, 'delete', $4, $5)`,
        [
          ctx.org_id,
          question.project_id,
          question.id,
          ctx.user_id ?? null,
          JSON.stringify({
            question: question.question,
            display_id: question.display_id,
          }),
        ],
      );

      await client.query('DELETE FROM questions WHERE id = $1', [id]);
    });
  }

  // ---------------------------------------------------------------------------
  // Evolve — answer question + emit event to trigger question-evolution workflow
  // ---------------------------------------------------------------------------

  async evolve(
    ctx: DbContext,
    id: string,
    answer: string,
  ): Promise<QuestionWithReferences> {
    const existing = await this.findById(ctx, id);

    if (existing.status !== 'open') {
      throw new BadRequestException(
        `Question is "${existing.status}", expected "open"`,
      );
    }

    const result = await this.db.withClient(ctx, async (client) => {
      const { rows } = await client.query<Question>(
        `UPDATE questions
            SET answer = $1, status = 'answered'
          WHERE id = $2
        RETURNING *`,
        [answer, id],
      );
      const question = rows[0];
      if (!question) throw new NotFoundException('Question not found');

      const references = await client.query<QuestionReference>(
        'SELECT * FROM question_references WHERE question_id = $1 ORDER BY created_at',
        [id],
      );

      await client.query(
        `INSERT INTO audit_log (org_id, project_id, entity_type, entity_id, action, actor, details)
              VALUES ($1, $2, 'question', $3, 'evolve', $4, $5)`,
        [
          ctx.org_id,
          question.project_id,
          question.id,
          ctx.user_id ?? null,
          JSON.stringify({ answer }),
        ],
      );

      return { ...question, references: references.rows };
    });

    // Emit event outside the transaction (fire-and-forget)
    this.events.emit('question.answered', {
      question_id: result.id,
      project_id: result.project_id,
      display_id: result.display_id,
      answer,
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private validateEntityTypes(
    refs: { entity_type: string; entity_id: string }[],
  ): void {
    for (const ref of refs) {
      if (
        !VALID_ENTITY_TYPES.includes(ref.entity_type as (typeof VALID_ENTITY_TYPES)[number])
      ) {
        throw new BadRequestException(
          `Invalid entity_type "${ref.entity_type}". Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`,
        );
      }
    }
  }

  /**
   * Look up the display_id for a referenced entity. For projects and personas,
   * which don't have a display_id column, we use slug/code respectively.
   */
  private async resolveDisplayId(
    client: import('pg').PoolClient,
    entityType: string,
    entityId: string,
  ): Promise<string | null> {
    const table = ENTITY_TABLE[entityType];
    if (!table) return null;

    // Projects use slug, personas use code, everything else has display_id
    const column =
      entityType === 'project'
        ? 'slug'
        : entityType === 'persona'
          ? 'code'
          : 'display_id';

    const { rows } = await client.query<{ value: string }>(
      `SELECT ${column} AS value FROM ${table} WHERE id = $1`,
      [entityId],
    );

    return rows[0]?.value ?? null;
  }
}
