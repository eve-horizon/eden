import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const API_ROOT = join(process.cwd(), '..', 'apps', 'api', 'src');
const CLI_ROOT = join(process.cwd(), 'src', 'commands');

const INTERNAL_ALLOWLIST = new Set([
  'POST /webhooks/ingest-complete',
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  }));
  return files.flat();
}

function normalizeRoute(route) {
  return route
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/:[A-Za-z0-9_]+/g, ':param')
    .replace(/\?.*$/, '')
    .replace(/(?<!\/):param$/g, '')
    .replace(/\/+/g, '/');
}

function collectApiRoutes(source, file) {
  const controllerMatch = source.match(/@Controller\((?:'([^']*)'|"([^"]*)")?\)/);
  const base = controllerMatch?.[1] ?? controllerMatch?.[2] ?? '';
  const routes = [];
  const routeRe = /@(Get|Post|Patch|Put|Delete)\((?:'([^']*)'|"([^"]*)")\)/g;
  let match;
  while ((match = routeRe.exec(source))) {
    const method = match[1].toUpperCase();
    const route = '/' + [base, match[2] ?? match[3] ?? ''].filter(Boolean).join('/');
    routes.push({
      key: `${method} ${normalizeRoute(route)}`,
      method,
      route,
      file,
    });
  }
  return routes;
}

function collectCliRoutes(source, file) {
  const routes = [];
  const routeRe = /api(?:<[^>]+>)?\(\s*'([A-Z]+)'\s*,\s*(?:`([^`]+)`|'([^']+)')/g;
  let match;
  while ((match = routeRe.exec(source))) {
    const method = match[1];
    const route = match[2] ?? match[3] ?? '';
    routes.push({
      key: `${method} ${normalizeRoute(route)}`,
      method,
      route,
      file,
    });
  }
  return routes;
}

const apiFiles = (await walk(API_ROOT)).filter((file) => file.endsWith('.controller.ts'));
const cliFiles = (await walk(CLI_ROOT)).filter((file) => file.endsWith('.ts'));

const apiRoutes = [];
for (const file of apiFiles) {
  apiRoutes.push(...collectApiRoutes(await readFile(file, 'utf8'), file));
}

const cliRoutes = [];
for (const file of cliFiles) {
  cliRoutes.push(...collectCliRoutes(await readFile(file, 'utf8'), file));
}

const cliCoverage = new Set(cliRoutes.map((route) => route.key));
const missing = apiRoutes
  .filter((route) => !INTERNAL_ALLOWLIST.has(route.key))
  .filter((route) => !cliCoverage.has(route.key));

if (missing.length === 0) {
  console.log(`CLI parity verified for ${apiRoutes.length - INTERNAL_ALLOWLIST.size} public REST routes.`);
  process.exit(0);
}

console.error('Missing CLI route coverage:');
for (const route of missing.sort((a, b) => a.key.localeCompare(b.key))) {
  console.error(`- ${route.key}  ${route.file}`);
}
process.exit(1);
