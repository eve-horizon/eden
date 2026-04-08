import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Task {
  id: string;
  display_id: string;
  title: string;
  status: string;
  priority: string;
  release_id: string | null;
  created_at: string;
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
        body = JSON.parse(await readFile(opts.file, 'utf8')) as CreateTaskInput;
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
    .command('place')
    .description('Place a task on a step with a persona')
    .argument('<id>', 'Task ID')
    .requiredOption('--step <id>', 'Step ID')
    .requiredOption('--persona <id>', 'Persona ID')
    .option('--role <role>', 'Placement role', 'owner')
    .option('--sort-order <n>', 'Sort order', (value) => parseInt(value, 10))
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Record<string, unknown>>('POST', `/tasks/${id}/place`, {
        step_id: opts.step,
        persona_id: opts.persona,
        role: opts.role,
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      });
      if (opts.json) return json(data);
      console.log(`Placed task: ${id} -> ${opts.step} as ${opts.role}`);
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
  if (opts.releaseId) params.set('release_id', opts.releaseId);
  const qs = params.toString() ? `?${params}` : '';
  const data = await api<Task[]>('GET', `/projects/${pid}/tasks${qs}`);
  if (opts.json) return json(data);
  table(data, ['id', 'display_id', 'title', 'status', 'priority']);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (data.release_id) console.log(`Release: ${data.release_id}`);
}

async function resolveTaskId(id: string, project?: string): Promise<string> {
  if (project) {
    const pid = await autoDetectProject(project);
    const tasks = await api<Task[]>('GET', `/projects/${pid}/tasks`);
    const match = tasks.find((candidate) =>
      candidate.id === id ||
      candidate.display_id === id ||
      candidate.title === id,
    );
    if (match) {
      return match.id;
    }
  }

  if (UUID_RE.test(id)) {
    return id;
  }

  console.error(`Task "${id}" looks like a display ID or title. Re-run with --project <id-or-slug> so it can be resolved safely.`);
  process.exit(1);
}
