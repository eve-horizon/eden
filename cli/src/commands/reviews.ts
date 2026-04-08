import { readFile } from 'fs/promises';
import { Command } from 'commander';
import { api } from '../client.js';
import { json, table } from '../output.js';
import { autoDetectProject } from './projects.js';

interface ExpertOpinion {
  expert_slug: string;
  summary: string;
}

interface Review {
  id: string;
  title: string;
  status: string;
  synthesis: string | null;
  expert_count: number;
  expert_opinions: ExpertOpinion[];
  eve_job_id: string | null;
  created_at: string;
}

export function registerReviews(program: Command): void {
  const reviews = program.command('review').alias('reviews').description('Manage expert panel reviews');

  reviews
    .command('list')
    .description('List reviews')
    .option('--project <id>', 'Project ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      const data = await api<Review[]>('GET', `/projects/${pid}/reviews`);
      if (opts.json) return json(data);
      table(data, ['id', 'title', 'status', 'expert_count', 'created_at']);
    });

  reviews
    .command('show')
    .alias('get')
    .description('Show review details')
    .argument('<id>', 'Review ID')
    .option('--json', 'JSON output')
    .action(async (id, opts) => {
      const data = await api<Review>('GET', `/reviews/${id}`);
      if (opts.json) return json(data);
      console.log(`Review: ${data.id}`);
      console.log(`Title: ${data.title}`);
      console.log(`Status: ${data.status}`);
      console.log(`Experts: ${data.expert_count}`);
      if (data.synthesis) console.log(`\nSynthesis:\n${data.synthesis}`);
      if (data.expert_opinions?.length) {
        console.log('\nExpert Opinions:');
        for (const op of data.expert_opinions) {
          console.log(`  [${op.expert_slug}] ${op.summary}`);
        }
      }
    });

  reviews
    .command('create')
    .description('Create a review (from JSON file or inline)')
    .requiredOption('--project <id>', 'Project ID')
    .option('--file <path>', 'JSON file with review data')
    .option('--title <title>', 'Review title')
    .option('--synthesis <text>', 'Synthesis text')
    .option('--status <status>', 'Status (pending/in_progress/complete)')
    .option('--eve-job-id <id>', 'Eve job ID')
    .option('--json', 'JSON output')
    .action(async (opts) => {
      const pid = await autoDetectProject(opts.project);
      let body: Record<string, unknown>;
      if (opts.file) {
        body = JSON.parse(await readFile(opts.file, 'utf8'));
      } else {
        body = {
          ...(opts.title && { title: opts.title }),
          ...(opts.synthesis && { synthesis: opts.synthesis }),
          ...(opts.status && { status: opts.status }),
          ...(opts.eveJobId && { eve_job_id: opts.eveJobId }),
        };
      }
      const result = await api<Review>('POST', `/projects/${pid}/reviews`, body);
      if (opts.json) return json(result);
      console.log(`Created review: ${result.id} (${result.status}, ${result.expert_count} experts)`);
    });
}
