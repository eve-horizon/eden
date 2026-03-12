import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, DbContext } from '../common/database.service';

import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Row types
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

interface TaskJoinRow {
  id: string;
  display_id: string;
  title: string;
  user_story: string | null;
  acceptance_criteria: unknown;
  priority: string;
  status: string;
  device: string | null;
  lifecycle: string | null;
  source_type: string | null;
  release_id: string | null;
  step_id: string;
  persona_id: string;
  persona_code: string;
  st_role: string;
}

interface QuestionRow {
  id: string;
  display_id: string;
  question: string;
  answer: string | null;
  status: string;
  priority: string;
  ref_entity_type: string | null;
  ref_entity_id: string | null;
}

interface ReleaseRow {
  id: string;
  name: string;
  status: string;
  target_date: string | null;
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

interface ExportTask {
  id: string;
  display_id: string;
  title: string;
  user_story: string | null;
  acceptance_criteria: unknown[];
  priority: string;
  status: string;
  device: string | null;
  lifecycle: string;
  source_type: string | null;
  persona_code: string;
  role: string;
  questions: ExportQuestion[];
}

interface ExportQuestion {
  id: string;
  display_id: string;
  question: string;
  answer: string | null;
  status: string;
  priority: string;
}

interface ExportStep {
  id: string;
  display_id: string;
  name: string;
  sort_order: number;
  tasks: ExportTask[];
}

interface ExportActivity {
  id: string;
  display_id: string;
  name: string;
  sort_order: number;
  steps: ExportStep[];
}

export interface ExportProject {
  id: string;
  name: string;
  slug: string;
  personas: PersonaRow[];
  releases: ReleaseRow[];
  activities: ExportActivity[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ExportService {
  constructor(private readonly db: DatabaseService) {}

  async exportJson(ctx: DbContext, projectId: string): Promise<ExportProject> {
    return this.db.withClient(ctx, async (client) => {
      return this.buildTree(client, projectId);
    });
  }

  async exportMarkdown(ctx: DbContext, projectId: string): Promise<string> {
    return this.db.withClient(ctx, async (client) => {
      const tree = await this.buildTree(client, projectId);
      return this.renderMarkdown(tree);
    });
  }

  // -------------------------------------------------------------------------
  // Build the full project tree
  // -------------------------------------------------------------------------

  private async buildTree(
    client: PoolClient,
    projectId: string,
  ): Promise<ExportProject> {
    // Project
    const { rows: projectRows } = await client.query<ProjectRow>(
      'SELECT id, name, slug FROM projects WHERE id = $1',
      [projectId],
    );
    if (!projectRows[0]) throw new NotFoundException('Project not found');
    const project = projectRows[0];

    // Personas
    const { rows: personas } = await client.query<PersonaRow>(
      `SELECT id, code, name, color
         FROM personas WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );
    const personaById = new Map(personas.map((p) => [p.id, p]));

    // Releases
    const { rows: releases } = await client.query<ReleaseRow>(
      `SELECT id, name, status, target_date
         FROM releases WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    );

    // Activities
    const { rows: activities } = await client.query<ActivityRow>(
      `SELECT id, display_id, name, sort_order
         FROM activities WHERE project_id = $1 ORDER BY sort_order, created_at`,
      [projectId],
    );

    // Steps
    const { rows: steps } = await client.query<StepRow>(
      `SELECT id, activity_id, display_id, name, sort_order
         FROM steps WHERE project_id = $1 ORDER BY sort_order, created_at`,
      [projectId],
    );

    // Tasks via step_tasks JOIN
    const { rows: taskRows } = await client.query<TaskJoinRow>(
      `SELECT t.id, t.display_id, t.title, t.user_story,
              t.acceptance_criteria, t.priority, t.status,
              t.device, t.lifecycle, t.source_type, t.release_id,
              st.step_id, st.persona_id,
              p.code AS persona_code, st.role AS st_role
         FROM step_tasks st
         JOIN tasks    t ON t.id = st.task_id
         JOIN personas p ON p.id = st.persona_id
        WHERE t.project_id = $1
        ORDER BY st.sort_order, t.created_at`,
      [projectId],
    );

    // Collect task IDs for question lookup
    const taskIds = [...new Set(taskRows.map((r) => r.id))];

    // Questions
    let questionRows: QuestionRow[] = [];
    if (taskIds.length > 0) {
      const { rows } = await client.query<QuestionRow>(
        `SELECT q.id, q.display_id, q.question, q.answer, q.status, q.priority,
                qr.entity_type AS ref_entity_type, qr.entity_id AS ref_entity_id
           FROM questions q
           JOIN question_references qr ON qr.question_id = q.id
          WHERE qr.entity_type = 'task' AND qr.entity_id = ANY($1)
          ORDER BY q.created_at`,
        [taskIds],
      );
      questionRows = rows;
    }

    // Group questions by task
    const questionsByTask = new Map<string, Map<string, ExportQuestion>>();
    for (const row of questionRows) {
      const taskId = row.ref_entity_id!;
      let qMap = questionsByTask.get(taskId);
      if (!qMap) {
        qMap = new Map();
        questionsByTask.set(taskId, qMap);
      }
      if (!qMap.has(row.id)) {
        qMap.set(row.id, {
          id: row.id,
          display_id: row.display_id,
          question: row.question,
          answer: row.answer,
          status: row.status,
          priority: row.priority,
        });
      }
    }

    // Group tasks by step
    const tasksByStep = new Map<string, ExportTask[]>();
    for (const row of taskRows) {
      const ac = this.parseAcceptanceCriteria(row.acceptance_criteria);
      const qMap = questionsByTask.get(row.id);

      const task: ExportTask = {
        id: row.id,
        display_id: row.display_id,
        title: row.title,
        user_story: row.user_story,
        acceptance_criteria: ac,
        priority: row.priority,
        status: row.status,
        device: row.device,
        lifecycle: row.lifecycle ?? 'current',
        source_type: row.source_type,
        persona_code: row.persona_code,
        role: row.st_role,
        questions: qMap ? [...qMap.values()] : [],
      };

      const list = tasksByStep.get(row.step_id) ?? [];
      list.push(task);
      tasksByStep.set(row.step_id, list);
    }

    // Group steps by activity
    const stepsByActivity = new Map<string, ExportStep[]>();
    for (const step of steps) {
      const exportStep: ExportStep = {
        id: step.id,
        display_id: step.display_id,
        name: step.name,
        sort_order: step.sort_order,
        tasks: tasksByStep.get(step.id) ?? [],
      };
      const list = stepsByActivity.get(step.activity_id) ?? [];
      list.push(exportStep);
      stepsByActivity.set(step.activity_id, list);
    }

    // Assemble activities
    const exportActivities: ExportActivity[] = activities.map((a) => ({
      id: a.id,
      display_id: a.display_id,
      name: a.name,
      sort_order: a.sort_order,
      steps: stepsByActivity.get(a.id) ?? [],
    }));

    return {
      ...project,
      personas,
      releases,
      activities: exportActivities,
    };
  }

  // -------------------------------------------------------------------------
  // Markdown rendering
  // -------------------------------------------------------------------------

  private renderMarkdown(tree: ExportProject): string {
    const lines: string[] = [];

    lines.push(`# Project: ${tree.name}`);
    lines.push('');

    for (const activity of tree.activities) {
      lines.push(`## Activity: ${activity.name} (${activity.display_id})`);
      lines.push('');

      for (const step of activity.steps) {
        lines.push(`### Step: ${step.name} (${step.display_id})`);
        lines.push('');

        for (const task of step.tasks) {
          lines.push(`#### ${task.display_id}: ${task.title}`);
          lines.push(`- **Persona**: ${task.persona_code} (${task.role})`);
          lines.push(`- **Device**: ${task.device ?? 'any'}`);
          lines.push(`- **Priority**: ${task.priority}`);
          lines.push(`- **Lifecycle**: ${task.lifecycle}`);
          lines.push(`- **Source**: ${task.source_type ?? 'manual'}`);

          if (task.user_story) {
            lines.push(`- **User Story**: ${task.user_story}`);
          }

          const ac = task.acceptance_criteria as { text?: string }[];
          if (ac.length > 0) {
            lines.push('- **Acceptance Criteria**:');
            for (const criterion of ac) {
              lines.push(`  - ${criterion.text ?? JSON.stringify(criterion)}`);
            }
          }

          if (task.questions.length > 0) {
            lines.push('- **Questions**:');
            for (const q of task.questions) {
              lines.push(`  - ${q.display_id} (${q.status}): ${q.question}`);
            }
          }

          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private parseAcceptanceCriteria(raw: unknown): unknown[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
