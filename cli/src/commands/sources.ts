import { readFile, stat } from 'fs/promises';
import { basename, extname } from 'path';
import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { resolveIdFromItems } from '../utils.js';
import { autoDetectProject } from './projects.js';

interface Source {
  id: string;
  filename: string;
  status: string;
  content_type: string | null;
  file_size: number | null;
  eve_ingest_id?: string | null;
  eve_job_id?: string | null;
  upload_url?: string;
  download_url?: string | null;
  error_message?: string | null;
  created_at: string;
}

interface SourceTask {
  id: string;
  display_id: string;
  title: string;
  priority: string;
  status: string;
}

export function registerSources(program: Command): void {
  const src = program.command('source').alias('sources').description('Manage ingestion sources');

  src.command('show')
    .alias('get')
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

  src.command('create')
    .description('Create a source record and optionally upload a file')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--file <path>', 'File to upload')
    .option('--filename <name>', 'Filename override')
    .option('--content-type <type>', 'Content type override')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const filename = opts.filename ?? (opts.file ? basename(opts.file) : undefined);
      if (!filename) {
        console.error('Provide --file <path> or --filename <name>');
        process.exit(1);
      }

      const fileSize = opts.file ? (await stat(opts.file)).size : undefined;
      const contentType = opts.contentType ?? inferContentType(filename);
      const result = await api<Source>('POST', `/projects/${pid}/sources`, {
        filename,
        ...(contentType && { content_type: contentType }),
        ...(fileSize !== undefined && { file_size: fileSize }),
      });

      if (opts.file && result.upload_url && !result.upload_url.startsWith('data:')) {
        const contents = await readFile(opts.file);
        const upload = await fetch(result.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
          },
          body: contents,
        });

        if (!upload.ok) {
          console.error(`Upload failed: ${upload.status} ${upload.statusText}`);
          process.exit(1);
        }
      }

      if (opts.json) return json(result);
      console.log(`Created source: ${result.id} (${result.status})`);
      if (opts.file) console.log(`Uploaded file: ${filename}`);
    });

  src.command('confirm')
    .description('Confirm a source and trigger ingestion')
    .argument('<id>', 'Source ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const result = await api<Source>('POST', `/sources/${id}/confirm`);
      if (opts.json) return json(result);
      console.log(`Confirmed source: ${id} (${result.status})`);
    });

  src.command('tasks')
    .description('List tasks linked to a source')
    .argument('<id>', 'Source ID or filename')
    .option('--project <id>', 'Project ID or slug (used to resolve filenames)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const sourceId = await resolveSourceId(id, opts.project);
      const data = await api<SourceTask[]>('GET', `/sources/${sourceId}/tasks`);
      if (opts.json) return json(data);
      table(data, ['display_id', 'title', 'priority', 'status']);
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

function inferContentType(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case '.md':
      return 'text/markdown';
    case '.pdf':
      return 'application/pdf';
    case '.json':
      return 'application/json';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

async function resolveSourceId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const sources = await api<Source[]>('GET', `/projects/${pid}/sources`);
  return resolveIdFromItems(id, sources, {
    label: 'Source',
    fields: ['id', 'filename'],
    formatter: (source) => `${source.filename}  ${source.id}  ${source.status}`,
  });
}
