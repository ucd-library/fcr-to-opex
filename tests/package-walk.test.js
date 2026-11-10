import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { packageMetadataDir } from '../lib/package/walk.js';

/**
 * @description Write a small synthetic dams-*-metadata repo to a temp directory:
 * one collection, one simple single-file item (no `media/` wrapper, to exercise
 * that path too), one compound item (a `media/` wrapper with a direct pdf plus an
 * `images/` page sequence, like dams-haeger-metadata), and an orphan
 * metadata-only file (like labels.jsonld.json) that should be skipped.
 * @param {string} root - Directory to write the fixture repo into.
 * @returns {Promise<void>}
 */
async function writeFixtureRepo(root) {
  await fs.mkdir(path.join(root, 'collection', 'mini'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'collection', 'mini.jsonld.json'),
    JSON.stringify({ '@id': '', 'schema:name': 'Mini Collection', 'schema:identifier': ['ark:/1/abc123'] })
  );
  await fs.writeFile(
    path.join(root, 'collection', 'mini', 'labels.jsonld.json'),
    JSON.stringify([{ '@id': 'http://id.worldcat.org/fast/1', 'http://schema.org/name': 'Test Subject' }])
  );

  // item1: simple, single file, no media/ wrapper
  await fs.mkdir(path.join(root, 'items', 'item1'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'items', 'item1.jsonld.json'),
    JSON.stringify({ '@id': '', 'schema:name': 'Item One', 'schema:identifier': ['ark:/1/def456'] })
  );
  await fs.writeFile(path.join(root, 'items', 'item1', 'item1.txt'), 'hello world');
  await fs.writeFile(
    path.join(root, 'items', 'item1', 'item1.txt.jsonld.json'),
    JSON.stringify({ '@id': '', '@type': ['schema:CreativeWork'], 'ebucore:filename': 'item1.txt', 'ebucore:hasMimeType': 'text/plain' })
  );

  // item2: compound - media/ wrapper with a direct pdf + an images/ page sequence
  await fs.mkdir(path.join(root, 'items', 'item2', 'media', 'images'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'items', 'item2.jsonld.json'),
    JSON.stringify({ '@id': '', 'schema:name': 'Item Two', 'schema:identifier': ['ark:/1/ghi789'] })
  );
  await fs.writeFile(
    path.join(root, 'items', 'item2', 'media.jsonld.json'),
    JSON.stringify({ '@id': '', '@type': ['ldp:DirectContainer'] })
  );
  await fs.writeFile(path.join(root, 'items', 'item2', 'media', 'item2.pdf'), 'pdf-bytes');
  await fs.writeFile(
    path.join(root, 'items', 'item2', 'media', 'item2.pdf.jsonld.json'),
    JSON.stringify({ '@id': '', 'ebucore:filename': 'item2.pdf', 'ebucore:hasMimeType': 'application/pdf' })
  );
  await fs.writeFile(
    path.join(root, 'items', 'item2', 'media', 'images.jsonld.json'),
    JSON.stringify({ '@id': '', 'schema:name': 'Image List' })
  );
  await fs.writeFile(path.join(root, 'items', 'item2', 'media', 'images', 'page_001.tif'), 'tif-1');
  await fs.writeFile(
    path.join(root, 'items', 'item2', 'media', 'images', 'page_001.tif.jsonld.json'),
    JSON.stringify({ '@id': '', 'schema:position': '001', 'ebucore:filename': 'page_001.tif', 'ebucore:hasMimeType': 'image/tiff' })
  );
  await fs.writeFile(path.join(root, 'items', 'item2', 'media', 'images', 'page_002.tif'), 'tif-2');
  await fs.writeFile(
    path.join(root, 'items', 'item2', 'media', 'images', 'page_002.tif.jsonld.json'),
    JSON.stringify({ '@id': '', 'schema:position': '002', 'ebucore:filename': 'page_002.tif', 'ebucore:hasMimeType': 'image/tiff' })
  );
  await fs.mkdir(path.join(root, 'items', 'item2', 'media', 'text'), { recursive: true });
  await fs.writeFile(
    path.join(root, 'items', 'item2', 'media', 'text.jsonld.json'),
    JSON.stringify({ '@id': '', '@type': ['ldp:DirectContainer'] })
  );
  await fs.writeFile(path.join(root, 'items', 'item2', 'media', 'text', 'item2.txt'), 'transcript');
  await fs.writeFile(
    path.join(root, 'items', 'item2', 'media', 'text', 'item2.txt.jsonld.json'),
    JSON.stringify({ '@id': '', 'ucdlib:textIndexable': true, 'ebucore:filename': 'item2.txt', 'ebucore:hasMimeType': 'text/plain' })
  );
}

describe('lib/package/walk.js', () => {
  let tmpDir;
  let metadataDir;
  let outputDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcr-to-opex-package-test-'));
    metadataDir = path.join(tmpDir, 'dams-mini-metadata');
    outputDir = path.join(tmpDir, 'output');
    await writeFixtureRepo(metadataDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('builds the root folder from collection/<slug>.jsonld.json, with descriptive metadata', async () => {
    const { rootDir, slug } = await packageMetadataDir({ metadataDir, outputDir });
    assert.strictEqual(slug, 'mini');

    const opex = await fs.readFile(path.join(rootDir, 'mini.opex'), 'utf-8');
    assert.ok(opex.includes('<Title>mini</Title>'));
    assert.ok(opex.includes('<Identifier type="ARK">ark:/1/abc123</Identifier>'));
    assert.ok(opex.includes('<dc:title>Mini Collection</dc:title>'));
  });

  it('skips an orphan metadata-only file (no sibling dir/binary) and reports it', async () => {
    const { stats } = await packageMetadataDir({ metadataDir, outputDir });
    assert.strictEqual(stats.skipped.length, 1);
    assert.ok(stats.skipped[0].endsWith('labels.jsonld.json'));

    const rootEntries = await fs.readdir(path.join(outputDir, 'mini'));
    assert.ok(!rootEntries.includes('labels.jsonld.json'));
  });

  it('packages a single-file item as a plain leaf asset directly under the root - no wrapping item folder', async () => {
    const { rootDir } = await packageMetadataDir({ metadataDir, outputDir });

    const rootEntries = await fs.readdir(rootDir);
    assert.ok(!rootEntries.includes('item1'), 'should not create an item1/ wrapper folder');
    assert.ok(rootEntries.includes('item1.txt'));
    assert.ok(rootEntries.includes('item1.txt.opex'));

    const contents = await fs.readFile(path.join(rootDir, 'item1.txt'), 'utf-8');
    assert.strictEqual(contents, 'hello world');

    const opex = await fs.readFile(path.join(rootDir, 'item1.txt.opex'), 'utf-8');
    assert.ok(opex.includes('<Identifier type="ARK">ark:/1/def456</Identifier>'), 'identifiers should come from item1.jsonld.json');
    assert.ok(opex.includes('<dc:title>Item One</dc:title>'), 'Dublin Core should come from item1.jsonld.json, not the file sidecar');
  });

  it('packages a compound item as one PAX asset, bucketed into representations, with no wrapping folder', async () => {
    const { rootDir, stats } = await packageMetadataDir({ metadataDir, outputDir });

    assert.strictEqual(stats.paxAssets, 1);
    const rootEntries = await fs.readdir(rootDir);
    assert.ok(!rootEntries.includes('item2'), 'should not create an item2/ wrapper folder');
    assert.ok(rootEntries.includes('item2.pax'));
    assert.ok(rootEntries.includes('item2.pax.opex'));

    const paxDir = path.join(rootDir, 'item2.pax');
    const pdfBytes = await fs.readFile(path.join(paxDir, 'Representation_Access', 'item2.pdf', 'item2.pdf'), 'utf-8');
    assert.strictEqual(pdfBytes, 'pdf-bytes');
    const page1 = await fs.readFile(path.join(paxDir, 'Representation_Preservation', 'page_001.tif', 'page_001.tif'), 'utf-8');
    assert.strictEqual(page1, 'tif-1');
    const page2 = await fs.readFile(path.join(paxDir, 'Representation_Preservation', 'page_002.tif', 'page_002.tif'), 'utf-8');
    assert.strictEqual(page2, 'tif-2');
    const textBytes = await fs.readFile(path.join(paxDir, 'Representation_Access', 'item2.txt', 'item2.txt'), 'utf-8');
    assert.strictEqual(textBytes, 'transcript');

    const opex = await fs.readFile(path.join(rootDir, 'item2.pax.opex'), 'utf-8');
    assert.ok(opex.includes('<dc:title>Item Two</dc:title>'), 'Dublin Core should come from item2.jsonld.json, not media.jsonld.json/images.jsonld.json');
    assert.ok(opex.includes('<Identifier type="ARK">ark:/1/ghi789</Identifier>'));
    assert.ok(opex.includes('path="Representation_Preservation/page_001.tif/page_001.tif"'));
    assert.ok(opex.includes('path="Representation_Preservation/page_002.tif/page_002.tif"'));
    assert.ok(opex.includes('path="Representation_Access/item2.pdf/item2.pdf"'));
    assert.ok(opex.includes('path="Representation_Access/item2.txt/item2.txt"'));
    assert.ok(opex.includes('<Folder>Representation_Preservation</Folder>'));
    assert.ok(opex.includes('<File type="content">Representation_Access/item2.pdf/item2.pdf</File>'));
    // The bug this guards against: two files sharing a basename ("item2.pdf"/"item2.txt"
    // both folding into Access) must not collide into the same content-object folder.
    const accessFolderCount = (opex.match(/<Folder>Representation_Access\/item2\.(pdf|txt)<\/Folder>/g) || []).length;
    assert.strictEqual(accessFolderCount, 2);
    assert.ok(!opex.includes('Representation_Text'), 'text should fold into Access, not an invented Text representation type');
  });

  it('respects an explicit slug override for the output root folder name', async () => {
    const { rootDir, slug } = await packageMetadataDir({ metadataDir, outputDir, slug: 'custom-slug' });
    assert.strictEqual(slug, 'custom-slug');
    assert.ok(rootDir.endsWith('custom-slug'));
  });
});
