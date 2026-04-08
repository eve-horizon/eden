import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface ChatThread {
  id: string;
  key: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  actor_type: string;
  actor_id: string | null;
  body: string;
  job_id: string | null;
  created_at: string;
}

interface ChatDispatch {
  thread_id: string;
  route_id: string;
  target: string;
  job_ids: string[];
  event_id: string;
}

export function registerChat(program: Command): void {
  const chat = program.command('chat').description('Manage Eden chat threads');

  chat
    .command('list')
    .description('List chat threads for a project')
    .requiredOption('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<ChatThread[]>('GET', `/projects/${pid}/chat/threads`);
      if (opts.json) return json(data);
      table(data, ['id', 'summary', 'key', 'updated_at']);
    });

  chat
    .command('create')
    .description('Create a new chat thread by sending the first message')
    .requiredOption('--project <id>', 'Project ID or slug')
    .requiredOption('--message <text>', 'Initial message')
    .option('--new-thread', 'Force creation of a new thread')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<ChatDispatch>('POST', `/projects/${pid}/chat/threads`, {
        message: opts.message,
        ...(opts.newThread && { new_thread: true }),
      });
      if (opts.json) return json(data);
      console.log(`Created thread: ${data.thread_id}`);
      console.log(`Jobs: ${data.job_ids.join(', ')}`);
    });

  chat
    .command('messages')
    .description('List messages in a thread')
    .argument('<threadId>', 'Thread ID')
    .option('--json', 'JSON output')
    .action(async (threadId, opts) => {
      const data = await api<ChatMessage[]>('GET', `/chat/threads/${threadId}/messages`);
      if (opts.json) return json(data);
      table(
        data.map((message) => ({
          id: message.id,
          created_at: message.created_at,
          direction: message.direction,
          actor: message.actor_type,
          body: message.body,
        })),
        ['created_at', 'direction', 'actor', 'body'],
      );
    });

  chat
    .command('send')
    .description('Send a message to an existing thread')
    .argument('<threadId>', 'Thread ID')
    .requiredOption('--message <text>', 'Message text')
    .option('--project <id>', 'Project ID or slug')
    .option('--json', 'JSON output')
    .action(async (threadId, opts) => {
      const projectId = opts.project ? await autoDetectProject(opts.project) : undefined;
      const data = await api<ChatDispatch>('POST', `/chat/threads/${threadId}/messages`, {
        message: opts.message,
        ...(projectId && { projectId }),
      });
      if (opts.json) return json(data);
      console.log(`Queued message for thread: ${data.thread_id}`);
      console.log(`Jobs: ${data.job_ids.join(', ')}`);
    });

  chat
    .command('poll')
    .description('Poll messages for a thread')
    .argument('<threadId>', 'Thread ID')
    .option('--json', 'JSON output')
    .action(async (threadId, opts) => {
      const data = await api<ChatMessage[]>('GET', `/chat/threads/${threadId}/poll`);
      if (opts.json) return json(data);
      table(
        data.map((message) => ({
          created_at: message.created_at,
          direction: message.direction,
          actor: message.actor_type,
          body: message.body,
        })),
        ['created_at', 'direction', 'actor', 'body'],
      );
    });
}
