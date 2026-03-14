import { Command } from 'commander';
import { api } from '../client.js';
import { json } from '../output.js';
import { autoDetectProject } from './projects.js';

export function registerExport(program: Command): void {
  const exp = program.command('export').description('Export project data');

  exp
    .command('json')
    .description('Export project as JSON')
    .option('--project <id>', 'Project ID')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api('GET', `/projects/${pid}/export/json`);
      json(data);
    });

  exp
    .command('markdown')
    .description('Export project as Markdown')
    .option('--project <id>', 'Project ID')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<string>('GET', `/projects/${pid}/export/markdown`);
      console.log(data);
    });
}
