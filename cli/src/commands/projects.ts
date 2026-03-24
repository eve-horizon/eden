import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';

interface Project {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export function registerProjects(program: Command): void {
  const projects = program.command('projects').description('Manage Eden projects');

  projects
    .command('list')
    .description('List all projects')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<Project[]>('GET', '/projects');
      if (opts.json) return json(data);
      table(data, ['id', 'name', 'slug']);
    });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
