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
  const personas = program.command('persona').description('Manage personas');

  personas
    .command('list')
    .description('List personas')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Persona[]>('GET', `/projects/${pid}/personas`);
      if (opts.json) return json(data);
      table(data, ['id', 'code', 'name', 'color']);
    });
}
