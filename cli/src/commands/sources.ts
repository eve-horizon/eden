import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Source {
  id: string;
  filename: string;
  status: string;
  content_type: string | null;
  file_size: number | null;
  created_at: string;
}

export function registerSources(program: Command): void {
  const src = program.command('source').description('Manage ingestion sources');

  src.command('show')
    .description('Show source details')
    .argument('<id>', 'Source ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Source>('GET', `/sources/${id}`);
      if (opts.json) return json(data);
      console.log(`Source: ${data.id}`);
      console.log(`Filename: ${data.filename}`);
      console.log(`Status: ${data.status}`);
      if (data.content_type) console.log(`Type: ${data.content_type}`);
      if (data.file_size) console.log(`Size: ${data.file_size}`);
      console.log(`Created: ${data.created_at}`);
    });

  src.command('list')
    .description('List ingestion sources')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Source[]>('GET', `/projects/${pid}/sources`);
      if (opts.json) return json(data);
      table(data, ['id', 'filename', 'status', 'file_size', 'created_at']);
    });

  src.command('update-status')
    .description('Update source processing status')
    .requiredOption('--source <id>', 'Source ID')
    .requiredOption('--status <status>', 'New status (extracted, synthesized, done, failed)')
    .option('--error <message>', 'Error message (for failed status)')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const body: Record<string, string> = { status: opts.status };
      if (opts.error) body.error_message = opts.error;
      const result = await api<Source>('POST', `/sources/${opts.source}/status`, body);
      if (opts.json) return json(result);
      console.log(`Source ${opts.source} → ${opts.status}`);
    });
}
