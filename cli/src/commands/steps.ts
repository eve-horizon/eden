import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Step {
  id: string;
  name: string;
  display_id: string;
  sort_order: number;
  activity_id?: string;
  activity_display_id?: string;
  activity_name?: string;
}

interface MapStep {
  id: string;
  name: string;
  display_id: string;
  sort_order: number;
}

interface MapActivity {
  id: string;
  name: string;
  display_id: string;
  steps: MapStep[];
}

interface MapData {
  activities: MapActivity[];
}

export function registerSteps(program: Command): void {
  const steps = program
    .command('step')
    .alias('steps')
    .description('Manage steps')
    .option('--activity <id>', 'Activity ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      if (!opts.activity && !opts.project) {
        console.log(steps.helpInformation());
        return;
      }
      await listSteps(opts);
    });

  steps
    .command('list')
    .description('List steps for an activity or project')
    .option('--activity <id>', 'Activity ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      await listSteps(opts);
    });

  steps
    .command('create')
    .description('Create a step')
    .requiredOption('--activity <id>', 'Activity ID')
    .requiredOption('--name <name>', 'Step name')
    .requiredOption('--display-id <displayId>', 'Display ID')
    .option('--sort-order <n>', 'Sort order', (value) => parseInt(value, 10))
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<Step>('POST', `/activities/${opts.activity}/steps`, {
        name: opts.name,
        display_id: opts.displayId,
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      });
      if (opts.json) return json(data);
      console.log(`Created step: ${data.display_id} (${data.id})`);
    });
}

async function listSteps(opts: {
  activity?: string;
  json?: boolean;
  project?: string;
}): Promise<void> {
  if (!opts.activity && !opts.project) {
    console.error('Provide --activity <id> or --project <id>');
    process.exit(1);
  }

  if (opts.project) {
    const pid = await autoDetectProject(opts.project);
    const map = await api<MapData>('GET', `/projects/${pid}/map`);
    const data: Step[] = map.activities.flatMap((activity) =>
      activity.steps.map((step) => ({
        id: step.id,
        name: step.name,
        display_id: step.display_id,
        sort_order: step.sort_order,
        activity_id: activity.id,
        activity_display_id: activity.display_id,
        activity_name: activity.name,
      })),
    );
    if (opts.json) return json(data);
    table(data, ['id', 'display_id', 'name', 'activity_display_id', 'activity_name', 'sort_order']);
    return;
  }

  const data = await api<Step[]>('GET', `/activities/${opts.activity}/steps`);
  if (opts.json) return json(data);
  table(data, ['id', 'display_id', 'name', 'sort_order']);
}
