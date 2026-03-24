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
  const activities = program.command('activity').description('Manage activities');

  activities
    .command('list')
    .description('List activities')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Activity[]>('GET', `/projects/${pid}/activities`);
      if (opts.json) return json(data);
      table(data, ['id', 'display_id', 'name', 'sort_order']);
    });
}
