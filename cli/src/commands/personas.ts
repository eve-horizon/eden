import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { ensureBody, resolveIdFromItems } from '../utils.js';
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

  personas
    .command('update')
    .description('Update a persona')
    .argument('<id>', 'Persona ID, code, or name')
    .option('--project <id>', 'Project ID or slug')
    .option('--name <name>', 'Persona name')
    .option('--color <color>', 'Hex color')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const personaId = await resolvePersonaId(id, opts.project);
      const body = {
        ...(opts.name && { name: opts.name }),
        ...(opts.color && { color: opts.color }),
      };
      ensureBody(body);
      const data = await api<Persona>('PATCH', `/personas/${personaId}`, body);
      if (opts.json) return json(data);
      console.log(`Updated persona: ${data.code} (${data.id})`);
    });

  personas
    .command('delete')
    .description('Delete a persona')
    .argument('<id>', 'Persona ID, code, or name')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const personaId = await resolvePersonaId(id, opts.project);
      await api('DELETE', `/personas/${personaId}`);
      const result = { id: personaId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Deleted persona: ${personaId}`);
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

async function resolvePersonaId(id: string, project?: string): Promise<string> {
  if (!project) return id;
  const pid = await autoDetectProject(project);
  const personas = await api<Persona[]>('GET', `/projects/${pid}/personas`);
  return resolveIdFromItems(id, personas, {
    label: 'Persona',
    fields: ['id', 'code', 'name'],
    formatter: (persona) => `${persona.code}  ${persona.id}  ${persona.name}`,
  });
}
