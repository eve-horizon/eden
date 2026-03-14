import { Command } from 'commander';
import { api } from '../client.js';
import { json } from '../output.js';
import { autoDetectProject } from './projects.js';

export function registerSearch(program: Command): void {
  program
    .command('search')
    .description('Search the project')
    .argument('<query>', 'Search query')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (query, opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<unknown[]>('GET', `/projects/${pid}/search?q=${encodeURIComponent(query)}`);
      if (opts.json) return json(data);
      if (Array.isArray(data) && data.length === 0) {
        console.log('No results found.');
        return;
      }
      json(data);
    });
}
