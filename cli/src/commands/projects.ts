import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { ensureBody, UUID_RE } from '../utils.js';

interface Project {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export function registerProjects(program: Command): void {
  const projects = program.command('projects').alias('project').description('Manage Eden projects');

  projects
    .command('list')
    .description('List all projects')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<Project[]>('GET', '/projects');
      if (opts.json) return json(data);
      table(data, ['id', 'name', 'slug']);
    });

  projects
    .command('create')
    .description('Create a project')
    .requiredOption('--name <name>', 'Project name')
    .requiredOption('--slug <slug>', 'Project slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<Project>('POST', '/projects', {
        name: opts.name,
        slug: opts.slug,
      });
      if (opts.json) return json(data);
      console.log(`Created project: ${data.id} (${data.slug})`);
    });

  projects
    .command('show')
    .alias('get')
    .description('Show project details')
    .argument('<id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Project>('GET', `/projects/${id}`);
      if (opts.json) return json(data);
      console.log(`Project: ${data.name}`);
      console.log(`ID: ${data.id}`);
      console.log(`Slug: ${data.slug}`);
      console.log(`Created: ${data.created_at}`);
    });

  projects
    .command('delete')
    .description('Delete a project')
    .argument('<id>', 'Project ID')
    .action(async (id) => {
      await api('DELETE', `/projects/${id}`);
      console.log(`Deleted project: ${id}`);
    });

  projects
    .command('update')
    .description('Update a project')
    .argument('<id>', 'Project ID or slug')
    .option('--name <name>', 'Project name')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const projectId = await autoDetectProject(id);
      const body = {
        ...(opts.name && { name: opts.name }),
      };
      ensureBody(body);
      const data = await api<Project>('PATCH', `/projects/${projectId}`, body);
      if (opts.json) return json(data);
      console.log(`Updated project: ${data.id} (${data.slug})`);
    });
}

/** Resolve a project identifier (UUID or slug) to a UUID, or auto-detect when only one exists. */
export async function autoDetectProject(explicit?: string): Promise<string> {
  if (explicit && UUID_RE.test(explicit)) return explicit;

  const projects = await api<Project[]>('GET', '/projects');

  // If a non-UUID value was given, treat it as a slug
  if (explicit) {
    const match = projects.find((p) => p.slug === explicit || p.name === explicit);
    if (match) return match.id;
    console.error(`Project not found: "${explicit}". Available projects:`);
    for (const p of projects) console.error(`  ${p.slug}  ${p.id}  ${p.name}`);
    process.exit(1);
  }

  if (projects.length === 1) return projects[0].id;
  if (projects.length === 0) {
    console.error('No projects found.');
    process.exit(1);
  }
  console.error('Multiple projects found. Specify --project <id-or-slug>:');
  for (const p of projects) console.error(`  ${p.slug}  ${p.id}  ${p.name}`);
  process.exit(1);
}
