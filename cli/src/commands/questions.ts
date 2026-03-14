import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Question {
  id: string;
  text: string;
  status: string;
  category?: string;
  answer?: string;
  created_at: string;
}

export function registerQuestions(program: Command): void {
  const questions = program.command('question').description('Manage questions');

  questions
    .command('list')
    .description('List questions')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status (open/answered/dismissed)')
    .option('--category <cat>', 'Filter by category')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.category) params.set('category', opts.category);
      const qs = params.toString() ? `?${params}` : '';
      const data = await api<Question[]>('GET', `/projects/${pid}/questions${qs}`);
      if (opts.json) return json(data);
      table(data, ['id', 'text', 'status', 'category']);
    });

  questions
    .command('show')
    .description('Show question details')
    .argument('<id>', 'Question ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Question>('GET', `/questions/${id}`);
      if (opts.json) return json(data);
      console.log(`Question: ${data.id}`);
      console.log(`Status: ${data.status}`);
      console.log(`Category: ${data.category ?? '(none)'}`);
      console.log(`Text: ${data.text}`);
      if (data.answer) console.log(`Answer: ${data.answer}`);
    });

  questions
    .command('evolve')
    .description('Evolve a question with an answer')
    .argument('<id>', 'Question ID')
    .requiredOption('--answer <text>', 'Answer text')
    .action(async (id, opts) => {
      await api('POST', `/questions/${id}/evolve`, { answer: opts.answer });
      console.log(`Evolved: ${id}`);
    });
}
