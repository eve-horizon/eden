import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { ensureBody, resolveIdFromItems } from '../utils.js';
import { autoDetectProject } from './projects.js';

interface Release {
  id: string;
  name: string;
  target_date: string | null;
  status: string;
  created_at: string;
  task_count?: number;
}

interface ReleaseTask {
  id: string;
  display_id: string;
  title: string;
  priority: string | null;
  role: string | null;
  persona_color: string | null;
}

export function registerReleases(program: Command): void {
  const releases = program.command('release').alias('releases').description('Manage releases');

  releases
    .command('list')
    .description('List releases')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Release[]>('GET', `/projects/${pid}/releases`);
      if (opts.json) return json(data);
      table(data, ['id', 'name', 'target_date', 'status', 'created_at']);
    });

  releases
    .command('create')
    .description('Create a release')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--name <name>', 'Release name')
    .option('--target-date <date>', 'Target date (YYYY-MM-DD)')
    .option('--status <status>', 'Release status')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Release>('POST', `/projects/${pid}/releases`, {
        name: opts.name,
        ...(opts.targetDate && { target_date: opts.targetDate }),
        ...(opts.status && { status: opts.status }),
      });
      if (opts.json) return json(data);
      console.log(`Created release: ${data.name} (${data.id})`);
    });

  releases
    .command('assign')
    .description('Assign tasks to a release')
    .argument('<id>', 'Release ID')
    .argument('<taskIds...>', 'One or more task IDs')
    .option('--json', 'JSON output')
    .action(async (id, taskIds: string[], opts) => {
      await api('POST', `/releases/${id}/tasks`, { task_ids: taskIds });
      const result = { id, task_ids: taskIds, assigned: taskIds.length };
      if (opts.json) return json(result);
      console.log(`Assigned ${taskIds.length} task(s) to release: ${id}`);
    });

  releases
    .command('remove-task')
    .description('Remove a task from a release')
    .argument('<id>', 'Release ID')
    .argument('<taskId>', 'Task ID')
    .option('--json', 'JSON output')
    .action(async (id, taskId, opts) => {
      await api('DELETE', `/releases/${id}/tasks/${taskId}`);
      const result = { id, task_id: taskId, removed: true };
      if (opts.json) return json(result);
      console.log(`Removed task ${taskId} from release: ${id}`);
    });

  releases
    .command('tasks')
    .description('List tasks assigned to a release')
    .argument('<id>', 'Release ID or name')
    .option('--project <id>', 'Project ID or slug (used to resolve release names)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const releaseId = await resolveReleaseId(id, opts.project);
      const data = await api<ReleaseTask[]>('GET', `/releases/${releaseId}/tasks`);
      if (opts.json) return json(data);
      table(data, ['display_id', 'title', 'priority', 'role', 'persona_color']);
    });

  releases
    .command('update')
    .description('Update a release')
    .argument('<id>', 'Release ID or name')
    .option('--project <id>', 'Project ID or slug (used to resolve release names)')
    .option('--name <name>', 'Release name')
    .option('--target-date <date>', 'Target date (YYYY-MM-DD)')
    .option('--status <status>', 'Release status')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const releaseId = await resolveReleaseId(id, opts.project);
      const body = {
        ...(opts.name && { name: opts.name }),
        ...(opts.targetDate && { target_date: opts.targetDate }),
        ...(opts.status && { status: opts.status }),
      };
      ensureBody(body);
      const data = await api<Release>('PATCH', `/releases/${releaseId}`, body);
      if (opts.json) return json(data);
      console.log(`Updated release: ${data.name} (${data.id})`);
    });

  releases
    .command('delete')
    .description('Delete a release')
    .argument('<id>', 'Release ID or name')
    .option('--project <id>', 'Project ID or slug (used to resolve release names)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const releaseId = await resolveReleaseId(id, opts.project);
      await api('DELETE', `/releases/${releaseId}`);
      const result = { id: releaseId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Deleted release: ${releaseId}`);
    });
}

async function resolveReleaseId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const releases = await api<Release[]>('GET', `/projects/${pid}/releases`);
  return resolveIdFromItems(id, releases, {
    label: 'Release',
    fields: ['id', 'name'],
    formatter: (release) => `${release.name}  ${release.id}  ${release.status}`,
  });
}
