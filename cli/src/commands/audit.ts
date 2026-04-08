import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor: string | null;
  created_at: string;
}

export function registerAudit(program: Command): void {
  const audit = program.command('audit').description('Inspect audit log entries');

  audit
    .command('list')
    .description('List audit log entries')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--entity-type <type>', 'Filter by entity type')
    .option('--actor <actor>', 'Filter by actor')
    .option('--action <action>', 'Filter by action')
    .option('--limit <n>', 'Limit results', (value) => parseInt(value, 10))
    .option('--offset <n>', 'Offset results', (value) => parseInt(value, 10))
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const params = new URLSearchParams();
      if (opts.entityType) params.set('entity_type', opts.entityType);
      if (opts.actor) params.set('actor', opts.actor);
      if (opts.action) params.set('action', opts.action);
      if (opts.limit !== undefined) params.set('limit', String(opts.limit));
      if (opts.offset !== undefined) params.set('offset', String(opts.offset));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await api<{ entries: AuditEntry[] }>('GET', `/projects/${pid}/audit${query}`);
      if (opts.json) return json(data);
      table(data.entries, ['created_at', 'action', 'entity_type', 'entity_id', 'actor']);
    });
}
