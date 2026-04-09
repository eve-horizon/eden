import { Command } from 'commander';
import { api } from '../client.js';
import { json } from '../output.js';
import { resolveIdFromItems } from '../utils.js';
import { autoDetectProject } from './projects.js';

interface GenerateResult {
  job_id: string;
}

interface GenerateStatus {
  status: string;
  changeset_id?: string;
  error?: string;
}

interface SourceSummary {
  id: string;
  filename: string;
  status: string;
}

export function registerWizard(program: Command): void {
  const wizard = program.command('wizard').description('Manage AI-driven map generation');

  wizard
    .command('generate')
    .description('Generate a story map')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--description <text>', 'Project description')
    .option('--audience <text>', 'Audience description')
    .option('--capabilities <text>', 'Capabilities description')
    .option('--constraints <text>', 'Constraints description')
    .option('--source <id>', 'Source ID or filename')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const sourceId = opts.source ? await resolveSourceId(opts.source, pid) : undefined;
      const body = {
        ...(opts.description && { description: opts.description }),
        ...(opts.audience && { audience: opts.audience }),
        ...(opts.capabilities && { capabilities: opts.capabilities }),
        ...(opts.constraints && { constraints: opts.constraints }),
        ...(sourceId && { source_id: sourceId }),
      };
      const data = await api<GenerateResult>('POST', `/projects/${pid}/generate-map`, body);
      if (opts.json) return json(data);
      console.log(`Started map generation job: ${data.job_id}`);
    });

  wizard
    .command('status')
    .description('Check story map generation status')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--job <id>', 'Job ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<GenerateStatus>('GET', `/projects/${pid}/generate-map/status?job_id=${opts.job}`);
      if (opts.json) return json(data);
      console.log(`Status: ${data.status}`);
      if (data.changeset_id) console.log(`Changeset: ${data.changeset_id}`);
      if (data.error) console.log(`Error: ${data.error}`);
    });
}

async function resolveSourceId(id: string, project: string): Promise<string> {
  const sources = await api<SourceSummary[]>('GET', `/projects/${project}/sources`);
  return resolveIdFromItems(id, sources, {
    label: 'Source',
    fields: ['id', 'filename'],
    formatter: (source) => `${source.filename}  ${source.id}  ${source.status}`,
  });
}
