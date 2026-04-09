import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { resolveIdFromItems } from '../utils.js';
import { autoDetectProject } from './projects.js';

interface Question {
  id: string;
  display_id?: string;
  text?: string;
  question?: string;
  status: string;
  category?: string;
  answer?: string;
  references?: { entity_type: string; entity_id: string }[];
  created_at: string;
}

export function registerQuestions(program: Command): void {
  const questions = program
    .command('question')
    .alias('questions')
    .description('Manage questions')
    .argument('[id]', 'Question ID')
    .option('--project <id>', 'Project ID (ignored for question lookups)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      if (!id) {
        console.log(questions.helpInformation());
        return;
      }
      await showQuestion(id, opts);
    });

  questions
    .command('list')
    .description('List questions')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID')
    .option('--status <status>', 'Filter by status (open/answered/dismissed)')
    .option('--category <cat>', 'Filter by category')
    .option('--json', 'JSON output')
    .action(async (project, _opts, command: Command) => {
      const mergedOpts = command.optsWithGlobals() as {
        category?: string;
        json?: boolean;
        project?: string;
        status?: string;
      };
      const pid = await autoDetectProject(mergedOpts.project ?? project);
      const params = new URLSearchParams();
      if (mergedOpts.status) params.set('status', mergedOpts.status);
      if (mergedOpts.category) params.set('category', mergedOpts.category);
      const qs = params.toString() ? `?${params}` : '';
      const data = await api<Question[]>('GET', `/projects/${pid}/questions${qs}`);
      if (mergedOpts.json) return json(data);
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
    .alias('get')
    .description('Show question details')
    .argument('<id>', 'Question ID')
    .option('--project <id>', 'Project ID (ignored for question lookups)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const parentOpts = questions.opts<{ json?: boolean }>();
      await showQuestion(id, {
        json: opts.json ?? parentOpts.json,
      });
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
    .option('--project <id>', 'Project ID (ignored for question updates)')
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
    .option('--project <id>', 'Project ID (ignored for question evolution)')
    .requiredOption('--answer <text>', 'Answer text')
    .action(async (id, opts) => {
      await api('POST', `/questions/${id}/evolve`, { answer: opts.answer });
      console.log(`Evolved: ${id}`);
    });

  questions
    .command('delete')
    .description('Delete a question')
    .argument('<id>', 'Question ID or display ID')
    .option('--project <id>', 'Project ID or slug (used to resolve display IDs)')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const questionId = await resolveQuestionId(id, opts.project);
      await api('DELETE', `/questions/${questionId}`);
      const result = { id: questionId, deleted: true };
      if (opts.json) return json(result);
      console.log(`Deleted question: ${questionId}`);
    });
}

async function showQuestion(
  id: string,
  opts: { json?: boolean },
): Promise<void> {
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
}

async function resolveQuestionId(id: string, project?: string): Promise<string> {
  if (!project) {
    return id;
  }

  const pid = await autoDetectProject(project);
  const questions = await api<Question[]>('GET', `/projects/${pid}/questions`);
  return resolveIdFromItems(id, questions, {
    label: 'Question',
    fields: ['id', 'display_id', 'question', 'text'],
    formatter: (question) =>
      `${question.display_id ?? '(no display id)'}  ${question.id}  ${question.question ?? question.text ?? ''}`,
  });
}
