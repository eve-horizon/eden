import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';

interface Step {
  id: string;
  name: string;
  display_id: string;
  sort_order: number;
}

export function registerSteps(program: Command): void {
  const steps = program.command('step').description('Manage steps');

  steps
    .command('list')
    .description('List steps for an activity')
    .requiredOption('--activity <id>', 'Activity ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<Step[]>('GET', `/activities/${opts.activity}/steps`);
      if (opts.json) return json(data);
      table(data, ['id', 'display_id', 'name', 'sort_order']);
    });
}
