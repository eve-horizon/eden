import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Release {
  id: string;
  name: string;
  target_date: string | null;
  status: string;
  created_at: string;
}

export function registerReleases(program: Command): void {
  const releases = program.command('release').description('Manage releases');

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
    .action(async (id, taskIds: string[]) => {
      await api('POST', `/releases/${id}/tasks`, { task_ids: taskIds });
      console.log(`Assigned ${taskIds.length} task(s) to release: ${id}`);
    });

  releases
    .command('remove-task')
    .description('Remove a task from a release')
    .argument('<id>', 'Release ID')
    .argument('<taskId>', 'Task ID')
    .action(async (id, taskId) => {
      await api('DELETE', `/releases/${id}/tasks/${taskId}`);
      console.log(`Removed task ${taskId} from release: ${id}`);
    });
}
