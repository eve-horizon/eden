import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { normalizeAcceptanceCriteria } from '../common/acceptance-criteria.util';
import { DatabaseService, DbContext } from '../common/database.service';
import { WizardReconcileService } from '../wizard/wizard-reconcile.service';

import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Row types — lightweight projections used only for map assembly
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
}

interface PersonaRow {
  id: string;
  code: string;
  name: string;
  color: string;
}

interface ActivityRow {
  id: string;
  display_id: string;
  name: string;
  sort_order: number;
}

interface StepRow {
  id: string;
  activity_id: string;
  display_id: string;
  name: string;
  sort_order: number;
}

interface StepTaskJoinRow {
  // step_tasks columns
  st_step_id: string;
  st_persona_id: string;
  st_role: string;
  st_sort_order: number;
  st_role_in_journey: string | null;
  st_handoff_label: string | null;
  // tasks columns
  task_id: string;
  task_display_id: string;
  task_title: string;
  task_user_story: string | null;
  task_acceptance_criteria: unknown;
  task_priority: string;
  task_status: string;
  task_device: string | null;
  task_release_id: string | null;
  task_lifecycle: string | null;
  task_source_type: string | null;
  task_source_excerpt: string | null;
  task_source_id: string | null;
  task_approval: string | null;
}

interface QuestionJoinRow {
  id: string;
  display_id: string;
  question: string;
  status: string;
  priority: string;
  // from question_references
  ref_entity_type: string | null;
  ref_entity_id: string | null;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface MapPersona {
  id: string;
  code: string;
  name: string;
  color: string;
}

interface MapQuestion {
  id: string;
  display_id: string;
  question: string;
  status: string;
  priority: string;
}

interface MapTask {
  id: string;
  display_id: string;
  title: string;
  user_story: string | null;
  acceptance_criteria: unknown[];
  priority: string;
  status: string;
  device: string | null;
  release_id: string | null;
  lifecycle: string;
  source_type: string | null;
  source_excerpt: string | null;
  source_id: string | null;
  persona: MapPersona | null;
  role: string;
  role_in_journey: string;
  handoff_label: string | null;
  questions: MapQuestion[];
  approval: string;
}

interface MapStep {
  id: string;
  display_id: string;
  name: string;
  sort_order: number;
  tasks: MapTask[];
}

interface MapActivity {
  id: string;
  display_id: string;
  name: string;
  sort_order: number;
  steps: MapStep[];
}

interface MapStats {
  activity_count: number;
  step_count: number;
  task_count: number;
  acceptance_criteria_count: number;
  question_count: number;
  answered_question_count: number;
  persona_counts: Record<string, number>;
}

export interface MapResponse {
  project: { id: string; name: string; slug: string };
  personas: MapPersona[];
  activities: MapActivity[];
  stats: MapStats;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface MapFilter {
  persona?: string; // persona code
  release?: string; // release id
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly reconcile: WizardReconcileService,
  ) {}

  async getMap(
    ctx: DbContext,
    projectId: string,
    filter: MapFilter,
  ): Promise<MapResponse> {
    // Heal wizard-orphaned drafts before assembling the map. This is the
    // self-healing recovery path for users whose tab closed before the
    // wizard polling loop could auto-accept. Best-effort: never throws.
    try {
      const result = await this.reconcile.reconcileOrphans(ctx, projectId);
      if (result.accepted.length > 0) {
        this.logger.log(
          `Map load recovered ${result.accepted.length} wizard orphan(s) for project ${projectId}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `WizardReconcile threw for project ${projectId}: ${err}`,
      );
    }

    return this.db.withClient(ctx, async (client) => {
      // 1. Project
      const project = await this.fetchProject(client, projectId);

      // 2. Personas (always full list for the legend/sidebar)
      const personas = await this.fetchPersonas(client, projectId);
      const personaById = new Map(personas.map((p) => [p.id, p]));

      // 3. Activities & steps
      const activities = await this.fetchActivities(client, projectId);
      const steps = await this.fetchSteps(client, projectId);

      // 4. Tasks via step_tasks JOIN
      const taskRows = await this.fetchStepTasks(client, projectId, filter);

      // 5. Collect task IDs for question lookup
      const taskIds = [...new Set(taskRows.map((r) => r.task_id))];

      // 6. Questions referencing those tasks
      const questionRows =
        taskIds.length > 0
          ? await this.fetchQuestions(client, taskIds)
          : [];

      // -----------------------------------------------------------------------
      // Assemble the tree
      // -----------------------------------------------------------------------

      // Group questions by task_id
      const questionsByTask = this.groupQuestionsByTask(questionRows);

      // Group tasks by step_id
      const tasksByStep = new Map<string, MapTask[]>();
      for (const row of taskRows) {
        const persona = personaById.get(row.st_persona_id) ?? null;
        const ac = this.parseAcceptanceCriteria(row.task_acceptance_criteria);

        const task: MapTask = {
          id: row.task_id,
          display_id: row.task_display_id,
          title: row.task_title,
          user_story: row.task_user_story,
          acceptance_criteria: ac,
          priority: row.task_priority,
          status: row.task_status,
          device: row.task_device,
          release_id: row.task_release_id,
          lifecycle: row.task_lifecycle ?? 'current',
          source_type: row.task_source_type,
          source_excerpt: row.task_source_excerpt,
          source_id: row.task_source_id,
          persona,
          role: row.st_role,
          role_in_journey: row.st_role_in_journey ?? 'primary',
          handoff_label: row.st_handoff_label,
          questions: questionsByTask.get(row.task_id) ?? [],
          approval: row.task_approval ?? 'approved',
        };

        const list = tasksByStep.get(row.st_step_id) ?? [];
        list.push(task);
        tasksByStep.set(row.st_step_id, list);
      }

      // Group steps by activity_id
      const stepsByActivity = new Map<string, MapStep[]>();
      for (const step of steps) {
        const mapStep: MapStep = {
          id: step.id,
          display_id: step.display_id,
          name: step.name,
          sort_order: step.sort_order,
          tasks: tasksByStep.get(step.id) ?? [],
        };

        const list = stepsByActivity.get(step.activity_id) ?? [];
        list.push(mapStep);
        stepsByActivity.set(step.activity_id, list);
      }

      // Assemble activities
      const mapActivities: MapActivity[] = activities.map((a) => ({
        id: a.id,
        display_id: a.display_id,
        name: a.name,
        sort_order: a.sort_order,
        steps: stepsByActivity.get(a.id) ?? [],
      }));

      // -----------------------------------------------------------------------
      // Stats — derived from assembled data
      // -----------------------------------------------------------------------

      const allTasks = mapActivities.flatMap((a) =>
        a.steps.flatMap((s) => s.tasks),
      );

      const allQuestions = allTasks.flatMap((t) => t.questions);

      // Deduplicate questions (a question can reference multiple tasks)
      const uniqueQuestions = new Map<string, MapQuestion>();
      for (const q of allQuestions) {
        uniqueQuestions.set(q.id, q);
      }

      const personaCounts: Record<string, number> = {};
      for (const t of allTasks) {
        if (t.persona) {
          personaCounts[t.persona.code] =
            (personaCounts[t.persona.code] ?? 0) + 1;
        }
      }

      const stats: MapStats = {
        activity_count: mapActivities.length,
        step_count: mapActivities.reduce((n, a) => n + a.steps.length, 0),
        task_count: allTasks.length,
        acceptance_criteria_count: allTasks.reduce(
          (n, t) => n + (t.acceptance_criteria as unknown[]).length,
          0,
        ),
        question_count: uniqueQuestions.size,
        answered_question_count: [...uniqueQuestions.values()].filter(
          (q) => q.status === 'answered',
        ).length,
        persona_counts: personaCounts,
      };

      return { project, personas, activities: mapActivities, stats };
    });
  }

  // -------------------------------------------------------------------------
  // Query helpers — each runs on the shared client inside the transaction
  // -------------------------------------------------------------------------

  private async fetchProject(
    client: PoolClient,
    projectId: string,
  ): Promise<ProjectRow> {
    const { rows } = await client.query<ProjectRow>(
      'SELECT id, name, slug FROM projects WHERE id = $1',
      [projectId],
    );
    if (!rows[0]) throw new NotFoundException('Project not found');
    return rows[0];
  }

  private async fetchPersonas(
    client: PoolClient,
    projectId: string,
  ): Promise<PersonaRow[]> {
    const { rows } = await client.query<PersonaRow>(
      `SELECT id, code, name, color
         FROM personas
        WHERE project_id = $1
        ORDER BY created_at`,
      [projectId],
    );
    return rows;
  }

  private async fetchActivities(
    client: PoolClient,
    projectId: string,
  ): Promise<ActivityRow[]> {
    const { rows } = await client.query<ActivityRow>(
      `SELECT id, display_id, name, sort_order
         FROM activities
        WHERE project_id = $1
        ORDER BY sort_order ASC, created_at`,
      [projectId],
    );
    return rows;
  }

  private async fetchSteps(
    client: PoolClient,
    projectId: string,
  ): Promise<StepRow[]> {
    const { rows } = await client.query<StepRow>(
      `SELECT id, activity_id, display_id, name, sort_order
         FROM steps
        WHERE project_id = $1
        ORDER BY sort_order ASC, created_at`,
      [projectId],
    );
    return rows;
  }

  private async fetchStepTasks(
    client: PoolClient,
    projectId: string,
    filter: MapFilter,
  ): Promise<StepTaskJoinRow[]> {
    const conditions = ['t.project_id = $1'];
    const params: unknown[] = [projectId];

    if (filter.persona) {
      params.push(filter.persona);
      conditions.push(`(p.id::text = $${params.length} OR p.code = $${params.length})`);
    }

    if (filter.release) {
      params.push(filter.release);
      conditions.push(`t.release_id = $${params.length}`);
    }

    const { rows } = await client.query<StepTaskJoinRow>(
      `SELECT st.step_id      AS st_step_id,
              st.persona_id   AS st_persona_id,
              st.role          AS st_role,
              st.sort_order    AS st_sort_order,
              st.role_in_journey AS st_role_in_journey,
              st.handoff_label   AS st_handoff_label,
              t.id             AS task_id,
              t.display_id     AS task_display_id,
              t.title          AS task_title,
              t.user_story     AS task_user_story,
              t.acceptance_criteria AS task_acceptance_criteria,
              t.priority       AS task_priority,
              t.status         AS task_status,
              t.device         AS task_device,
              t.release_id     AS task_release_id,
              t.lifecycle      AS task_lifecycle,
              t.source_type    AS task_source_type,
              t.source_excerpt AS task_source_excerpt,
              t.source_id      AS task_source_id,
              t.approval       AS task_approval
         FROM step_tasks st
         JOIN tasks    t ON t.id = st.task_id
         JOIN personas p ON p.id = st.persona_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY st.sort_order ASC, t.created_at`,
      params,
    );
    return rows;
  }

  private async fetchQuestions(
    client: PoolClient,
    taskIds: string[],
  ): Promise<QuestionJoinRow[]> {
    const { rows } = await client.query<QuestionJoinRow>(
      `SELECT q.id,
              q.display_id,
              q.question,
              q.status,
              q.priority,
              qr.entity_type AS ref_entity_type,
              qr.entity_id   AS ref_entity_id
         FROM questions q
         JOIN question_references qr ON qr.question_id = q.id
        WHERE qr.entity_type = 'task'
          AND qr.entity_id = ANY($1)
        ORDER BY q.created_at`,
      [taskIds],
    );
    return rows;
  }

  // -------------------------------------------------------------------------
  // Data-shaping helpers
  // -------------------------------------------------------------------------

  private groupQuestionsByTask(
    rows: QuestionJoinRow[],
  ): Map<string, MapQuestion[]> {
    const byTask = new Map<string, Map<string, MapQuestion>>();

    for (const row of rows) {
      const taskId = row.ref_entity_id!;
      let questionMap = byTask.get(taskId);
      if (!questionMap) {
        questionMap = new Map();
        byTask.set(taskId, questionMap);
      }

      // Deduplicate — a question may have multiple references but we only
      // need it once per task
      if (!questionMap.has(row.id)) {
        questionMap.set(row.id, {
          id: row.id,
          display_id: row.display_id,
          question: row.question,
          status: row.status,
          priority: row.priority,
        });
      }
    }

    const result = new Map<string, MapQuestion[]>();
    for (const [taskId, questionMap] of byTask) {
      result.set(taskId, [...questionMap.values()]);
    }
    return result;
  }

  private parseAcceptanceCriteria(raw: unknown): unknown[] {
    return normalizeAcceptanceCriteria(raw);
  }
}
