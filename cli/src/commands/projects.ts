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

/** Auto-detect project ID when only one exists */
export async function autoDetectProject(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const projects = await api<Project[]>('GET', '/projects');
  if (projects.length === 1) return projects[0].id;
  if (projects.length === 0) {
    console.error('No projects found.');
    process.exit(1);
  }
  console.error('Multiple projects found. Specify --project <id>:');
  for (const p of projects) console.error(`  ${p.id}  ${p.name}`);
  process.exit(1);
}
