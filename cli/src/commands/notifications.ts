import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { parseInteger } from '../utils.js';

interface Notification {
  id: string;
  project_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
}

export function registerNotifications(program: Command): void {
  const notifications = program
    .command('notification')
    .alias('notifications')
    .description('Manage user notifications');

  notifications
    .command('list')
    .description('List notifications')
    .option('--limit <n>', 'Limit results', (value) => parseInteger(value, 'limit'))
    .option('--offset <n>', 'Offset results', (value) => parseInteger(value, 'offset'))
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const params = new URLSearchParams();
      if (opts.limit !== undefined) params.set('limit', String(opts.limit));
      if (opts.offset !== undefined) params.set('offset', String(opts.offset));
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await api<Notification[]>('GET', `/notifications${query}`);
      if (opts.json) return json(data);
      table(data, ['id', 'title', 'type', 'read', 'created_at']);
    });

  notifications
    .command('read')
    .description('Mark a notification as read')
    .argument('<id>', 'Notification ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Notification>('PATCH', `/notifications/${id}/read`);
      if (opts.json) return json(data);
      console.log(`Marked notification as read: ${data.id}`);
    });

  notifications
    .command('read-all')
    .description('Mark all notifications as read')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const data = await api<{ updated: number }>('POST', '/notifications/read-all');
      if (opts.json) return json(data);
      console.log(`Marked ${data.updated} notification(s) as read`);
    });
}
