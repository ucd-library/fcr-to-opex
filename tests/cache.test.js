import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import * as cache from '../lib/cache.js';

describe('lib/cache.js', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcr-to-opex-cache-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('exists() returns false for a missing file', async () => {
    assert.strictEqual(await cache.exists(path.join(tmpDir, 'nope.json')), false);
  });

  it('writeJson() then readJson() round-trips a value, creating parent dirs', async () => {
    const filePath = path.join(tmpDir, 'nested', 'dir', 'value.json');
    await cache.writeJson(filePath, { a: 1, b: ['x', 'y'] });
    assert.strictEqual(await cache.exists(filePath), true);
    const read = await cache.readJson(filePath);
    assert.deepStrictEqual(read, { a: 1, b: ['x', 'y'] });
  });

  it('writeFile() writes raw bytes, creating parent dirs', async () => {
    const filePath = path.join(tmpDir, 'nested', 'file.bin');
    await cache.writeFile(filePath, Buffer.from('hello'));
    const contents = await fs.readFile(filePath, 'utf-8');
    assert.strictEqual(contents, 'hello');
  });
});
