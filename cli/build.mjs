import { build } from 'esbuild';
import { chmod, readFile, writeFile } from 'fs/promises';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'bin/eden',
  external: [],
});

// Prepend shebang (esbuild banner escapes ! in some shells)
const content = await readFile('bin/eden', 'utf8');
await writeFile('bin/eden', '#!/usr/bin/env node\n' + content);
await chmod('bin/eden', 0o755);
console.log('Built: cli/bin/eden');
