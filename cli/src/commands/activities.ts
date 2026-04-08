import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Activity {
  id: string;
  name: string;
  display_id: string;
  sort_order: number;
}

export function registerActivities(program: Command): void {
  const activities = program.command('activity').alias('activities').description('Manage activities');

  activities
    .command('list')
    .description('List activities')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (project, opts) => {
      const pid = await autoDetectProject(opts.project ?? project);
      const data = await api<Activity[]>('GET', `/projects/${pid}/activities`);
      if (opts.json) return json(data);
      table(data, ['id', 'display_id', 'name', 'sort_order']);
    });

  activities
    .command('create')
    .description('Create an activity')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--name <name>', 'Activity name')
    .requiredOption('--display-id <displayId>', 'Display ID')
    .option('--sort-order <n>', 'Sort order', (value) => parseInt(value, 10))
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Activity>('POST', `/projects/${pid}/activities`, {
        name: opts.name,
        display_id: opts.displayId,
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      });
      if (opts.json) return json(data);
      console.log(`Created activity: ${data.display_id} (${data.id})`);
    });
}
