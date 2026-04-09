import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { ensureBody, parseInteger, resolveIdFromItems } from '../utils.js';
import { autoDetectProject } from './projects.js';

interface Activity {
  id: string;
  name: string;
  display_id: string;
  sort_order: number;
  steps?: unknown[];
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

  activities
    .command('update')
    .description('Update an activity')
    .argument('<id>', 'Activity ID or display ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--name <name>', 'Activity name')
    .option('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const activityId = await resolveActivityId(id, opts.project);
      const body = {
        ...(opts.name && { name: opts.name }),
        ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
      };
      ensureBody(body);
      const data = await api<Activity>('PATCH', `/activities/${activityId}`, body);
      if (opts.json) return json(data);
      console.log(`Updated activity: ${data.display_id} (${data.id})`);
    });

  activities
    .command('reorder')
    .description('Reorder activities within a project')
    .requiredOption('--project <id>', 'Project ID or slug')
    .argument('<activityIds...>', 'Ordered list of activity IDs or display IDs')
    .option('--json', 'JSON output')
    .action(async (activityIds: string[], opts) => {
      const pid = await autoDetectProject(opts.project);
      const ids = await Promise.all(activityIds.map((value) => resolveActivityId(value, pid)));
      await api('POST', `/projects/${pid}/activities/reorder`, { ids });
      const result = { project_id: pid, ids, reordered: ids.length };
      if (opts.json) return json(result);
      console.log(`Reordered ${ids.length} activities in project: ${pid}`);
    });

  activities
    .command('set-order')
    .description('Set the sort order for a single activity')
    .argument('<id>', 'Activity ID or display ID')
    .requiredOption('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const activityId = await resolveActivityId(id, opts.project);
      const data = await api<Activity>('PATCH', `/activities/${activityId}/reorder`, {
        sort_order: opts.sortOrder,
      });
      if (opts.json) return json(data);
      console.log(`Updated activity order: ${data.display_id} -> ${data.sort_order}`);
    });

  activities
    .command('delete')
    .description('Delete an activity')
    .argument('<id>', 'Activity ID or display ID')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const activityId = await resolveActivityId(id, opts.project);
      await api('DELETE', `/activities/${activityId}`);
      const result = { id: activityId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Deleted activity: ${activityId}`);
    });
}

async function listActivities(project?: string): Promise<Activity[]> {
  const pid = await autoDetectProject(project);
  const data = await api<Activity[]>('GET', `/projects/${pid}/activities`);
  return data.map((activity) => ({
    id: activity.id,
    name: activity.name,
    display_id: activity.display_id,
    sort_order: activity.sort_order,
  }));
}

async function resolveActivityId(id: string, project?: string): Promise<string> {
  if (!project) return id;
  const activities = await listActivities(project);
  return resolveIdFromItems(id, activities, {
    label: 'Activity',
    fields: ['id', 'display_id', 'name'],
    formatter: (activity) => `${activity.display_id}  ${activity.id}  ${activity.name}`,
  });
}
