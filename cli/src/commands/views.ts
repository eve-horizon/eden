import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import {
  ensureBody,
  parseInteger,
  parseJsonOption,
  readJsonFile,
  resolveIdFromItems,
} from '../utils.js';
import { autoDetectProject } from './projects.js';

interface MapView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  filter: Record<string, unknown> | null;
  sort_order: number;
  created_at: string;
}

interface ViewInput {
  name?: string;
  slug?: string;
  description?: string;
  filter?: Record<string, unknown>;
  sort_order?: number;
}

export function registerViews(program: Command): void {
  const views = program.command('view').alias('views').description('Manage saved map views');

  views
    .command('list')
    .description('List saved views')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (project, opts) => {
      const pid = await autoDetectProject(opts.project ?? project);
      const data = await api<MapView[]>('GET', `/projects/${pid}/views`);
      if (opts.json) return json(data);
      table(data, ['id', 'name', 'slug', 'sort_order', 'created_at']);
    });

  views
    .command('create')
    .description('Create a saved view')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--file <path>', 'JSON file with view data')
    .option('--name <name>', 'View name')
    .option('--slug <slug>', 'View slug')
    .option('--description <text>', 'View description')
    .option('--filter <json>', 'Filter JSON')
    .option('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const body = await loadViewInput(opts);
      ensureBody(body as Record<string, unknown>, 'Provide --file <path> or at least --name <name>');
      if (!body.name) {
        console.error('View creation requires a name');
        process.exit(1);
      }
      const data = await api<MapView>('POST', `/projects/${pid}/views`, body);
      if (opts.json) return json(data);
      console.log(`Created view: ${data.name} (${data.id})`);
    });

  views
    .command('update')
    .description('Update a saved view')
    .argument('<id>', 'View ID, slug, or name')
    .option('--project <id>', 'Project ID or slug (used to resolve non-UUID identifiers)')
    .option('--file <path>', 'JSON file with view data')
    .option('--name <name>', 'View name')
    .option('--slug <slug>', 'View slug')
    .option('--description <text>', 'View description')
    .option('--filter <json>', 'Filter JSON')
    .option('--sort-order <n>', 'Sort order', (value) => parseInteger(value, 'sort order'))
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const viewId = await resolveViewId(id, opts.project);
      const body = await loadViewInput(opts);
      ensureBody(body as Record<string, unknown>);
      const data = await api<MapView>('PATCH', `/views/${viewId}`, body);
      if (opts.json) return json(data);
      console.log(`Updated view: ${data.name} (${data.id})`);
    });

  views
    .command('delete')
    .description('Delete a saved view')
    .argument('<id>', 'View ID, slug, or name')
    .option('--project <id>', 'Project ID or slug (used to resolve non-UUID identifiers)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const viewId = await resolveViewId(id, opts.project);
      await api('DELETE', `/views/${viewId}`);
      const result = { id: viewId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Deleted view: ${viewId}`);
    });
}

async function loadViewInput(opts: {
  file?: string;
  name?: string;
  slug?: string;
  description?: string;
  filter?: string;
  sortOrder?: number;
}): Promise<ViewInput> {
  if (opts.file) {
    return readJsonFile<ViewInput>(opts.file);
  }

  return {
    ...(opts.name && { name: opts.name }),
    ...(opts.slug && { slug: opts.slug }),
    ...(opts.description && { description: opts.description }),
    ...(opts.filter && { filter: parseJsonOption<Record<string, unknown>>(opts.filter, 'view filter') }),
    ...(opts.sortOrder !== undefined && { sort_order: opts.sortOrder }),
  };
}

async function resolveViewId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const views = await api<MapView[]>('GET', `/projects/${pid}/views`);
  return resolveIdFromItems(id, views, {
    label: 'View',
    fields: ['id', 'slug', 'name'],
    formatter: (view) => `${view.slug}  ${view.id}  ${view.name}`,
  });
}
