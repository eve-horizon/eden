import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import {
  ensureBody,
  parseInteger,
  parseJsonOption,
  readJsonFile,
  resolveIdFromItems,
} from '../utils.js';
import { autoDetectProject } from './projects.js';

interface StepTaskPlacement {
  id: string;
  step_id: string;
  step_display_id: string;
  step_name: string;
  persona_id: string;
  persona_name: string;
  persona_code: string;
  role: string;
  sort_order: number;
}

interface Task {
  id: string;
  display_id: string;
  title: string;
  user_story?: string | null;
  acceptance_criteria?: unknown;
  status: string;
  priority: string;
  device?: string | null;
  release_id: string | null;
  lifecycle?: string | null;
  source_type?: string | null;
  source_excerpt?: string | null;
  created_at: string;
  placements?: StepTaskPlacement[];
}

interface ReleaseSummary {
  id: string;
  name: string;
  target_date: string | null;
  status: string;
  created_at: string;
}

interface PersonaSummary {
  id: string;
  code: string;
  name: string;
  color: string;
}

interface PlacementResult {
  id: string;
  step_id: string;
  task_id: string;
  persona_id: string;
  role: string;
  sort_order: number;
}

interface MapTask {
  id: string;
  display_id: string;
  title: string;
  status?: string;
  priority?: string;
  release_id?: string | null;
  created_at?: string;
}

interface MapStep {
  id: string;
  display_id: string;
  name: string;
  tasks: MapTask[];
}

interface MapActivity {
  id: string;
  display_id: string;
  name: string;
  steps: MapStep[];
}

interface MapData {
  activities: MapActivity[];
}

interface CreateTaskInput {
  title: string;
  display_id: string;
  user_story?: string;
  acceptance_criteria?: unknown;
  priority?: string;
  status?: string;
  device?: string;
  lifecycle?: string;
  source_type?: string;
  source_excerpt?: string;
}

export function registerTasks(program: Command): void {
  const tasks = program
    .command('task')
    .alias('tasks')
    .description('Manage tasks')
    .argument('[id]', 'Task ID or display ID')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status')
    .option('--priority <priority>', 'Filter by priority')
    .option('--release-id <id>', 'Filter by release ID')
    .option('--step <id>', 'Filter by step ID or display ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      if (!id && !opts.project && !opts.status && !opts.priority && !opts.releaseId && !opts.step) {
        console.log(tasks.helpInformation());
        return;
      }
      if (id) {
        await showTask(id, opts);
        return;
      }
      await listTasks(opts);
    });

  tasks
    .command('list')
    .description('List tasks')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status')
    .option('--priority <priority>', 'Filter by priority')
    .option('--release-id <id>', 'Filter by release ID')
    .option('--step <id>', 'Filter by step ID or display ID')
    .option('--json', 'JSON output')
    .action(async (project, opts) => {
      const parentOpts = tasks.opts<{
        json?: boolean;
        priority?: string;
        project?: string;
        releaseId?: string;
        status?: string;
        step?: string;
      }>();
      await listTasks({
        json: opts.json ?? parentOpts.json,
        priority: opts.priority ?? parentOpts.priority,
        project: opts.project ?? project ?? parentOpts.project,
        releaseId: opts.releaseId ?? parentOpts.releaseId,
        status: opts.status ?? parentOpts.status,
        step: opts.step ?? parentOpts.step,
      });
    });

  tasks
    .command('show')
    .alias('get')
    .description('Show task details')
    .argument('<id>', 'Task ID')
    .option('--project <id>', 'Project ID or slug (used to resolve display IDs)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const parentOpts = tasks.opts<{
        json?: boolean;
        project?: string;
      }>();
      await showTask(id, {
        json: opts.json ?? parentOpts.json,
        project: opts.project ?? parentOpts.project,
      });
    });

  tasks
    .command('create')
    .description('Create a task')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--file <path>', 'JSON file with task data')
    .option('--title <title>', 'Task title')
    .option('--display-id <displayId>', 'Task display ID')
    .option('--user-story <story>', 'User story')
    .option('--acceptance-criteria <text>', 'Acceptance criteria text')
    .option('--acceptance-criteria-json <json>', 'Acceptance criteria JSON')
    .option('--priority <priority>', 'Priority')
    .option('--status <status>', 'Status')
    .option('--device <device>', 'Device')
    .option('--lifecycle <lifecycle>', 'Lifecycle')
    .option('--source-type <type>', 'Source type')
    .option('--source-excerpt <text>', 'Source excerpt')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      let body: CreateTaskInput;

      if (opts.file) {
        body = await readJsonFile<CreateTaskInput>(opts.file);
      } else {
        if (!opts.title || !opts.displayId) {
          console.error('Provide --file <path> or both --title and --display-id');
          process.exit(1);
        }
        body = {
          title: opts.title,
          display_id: opts.displayId,
          ...(opts.userStory && { user_story: opts.userStory }),
          ...(opts.acceptanceCriteria && { acceptance_criteria: opts.acceptanceCriteria }),
          ...(opts.acceptanceCriteriaJson && {
            acceptance_criteria: parseJsonOption(opts.acceptanceCriteriaJson, 'acceptance criteria'),
          }),
          ...(opts.priority && { priority: opts.priority }),
          ...(opts.status && { status: opts.status }),
          ...(opts.device && { device: opts.device }),
          ...(opts.lifecycle && { lifecycle: opts.lifecycle }),
          ...(opts.sourceType && { source_type: opts.sourceType }),
          ...(opts.sourceExcerpt && { source_excerpt: opts.sourceExcerpt }),
        };
      }

      const data = await api<Task>('POST', `/projects/${pid}/tasks`, body);
      if (opts.json) return json(data);
      console.log(`Created task: ${data.display_id} (${data.id})`);
    });

  tasks
    .command('update')
    .description('Update a task')
    .argument('<id>', 'Task ID or display ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--file <path>', 'JSON file with task data')
    .option('--title <title>', 'Task title')
    .option('--display-id <displayId>', 'Task display ID')
    .option('--user-story <story>', 'User story')
    .option('--acceptance-criteria <text>', 'Acceptance criteria text')
    .option('--acceptance-criteria-json <json>', 'Acceptance criteria JSON')
    .option('--priority <priority>', 'Priority')
    .option('--status <status>', 'Status')
    .option('--device <device>', 'Device')
    .option('--lifecycle <lifecycle>', 'Lifecycle')
    .option('--source-type <type>', 'Source type')
    .option('--source-excerpt <text>', 'Source excerpt')
    .option('--release-id <id>', 'Release ID or name')
    .option('--clear-release', 'Clear the release assignment')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const taskId = await resolveTaskId(id, opts.project);
      let body: Record<string, unknown>;

      if (opts.file) {
        body = await readJsonFile<Record<string, unknown>>(opts.file);
      } else {
        const releaseId =
          opts.releaseId && opts.project
            ? await resolveReleaseId(opts.releaseId, opts.project)
            : opts.releaseId;

        body = {
          ...(opts.title && { title: opts.title }),
          ...(opts.displayId && { display_id: opts.displayId }),
          ...(opts.userStory && { user_story: opts.userStory }),
          ...(opts.acceptanceCriteria && { acceptance_criteria: opts.acceptanceCriteria }),
          ...(opts.acceptanceCriteriaJson && {
            acceptance_criteria: parseJsonOption(opts.acceptanceCriteriaJson, 'acceptance criteria'),
          }),
          ...(opts.priority && { priority: opts.priority }),
          ...(opts.status && { status: opts.status }),
          ...(opts.device && { device: opts.device }),
          ...(opts.lifecycle && { lifecycle: opts.lifecycle }),
          ...(opts.sourceType && { source_type: opts.sourceType }),
          ...(opts.sourceExcerpt && { source_excerpt: opts.sourceExcerpt }),
          ...(releaseId && { release_id: releaseId }),
          ...(opts.clearRelease && { release_id: null }),
        };
      }

      ensureBody(body);
      const data = await api<Task>('PATCH', `/tasks/${taskId}`, body);
      if (opts.json) return json(data);
      console.log(`Updated task: ${data.display_id} (${data.id})`);
    });

  tasks
    .command('place')
    .description('Place a task on a step with a persona')
    .argument('<id>', 'Task ID or display ID')
    .requiredOption('--step <id>', 'Step ID or display ID')
    .requiredOption('--persona <id>', 'Persona ID, code, or name')
    .option('--project <id>', 'Project ID or slug')
    .option('--role <role>', 'Placement role', 'owner')
    .option('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const taskId = await resolveTaskId(id, opts.project);
      const stepId = await resolveStepId(opts.step, opts.project);
      const personaId = await resolvePersonaId(opts.persona, opts.project);
      const data = await api<PlacementResult>('POST', `/tasks/${taskId}/place`, {
        step_id: stepId,
        persona_id: personaId,
        role: opts.role,
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      });
      if (opts.json) return json(data);
      console.log(`Placed task: ${taskId} -> ${stepId} as ${opts.role}`);
    });

  tasks
    .command('move')
    .description('Move a task placement to a different step')
    .argument('<id>', 'Task ID or display ID')
    .requiredOption('--step <id>', 'Target step ID or display ID')
    .option('--from-step <id>', 'Current step ID or display ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const taskId = await resolveTaskId(id, opts.project);
      const stepId = await resolveStepId(opts.step, opts.project);
      const fromStepId = opts.fromStep
        ? await resolveStepId(opts.fromStep, opts.project)
        : undefined;
      const data = await api<PlacementResult>('PATCH', `/tasks/${taskId}/move`, {
        step_id: stepId,
        ...(fromStepId && { from_step_id: fromStepId }),
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      });
      if (opts.json) return json(data);
      console.log(`Moved task: ${taskId} -> ${stepId}`);
    });

  tasks
    .command('remove-placement')
    .description('Remove a task placement by step-task ID')
    .argument('<id>', 'Step-task placement ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      await api('DELETE', `/step-tasks/${id}`);
      const result = { id, deleted: true };
      if (opts.json) return json(result);
      console.log(`Removed task placement: ${id}`);
    });

  tasks
    .command('reorder')
    .description('Reorder task placements within a step')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--step <id>', 'Step ID or display ID')
    .argument('<placementIds...>', 'Ordered list of step-task placement IDs')
    .option('--json', 'JSON output')
    .action(async (placementIds: string[], opts) => {
      const pid = await autoDetectProject(opts.project);
      const stepId = await resolveStepId(opts.step, pid);
      await api('POST', `/projects/${pid}/tasks/reorder`, {
        step_id: stepId,
        ids: placementIds,
      });
      const result = { project_id: pid, step_id: stepId, ids: placementIds, reordered: placementIds.length };
      if (opts.json) return json(result);
      console.log(`Reordered ${placementIds.length} task placements in step: ${stepId}`);
    });

  tasks
    .command('delete')
    .description('Delete a task')
    .argument('<id>', 'Task ID or display ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const taskId = await resolveTaskId(id, opts.project);
      await api('DELETE', `/tasks/${taskId}`);
      const result = { id: taskId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Deleted task: ${taskId}`);
    });
}

async function listTasks(opts: {
  json?: boolean;
  priority?: string;
  project?: string;
  releaseId?: string;
  status?: string;
  step?: string;
}): Promise<void> {
  const pid = await autoDetectProject(opts.project);

  if (opts.step) {
    const map = await api<MapData>('GET', `/projects/${pid}/map`);
    const step = map.activities
      .flatMap((activity) => activity.steps)
      .find((candidate) =>
        candidate.id === opts.step ||
        candidate.display_id === opts.step ||
        candidate.name === opts.step,
      );
    const data: Task[] = (step?.tasks ?? []).map((task) => ({
      id: task.id,
      display_id: task.display_id,
      title: task.title,
      status: task.status ?? 'unknown',
      priority: task.priority ?? 'unknown',
      release_id: task.release_id ?? null,
      created_at: task.created_at ?? '',
    }));
    if (opts.json) return json(data);
    table(data, ['id', 'display_id', 'title', 'status', 'priority']);
    return;
  }

  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.priority) params.set('priority', opts.priority);
  if (opts.releaseId) {
    const releaseId = await resolveReleaseId(opts.releaseId, pid);
    params.set('release_id', releaseId);
  }
  const qs = params.toString() ? `?${params}` : '';
  const data = await api<Task[]>('GET', `/projects/${pid}/tasks${qs}`);
  if (opts.json) return json(data);
  table(data, ['id', 'display_id', 'title', 'status', 'priority']);
}

async function showTask(id: string, opts: {
  json?: boolean;
  project?: string;
}): Promise<void> {
  const resolved = await resolveTaskId(id, opts.project);
  const data = await api<Task>('GET', `/tasks/${resolved}`);
  if (opts.json) return json(data);
  console.log(`Task: ${data.display_id} (${data.id})`);
  console.log(`Title: ${data.title}`);
  console.log(`Status: ${data.status}`);
  console.log(`Priority: ${data.priority}`);
  if (data.user_story) console.log(`User Story: ${data.user_story}`);
  if (data.device) console.log(`Device: ${data.device}`);
  if (data.lifecycle) console.log(`Lifecycle: ${data.lifecycle}`);
  if (data.release_id) console.log(`Release: ${data.release_id}`);
  if (data.source_type) console.log(`Source Type: ${data.source_type}`);
  if (data.source_excerpt) console.log(`Source Excerpt: ${data.source_excerpt}`);
  const criteria = Array.isArray(data.acceptance_criteria) ? data.acceptance_criteria : [];
  console.log(`Acceptance Criteria: ${criteria.length}`);
  if (Array.isArray(data.placements) && data.placements.length > 0) {
    console.log('Placements:');
    for (const placement of data.placements) {
      console.log(
        `  ${placement.id}  [${placement.step_display_id}] ${placement.step_name}  @${placement.persona_code}  ${placement.role}`,
      );
    }
  }
}

async function resolveTaskId(id: string, project?: string): Promise<string> {
  if (project) {
    const pid = await autoDetectProject(project);
    const tasks = await api<Task[]>('GET', `/projects/${pid}/tasks`);
    return resolveIdFromItems(id, tasks, {
      label: 'Task',
      fields: ['id', 'display_id', 'title'],
      formatter: (task) => `${task.display_id}  ${task.id}  ${task.title}`,
    });
  }

  return id;
}

async function resolveStepId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const map = await api<MapData>('GET', `/projects/${pid}/map`);
  const steps = map.activities.flatMap((activity) => activity.steps);
  return resolveIdFromItems(id, steps, {
    label: 'Step',
    fields: ['id', 'display_id', 'name'],
    formatter: (step) => `${step.display_id}  ${step.id}  ${step.name}`,
  });
}

async function resolveReleaseId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const releases = await api<ReleaseSummary[]>('GET', `/projects/${pid}/releases`);
  return resolveIdFromItems(id, releases, {
    label: 'Release',
    fields: ['id', 'name'],
    formatter: (release) => `${release.name}  ${release.id}  ${release.status}`,
  });
}

async function resolvePersonaId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const personas = await api<PersonaSummary[]>('GET', `/projects/${pid}/personas`);
  return resolveIdFromItems(id, personas, {
    label: 'Persona',
    fields: ['id', 'code', 'name'],
    formatter: (persona) => `${persona.code}  ${persona.id}  ${persona.name}`,
  });
}
