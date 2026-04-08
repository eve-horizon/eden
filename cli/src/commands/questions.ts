import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface Question {
  id: string;
  text?: string;
  question?: string;
  status: string;
  category?: string;
  answer?: string;
  references?: { entity_type: string; entity_id: string }[];
  created_at: string;
}

export function registerQuestions(program: Command): void {
  const questions = program.command('question').alias('questions').description('Manage questions');

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
      table(
        data.map((question) => ({
          id: question.id,
          question: question.question ?? question.text ?? '',
          status: question.status,
          category: question.category ?? '',
        })),
        ['id', 'question', 'status', 'category'],
      );
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
      console.log(`Text: ${data.text ?? data.question ?? ''}`);
      if (data.answer) console.log(`Answer: ${data.answer}`);
      if (data.references?.length) {
        console.log('References:');
        for (const ref of data.references) {
          console.log(`  ${ref.entity_type}: ${ref.entity_id}`);
        }
      }
    });

  questions
    .command('create')
    .description('Create a question (inline or from JSON file)')
    .requiredOption('--project <id>', 'Project ID')
    .option('--file <path>', 'JSON file with question data')
    .option('--question <text>', 'Question text (inline)')
    .option('--priority <p>', 'Priority (high/medium/low)')
    .option('--category <cat>', 'Category (conflict/gap/duplicate/assumption)')
    .option('--cross-cutting', 'Mark as cross-cutting')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      let body: Record<string, unknown>;
      if (opts.file) {
        body = JSON.parse(await readFile(opts.file, 'utf8'));
      } else if (opts.question) {
        body = {
          question: opts.question,
          ...(opts.priority && { priority: opts.priority }),
          ...(opts.category && { category: opts.category }),
          ...(opts.crossCutting && { is_cross_cutting: true }),
        };
      } else {
        console.error('Provide --file <path> or --question <text>');
        process.exit(1);
      }
      const result = await api<Question>('POST', `/projects/${pid}/questions`, body);
      if (opts.json) return json(result);
      console.log(`Created question: ${result.id} (${result.status})`);
    });

  questions
    .command('update')
    .description('Update a question')
    .argument('<id>', 'Question ID')
    .option('--answer <text>', 'Answer text')
    .option('--status <status>', 'Status')
    .option('--priority <priority>', 'Priority')
    .option('--category <category>', 'Category')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const body = {
        ...(opts.answer && { answer: opts.answer }),
        ...(opts.status && { status: opts.status }),
        ...(opts.priority && { priority: opts.priority }),
        ...(opts.category && { category: opts.category }),
      };
      if (Object.keys(body).length === 0) {
        console.error('Provide at least one field to update');
        process.exit(1);
      }
      const result = await api<Question>('PATCH', `/questions/${id}`, body);
      if (opts.json) return json(result);
      console.log(`Updated question: ${result.id} (${result.status})`);
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
