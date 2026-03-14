import { Command } from 'commander';
import { registerProjects } from './commands/projects.js';
import { registerMap } from './commands/map.js';
import { registerChangesets } from './commands/changesets.js';
import { registerPersonas } from './commands/personas.js';
import { registerQuestions } from './commands/questions.js';
import { registerSearch } from './commands/search.js';
import { registerExport } from './commands/export.js';

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

program.parse();
