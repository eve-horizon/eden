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
  const tasks = program.command('task').alias('tasks').description('Manage tasks');

  tasks
    .command('list')
    .description('List tasks')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status')
    .option('--priority <priority>', 'Filter by priority')
    .option('--release-id <id>', 'Filter by release ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.priority) params.set('priority', opts.priority);
      if (opts.releaseId) params.set('release_id', opts.releaseId);
      const qs = params.toString() ? `?${params}` : '';
      const data = await api<Task[]>('GET', `/projects/${pid}/tasks${qs}`);
      if (opts.json) return json(data);
      table(data, ['id', 'display_id', 'title', 'status', 'priority']);
    });

  tasks
    .command('show')
    .description('Show task details')
    .argument('<id>', 'Task ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Task>('GET', `/tasks/${id}`);
      if (opts.json) return json(data);
      console.log(`Task: ${data.display_id} (${data.id})`);
      console.log(`Title: ${data.title}`);
      console.log(`Status: ${data.status}`);
      console.log(`Priority: ${data.priority}`);
      if (data.release_id) console.log(`Release: ${data.release_id}`);
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
