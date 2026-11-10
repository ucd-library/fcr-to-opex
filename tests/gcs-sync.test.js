import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { syncBinariesFromGcs } from '../lib/gcs-sync.js';

/**
 * @description Build an injectable fake `listObjects` backed by a plain array,
 * so tests never touch the real GCS SDK.
 * @param {Array<{name: string, size?: number}>} objects - Objects to return.
 * @returns {Function}
 */
function fakeListObjects(objects) {
  return async () => objects;
}

describe('lib/gcs-sync.js', () => {
  let tmpDir;
  let metadataDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcr-to-opex-gcs-sync-test-'));
    metadataDir = path.join(tmpDir, 'dams-mini-metadata');
    await fs.mkdir(metadataDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('maps a listed object to <metadataDir>/<relative-path-after-the-slug-prefix> and downloads it', async () => {
    const downloadCalls = [];
    const downloadObjectFn = async ({ bucket, objectName, destPath }) => {
      downloadCalls.push({ bucket, objectName, destPath });
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, 'bytes');
    };

    const result = await syncBinariesFromGcs({
      metadataDir,
      slug: 'mini',
      bucket: 'test-bucket',
      listObjects: fakeListObjects([{ name: 'mini/items/x/x.tif', size: 5 }]),
      downloadObjectFn
    });

    assert.deepStrictEqual(result.downloaded, ['items/x/x.tif']);
    assert.strictEqual(downloadCalls.length, 1);
    assert.strictEqual(downloadCalls[0].bucket, 'test-bucket');
    assert.strictEqual(downloadCalls[0].objectName, 'mini/items/x/x.tif');
    assert.strictEqual(downloadCalls[0].destPath, path.join(metadataDir, 'items', 'x', 'x.tif'));
  });

  it('never downloads an object whose key ends in .jsonld.json, even if listed', async () => {
    const downloadObjectFn = async () => {
      throw new Error('should not be called');
    };

    const result = await syncBinariesFromGcs({
      metadataDir,
      slug: 'mini',
      bucket: 'test-bucket',
      listObjects: fakeListObjects([{ name: 'mini/items/x.jsonld.json', size: 1 }]),
      downloadObjectFn
    });

    assert.deepStrictEqual(result.downloaded, []);
    assert.deepStrictEqual(result.skippedExisting, []);
    assert.deepStrictEqual(result.failed, []);
  });

  it('skips a file that already exists locally unless force is set', async () => {
    const destPath = path.join(metadataDir, 'items', 'x', 'x.tif');
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, 'already-here');

    let downloadCallCount = 0;
    const downloadObjectFn = async ({ destPath: dp }) => {
      downloadCallCount++;
      await fs.writeFile(dp, 'overwritten');
    };

    const result = await syncBinariesFromGcs({
      metadataDir,
      slug: 'mini',
      bucket: 'test-bucket',
      listObjects: fakeListObjects([{ name: 'mini/items/x/x.tif', size: 5 }]),
      downloadObjectFn
    });

    assert.strictEqual(downloadCallCount, 0);
    assert.deepStrictEqual(result.skippedExisting, ['items/x/x.tif']);
    assert.strictEqual(await fs.readFile(destPath, 'utf-8'), 'already-here');
  });

  it('re-downloads an already-present file when force is true', async () => {
    const destPath = path.join(metadataDir, 'items', 'x', 'x.tif');
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, 'stale');

    const downloadObjectFn = async ({ destPath: dp }) => {
      await fs.writeFile(dp, 'fresh');
    };

    const result = await syncBinariesFromGcs({
      metadataDir,
      slug: 'mini',
      bucket: 'test-bucket',
      force: true,
      listObjects: fakeListObjects([{ name: 'mini/items/x/x.tif', size: 5 }]),
      downloadObjectFn
    });

    assert.deepStrictEqual(result.downloaded, ['items/x/x.tif']);
    assert.strictEqual(await fs.readFile(destPath, 'utf-8'), 'fresh');
  });

  it('catches a per-object download failure, records it, and continues with the rest', async () => {
    const downloadObjectFn = async ({ objectName, destPath }) => {
      if (objectName.endsWith('bad.tif')) throw new Error('network error');
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, 'bytes');
    };

    const result = await syncBinariesFromGcs({
      metadataDir,
      slug: 'mini',
      bucket: 'test-bucket',
      listObjects: fakeListObjects([
        { name: 'mini/items/bad.tif', size: 1 },
        { name: 'mini/items/good.tif', size: 1 }
      ]),
      downloadObjectFn
    });

    assert.deepStrictEqual(result.failed, ['items/bad.tif']);
    assert.deepStrictEqual(result.downloaded, ['items/good.tif']);
  });

  it('returns the bucket/prefix used, alongside the stats', async () => {
    const result = await syncBinariesFromGcs({
      metadataDir,
      slug: 'mini',
      bucket: 'test-bucket',
      listObjects: fakeListObjects([]),
      downloadObjectFn: async () => {}
    });

    assert.strictEqual(result.bucket, 'test-bucket');
    assert.strictEqual(result.prefix, 'mini/');
    assert.deepStrictEqual(result.downloaded, []);
    assert.deepStrictEqual(result.skippedExisting, []);
    assert.deepStrictEqual(result.failed, []);
  });
});
