import { Command } from 'commander';
import { api } from '../client.js';
import { json } from '../output.js';
import { autoDetectProject } from './projects.js';

interface MapData {
  project: { id: string; name: string };
  personas: Array<{ id: string; code: string; name: string }>;
  activities: Array<{
    id: string;
    name: string;
    display_id: string;
    steps: Array<{
      id: string;
      name: string;
      display_id: string;
      tasks: Array<{
        id: string;
        title: string;
        display_id: string;
        persona_code?: string;
        status?: string;
      }>;
    }>;
  }>;
}

export function registerMap(program: Command): void {
  const map = program
    .command('map')
    .description('Show the project story map')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID (auto-detected if only one)')
    .option('--persona <code>', 'Filter by persona code')
    .option('--release <id>', 'Filter by release')
    .option('--json', 'JSON output')
    .action(async (projectArg, opts) => {
      await showMap(projectArg ?? opts.project, opts);
    });

  map
    .command('get')
    .alias('show')
    .description('Show the project story map')
    .argument('[project]', 'Project ID or slug')
    .option('--project <id>', 'Project ID (auto-detected if only one)')
    .option('--persona <code>', 'Filter by persona code')
    .option('--release <id>', 'Filter by release')
    .option('--json', 'JSON output')
    .action(async (projectArg, opts) => {
      const parentOpts = map.opts<{ json?: boolean; project?: string; persona?: string; release?: string }>();
      await showMap(projectArg ?? opts.project ?? parentOpts.project, {
        json: opts.json ?? parentOpts.json,
        persona: opts.persona ?? parentOpts.persona,
        release: opts.release ?? parentOpts.release,
      });
    });
}

async function showMap(project: string | undefined, opts: {
  json?: boolean;
  persona?: string;
  release?: string;
}): Promise<void> {
  const pid = await autoDetectProject(project);
  const params = new URLSearchParams();
  if (opts.persona) params.set('persona', opts.persona);
  if (opts.release) params.set('release', opts.release);
  const qs = params.toString() ? `?${params}` : '';
  const map = await api<MapData>('GET', `/projects/${pid}/map${qs}`);
  if (opts.json) return json(map);
  printMap(map);
}

function printMap(map: MapData): void {
  console.log(`Project: ${map.project.name} (${map.project.id})`);
  if (map.personas?.length) {
    console.log(`Personas: ${map.personas.map(p => `${p.code} (${p.name})`).join(', ')}`);
  }
  console.log('');
  for (const activity of map.activities ?? []) {
    console.log(`[${activity.display_id}] ${activity.name}`);
    for (const step of activity.steps ?? []) {
      console.log(`  [${step.display_id}] ${step.name}`);
      for (const task of step.tasks ?? []) {
        const persona = task.persona_code ? ` @${task.persona_code}` : '';
        const status = task.status ? ` (${task.status})` : '';
        console.log(`    [${task.display_id}] ${task.title}${persona}${status}`);
      }
    }
  }
}
