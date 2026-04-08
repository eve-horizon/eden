import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Persona {
  id: string;
  code: string;
  name: string;
  color: string;
}

export function registerPersonas(program: Command): void {
  const personas = program
    .command('persona')
    .alias('personas')
    .description('Manage personas')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      if (!opts.project) {
        console.log(personas.helpInformation());
        return;
      }
      await listPersonas(opts);
    });

  personas
    .command('list')
    .description('List personas')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (project, opts) => {
      const parentOpts = personas.opts<{ json?: boolean; project?: string }>();
      await listPersonas({
        json: opts.json ?? parentOpts.json,
        project: opts.project ?? project ?? parentOpts.project,
      });
    });

  personas
    .command('create')
    .description('Create a persona')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--code <code>', 'Persona code')
    .requiredOption('--name <name>', 'Persona name')
    .requiredOption('--color <color>', 'Hex color')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Persona>('POST', `/projects/${pid}/personas`, {
        code: opts.code,
        name: opts.name,
        color: opts.color,
      });
      if (opts.json) return json(data);
      console.log(`Created persona: ${data.code} (${data.id})`);
    });
}

async function listPersonas(opts: {
  json?: boolean;
  project?: string;
}): Promise<void> {
  const pid = await autoDetectProject(opts.project);
  const data = await api<Persona[]>('GET', `/projects/${pid}/personas`);
  if (opts.json) return json(data);
  table(data, ['id', 'code', 'name', 'color']);
}
