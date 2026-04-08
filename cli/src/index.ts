import { Command } from 'commander';
import { registerProjects } from './commands/projects.js';
import { registerMap } from './commands/map.js';
import { registerChangesets } from './commands/changesets.js';
import { registerPersonas } from './commands/personas.js';
import { registerQuestions } from './commands/questions.js';
import { registerSearch } from './commands/search.js';
import { registerExport } from './commands/export.js';
import { registerReviews } from './commands/reviews.js';
import { registerSources } from './commands/sources.js';
import { registerTasks } from './commands/tasks.js';
import { registerActivities } from './commands/activities.js';
import { registerSteps } from './commands/steps.js';
import { registerReleases } from './commands/releases.js';
import { registerAudit } from './commands/audit.js';
import { registerChat } from './commands/chat.js';

const program = new Command();
program
  .name('eden')
  .description('Eden story map CLI — agent-friendly interface to the Eden API')
  .version('1.0.0');

registerProjects(program);
registerMap(program);
registerChangesets(program);
registerPersonas(program);
registerQuestions(program);
registerSearch(program);
registerExport(program);
registerReviews(program);
registerSources(program);
registerTasks(program);
registerActivities(program);
registerSteps(program);
registerReleases(program);
registerAudit(program);
registerChat(program);

program.parse();
