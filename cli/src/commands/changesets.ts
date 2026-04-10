import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { readJsonFile, readJsonInput } from '../utils.js';
import { autoDetectProject } from './projects.js';
import { expandInitialMapDraft } from './initial-map-draft.js';

interface Changeset {
  id: string;
  title?: string;
  status: string;
  source?: string;
  created_at: string;
  items?: unknown[];
  warnings?: Array<{ path: string; message: string }>;
}

interface ReviewDecision {
  id: string;
  status: 'accepted' | 'rejected';
}

interface PendingApprovalItem {
  id: string;
  changeset_id: string;
  entity_type: string;
  operation: string;
  description: string | null;
  display_reference: string | null;
  approval_status: string;
  created_at: string;
}

export function registerChangesets(program: Command): void {
  const cs = program.command('changeset').alias('changesets').description('Manage changesets');

  cs.command('list')
    .description('List changesets')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status (pending/accepted/rejected)')
    .option('--json', 'JSON output')
    .action(async (project, opts) => {
      const pid = await autoDetectProject(opts.project ?? project);
      const params = opts.status ? `?status=${opts.status}` : '';
      const data = await api<Changeset[]>('GET', `/projects/${pid}/changesets${params}`);
      if (opts.json) return json(data);
      table(data, ['id', 'title', 'status', 'source', 'created_at']);
    });

  cs.command('create')
    .description('Create a changeset from canonical JSON or a compact initial-map draft')
    .option('--project <id>', 'Project ID or slug')
    .option('--file <path>', 'Canonical changeset JSON file (or "-" for stdin)')
    .option(
      '--initial-map-file <path>',
      'Compact initial story map draft JSON file (or "-" for stdin)',
    )
    .option('--json', 'JSON output')
    .action(async (opts) => {
      if ((opts.file && opts.initialMapFile) || (!opts.file && !opts.initialMapFile)) {
        console.error('Provide exactly one of --file or --initial-map-file');
        process.exit(1);
      }

      const pid = await autoDetectProject(opts.project);
      let body: unknown;
      let localWarnings: Array<{ path: string; message: string }> = [];

      if (opts.initialMapFile) {
        const draft = await readJsonInput<unknown>(opts.initialMapFile);
        const expanded = expandInitialMapDraft(draft);
        body = expanded.payload;
        localWarnings = expanded.warnings;
      } else {
        body = await readJsonInput<unknown>(opts.file);
      }

      const result = await api<Changeset>('POST', `/projects/${pid}/changesets`, body);
      if (localWarnings.length > 0) {
        result.warnings = [...localWarnings, ...(result.warnings ?? [])];
      }
      if (opts.json) return json(result);
      console.log(`Created changeset: ${result.id} (${result.status})`);
      for (const warning of result.warnings ?? []) {
        const prefix = warning.path ? `${warning.path} - ` : '';
        console.error(`  warning: ${prefix}${warning.message}`);
      }
    });

  cs.command('show')
    .alias('get')
    .description('Show changeset details')
    .argument('[id]', 'Changeset ID')
    .option('--id <id>', 'Changeset ID')
    .option('--project <id>', 'Project ID (ignored for changeset lookups)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const changesetId = id ?? opts.id;
      if (!changesetId) {
        console.error('Provide a changeset ID as an argument or via --id <id>');
        process.exit(1);
      }
      const data = await api<Changeset>('GET', `/changesets/${changesetId}`);
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

  cs.command('review')
    .description('Review a changeset with per-item decisions')
    .argument('<id>', 'Changeset ID')
    .requiredOption('--file <path>', 'JSON file with review decisions')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const payload = await readJsonFile<{ decisions?: ReviewDecision[] } | ReviewDecision[]>(opts.file);
      const decisions = Array.isArray(payload) ? payload : payload.decisions ?? [];
      const data = await api<Changeset>('POST', `/changesets/${id}/review`, { decisions });
      if (opts.json) return json(data);
      console.log(`Reviewed changeset: ${data.id} (${data.status})`);
    });

  cs.command('pending-approvals')
    .description('List changeset items awaiting owner approval')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<PendingApprovalItem[]>('GET', `/projects/${pid}/pending-approvals`);
      if (opts.json) return json(data);
      table(data, ['id', 'changeset_id', 'entity_type', 'operation', 'display_reference', 'created_at']);
    });

  cs.command('approve-items')
    .description('Approve pending changeset items')
    .requiredOption('--project <id>', 'Project ID or slug')
    .argument('<itemIds...>', 'Changeset item IDs')
    .option('--json', 'JSON output')
    .action(async (itemIds: string[], opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<{ approved: number }>('POST', `/projects/${pid}/approve-items`, {
        item_ids: itemIds,
      });
      if (opts.json) return json(data);
      console.log(`Approved ${data.approved} item(s)`);
    });

  cs.command('reject-items')
    .description('Reject pending changeset items')
    .requiredOption('--project <id>', 'Project ID or slug')
    .argument('<itemIds...>', 'Changeset item IDs')
    .option('--json', 'JSON output')
    .action(async (itemIds: string[], opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<{ rejected: number }>('POST', `/projects/${pid}/reject-items`, {
        item_ids: itemIds,
      });
      if (opts.json) return json(data);
      console.log(`Rejected ${data.rejected} item(s)`);
    });

  cs.command('schema')
    .description('Show the changeset creation JSON Schema or markdown contract')
    .option('--json', 'Output raw JSON Schema (default)')
    .option('--format <format>', 'Output format: json or markdown', 'json')
    .action(async (opts) => {
      const __filename = fileURLToPath(import.meta.url);
      const repoRoot = resolve(dirname(__filename), '..', '..', '..');

      if (opts.format === 'markdown') {
        const mdPath = resolve(repoRoot, 'skills', '_references', 'create-changeset.md');
        const content = await readFile(mdPath, 'utf8');
        console.log(content);
      } else {
        const schemaPath = resolve(repoRoot, 'contracts', 'create-changeset.schema.json');
        const content = await readFile(schemaPath, 'utf8');
        if (opts.json || opts.format === 'json') {
          console.log(content);
        }
      }
    });
}
