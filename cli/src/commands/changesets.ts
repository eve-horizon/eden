import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Changeset {
  id: string;
  title?: string;
  status: string;
  source?: string;
  created_at: string;
  items?: unknown[];
  warnings?: Array<{ path: string; message: string }>;
}

export function registerChangesets(program: Command): void {
  const cs = program.command('changeset').alias('changesets').description('Manage changesets');

  cs.command('list')
    .description('List changesets')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status (pending/accepted/rejected)')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const params = opts.status ? `?status=${opts.status}` : '';
      const data = await api<Changeset[]>('GET', `/projects/${pid}/changesets${params}`);
      if (opts.json) return json(data);
      table(data, ['id', 'title', 'status', 'source', 'created_at']);
    });

  cs.command('create')
    .description('Create a changeset from a JSON file')
    .option('--project <id>', 'Project ID or slug')
    .requiredOption('--file <path>', 'JSON file with changeset data')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const body = JSON.parse(await readFile(opts.file, 'utf8'));
      const result = await api<Changeset>('POST', `/projects/${pid}/changesets`, body);
      if (opts.json) return json(result);
      console.log(`Created changeset: ${result.id} (${result.status})`);
      for (const warning of result.warnings ?? []) {
        const prefix = warning.path ? `${warning.path} - ` : '';
        console.error(`  warning: ${prefix}${warning.message}`);
      }
    });

  cs.command('show')
    .description('Show changeset details')
    .requiredOption('--id <id>', 'Changeset ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<Changeset>('GET', `/changesets/${opts.id}`);
      if (opts.json) return json(data);
      console.log(`Changeset: ${data.id}`);
      console.log(`Status: ${data.status}`);
      console.log(`Title: ${data.title ?? '(none)'}`);
      if (data.items) {
        console.log(`Items: ${data.items.length}`);
        json(data.items);
      }
    });

  cs.command('accept')
    .description('Accept a changeset')
    .argument('<id>', 'Changeset ID')
    .action(async (id) => {
      await api('POST', `/changesets/${id}/accept`);
      console.log(`Accepted: ${id}`);
    });

  cs.command('reject')
    .description('Reject a changeset')
    .argument('<id>', 'Changeset ID')
    .action(async (id) => {
      await api('POST', `/changesets/${id}/reject`);
      console.log(`Rejected: ${id}`);
    });
}
