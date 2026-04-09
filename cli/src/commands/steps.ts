import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { ensureBody, parseInteger, resolveIdFromItems } from '../utils.js';
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

  steps
    .command('update')
    .description('Update a step')
    .argument('<id>', 'Step ID, display ID, or name')
    .option('--activity <id>', 'Activity ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--name <name>', 'Step name')
    .option('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const stepId = await resolveStepId(id, {
        activity: opts.activity,
        project: opts.project,
      });
      const body = {
        ...(opts.name && { name: opts.name }),
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      };
      ensureBody(body);
      const data = await api<Step>('PATCH', `/steps/${stepId}`, body);
      if (opts.json) return json(data);
      console.log(`Updated step: ${data.display_id} (${data.id})`);
    });

  steps
    .command('move')
    .description('Move a step to a different activity')
    .argument('<id>', 'Step ID, display ID, or name')
    .requiredOption('--activity <id>', 'Target activity ID or display ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const stepId = await resolveStepId(id, { project: opts.project });
      const activityId = await resolveActivityId(opts.activity, opts.project);
      const data = await api<Step>('PATCH', `/steps/${stepId}/move`, {
        activity_id: activityId,
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      });
      if (opts.json) return json(data);
      console.log(`Moved step: ${data.display_id} -> activity ${activityId}`);
    });

  steps
    .command('reorder')
    .description('Reorder steps within an activity')
    .requiredOption('--activity <id>', 'Activity ID or display ID')
    .option('--project <id>', 'Project ID or slug')
    .argument('<stepIds...>', 'Ordered list of step IDs, display IDs, or names')
    .option('--json', 'JSON output')
    .action(async (stepIds: string[], opts) => {
      const activityId = await resolveActivityId(opts.activity, opts.project);
      const ids = await Promise.all(
        stepIds.map((value) => resolveStepId(value, { activity: activityId, project: opts.project })),
      );
      await api('POST', `/activities/${activityId}/steps/reorder`, { ids });
      const result = { activity_id: activityId, ids, reordered: ids.length };
      if (opts.json) return json(result);
      console.log(`Reordered ${ids.length} steps in activity: ${activityId}`);
    });

  steps
    .command('delete')
    .description('Delete a step')
    .argument('<id>', 'Step ID, display ID, or name')
    .option('--activity <id>', 'Activity ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const stepId = await resolveStepId(id, {
        activity: opts.activity,
        project: opts.project,
      });
      await api('DELETE', `/steps/${stepId}`);
      const result = { id: stepId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Deleted step: ${stepId}`);
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

async function resolveStepId(id: string, opts: {
  activity?: string;
  project?: string;
}): Promise<string> {
  if (!opts.activity && !opts.project) {
    return id;
  }

  const steps = await listStepsData(opts);
  return resolveIdFromItems(id, steps, {
    label: 'Step',
    fields: ['id', 'display_id', 'name'],
    formatter: (step) => `${step.display_id}  ${step.id}  ${step.name}`,
  });
}

async function resolveActivityId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const activities = await api<MapActivity[]>('GET', `/projects/${pid}/activities`);
  return resolveIdFromItems(id, activities, {
    label: 'Activity',
    fields: ['id', 'display_id', 'name'],
    formatter: (activity) => `${activity.display_id}  ${activity.id}  ${activity.name}`,
  });
}
