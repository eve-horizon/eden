import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Task {
  id: string;
  display_id: string;
  title: string;
  status: string;
  priority: string;
  release_id: string | null;
  created_at: string;
}

export function registerTasks(program: Command): void {
  const tasks = program.command('task').description('Manage tasks');

  tasks
    .command('list')
    .description('List tasks')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status')
    .option('--priority <priority>', 'Filter by priority')
    .option('--release-id <id>', 'Filter by release ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.priority) params.set('priority', opts.priority);
      if (opts.releaseId) params.set('release_id', opts.releaseId);
      const qs = params.toString() ? `?${params}` : '';
      const data = await api<Task[]>('GET', `/projects/${pid}/tasks${qs}`);
      if (opts.json) return json(data);
      table(data, ['id', 'display_id', 'title', 'status', 'priority']);
    });

  tasks
    .command('show')
    .description('Show task details')
    .argument('<id>', 'Task ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Task>('GET', `/tasks/${id}`);
      if (opts.json) return json(data);
      console.log(`Task: ${data.display_id} (${data.id})`);
      console.log(`Title: ${data.title}`);
      console.log(`Status: ${data.status}`);
      console.log(`Priority: ${data.priority}`);
      if (data.release_id) console.log(`Release: ${data.release_id}`);
    });
}
