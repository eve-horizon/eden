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
    .argument('[id]', 'Step ID, display ID, or name')
    .option('--activity <id>', 'Activity ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      if (!id && !opts.activity && !opts.project) {
        console.log(steps.helpInformation());
        return;
      }
      if (id) {
        await showStep(id, opts);
        return;
      }
      await listSteps(opts);
    });

  steps
    .command('list')
    .description('List steps for an activity or project')
    .argument('[project]', 'Project ID or slug')
    .option('--activity <id>', 'Activity ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (project, _opts, command: Command) => {
      const mergedOpts = command.optsWithGlobals() as {
        activity?: string;
        json?: boolean;
        project?: string;
      };
      await listSteps({
        activity: mergedOpts.activity,
        json: mergedOpts.json,
        project: mergedOpts.project ?? project,
      });
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

  steps
    .command('show')
    .alias('get')
    .description('Show step details')
    .argument('<id>', 'Step ID, display ID, or name')
    .option('--activity <id>', 'Activity ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const parentOpts = steps.opts<{
        activity?: string;
        json?: boolean;
        project?: string;
      }>();
      await showStep(id, {
        activity: opts.activity ?? parentOpts.activity,
        json: opts.json ?? parentOpts.json,
        project: opts.project ?? parentOpts.project,
      });
    });
}

async function listSteps(opts: {
  activity?: string;
  json?: boolean;
  project?: string;
}): Promise<void> {
  if (!opts.activity && !opts.project) {
    console.log('Provide --activity <id> or --project <id>');
    return;
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

async function showStep(optsId: string, opts: {
  activity?: string;
  json?: boolean;
  project?: string;
}): Promise<void> {
  const data = await listStepsData(opts);
  const step = data.find((candidate) =>
    candidate.id === optsId ||
    candidate.display_id === optsId ||
    candidate.name === optsId,
  );

  if (!step) {
    console.error(`Step not found: "${optsId}"`);
    process.exit(1);
  }

  if (opts.json) return json(step);
  console.log(`Step: ${step.display_id} (${step.id})`);
  console.log(`Name: ${step.name}`);
  if (step.activity_display_id || step.activity_name) {
    console.log(`Activity: ${step.activity_display_id ?? step.activity_id ?? '(unknown)'}${step.activity_name ? ` ${step.activity_name}` : ''}`);
  }
  console.log(`Sort Order: ${step.sort_order}`);
}

async function listStepsData(opts: {
  activity?: string;
  project?: string;
}): Promise<Step[]> {
  if (!opts.activity && !opts.project) {
    console.error('Provide --activity <id> or --project <id>');
    process.exit(1);
  }

  if (opts.project) {
    const pid = await autoDetectProject(opts.project);
    const map = await api<MapData>('GET', `/projects/${pid}/map`);
    return map.activities.flatMap((activity) =>
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
  }

  return api<Step[]>('GET', `/activities/${opts.activity}/steps`);
}
