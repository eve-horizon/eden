import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { readJsonInput } from './utils.js';

describe('readJsonInput', () => {
  it('reads JSON from a file path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eden-cli-utils-'));
    const file = join(dir, 'payload.json');

    try {
      await writeFile(file, '{"title":"From file","count":2}\n', 'utf8');
      const result = await readJsonInput<{ title: string; count: number }>(file);
      assert.deepEqual(result, { title: 'From file', count: 2 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reads JSON from stdin when path is dash', async () => {
    const stdin = Readable.from(['{"title":"From stdin","count":3}\n']);
    const result = await readJsonInput<{ title: string; count: number }>(
      '-',
      stdin,
    );
    assert.deepEqual(result, { title: 'From stdin', count: 3 });
  });
});
