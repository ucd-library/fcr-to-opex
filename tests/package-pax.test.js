import assert from 'assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { writePaxContents } from '../lib/package/pax.js';
import { buildPaxOpex } from '../lib/package/opex.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

describe('lib/package/pax.js', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fcr-to-opex-pax-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes Representation_<Type>/<name>/<file> for each content object and returns relative paths + fixities', async () => {
    const src1 = path.join(tmpDir, 'page_001.tif');
    const src2 = path.join(tmpDir, 'doc.pdf');
    await fs.writeFile(src1, 'tif-bytes');
    await fs.writeFile(src2, 'pdf-bytes');

    const paxDir = path.join(tmpDir, 'item.pax');
    const result = await writePaxContents(paxDir, [
      { type: 'Preservation', contentObjects: [{ name: 'page_001', sourcePath: src1, filename: 'page_001.tif' }] },
      { type: 'Access', contentObjects: [{ name: 'doc', sourcePath: src2, filename: 'doc.pdf' }] }
    ]);

    const tifCopy = await fs.readFile(path.join(paxDir, 'Representation_Preservation', 'page_001', 'page_001.tif'), 'utf-8');
    assert.strictEqual(tifCopy, 'tif-bytes');
    const pdfCopy = await fs.readFile(path.join(paxDir, 'Representation_Access', 'doc', 'doc.pdf'), 'utf-8');
    assert.strictEqual(pdfCopy, 'pdf-bytes');

    assert.deepStrictEqual(result.folders, ['Representation_Preservation', 'Representation_Preservation/page_001', 'Representation_Access', 'Representation_Access/doc']);
    assert.deepStrictEqual(result.files, ['Representation_Preservation/page_001/page_001.tif', 'Representation_Access/doc/doc.pdf']);
    assert.strictEqual(result.fixities.length, 2);
    assert.strictEqual(result.fixities[0].path, 'Representation_Preservation/page_001/page_001.tif');
    assert.strictEqual(result.fixities[0].sha1.length, 40);
  });
});

describe('lib/package/opex.js#buildPaxOpex', () => {
  it('renders path-qualified fixities and a manifest, re-parseable as valid XML', () => {
    const xml = buildPaxOpex({
      title: 'my-item',
      identifiers: [{ type: 'ARK', value: 'ark:/1/abc' }],
      dcXml: '<oai_dc:dc><dc:title>My Item</dc:title></oai_dc:dc>',
      fixities: [{ path: 'Representation_Preservation/page_001/page_001.tif', sha1: 'deadbeef' }],
      folders: ['Representation_Preservation', 'Representation_Preservation/page_001'],
      files: ['Representation_Preservation/page_001/page_001.tif']
    });

    const parsed = parser.parse(xml);
    const opex = parsed.OPEXMetadata;
    assert.strictEqual(opex.Properties.Title, 'my-item');
    assert.strictEqual(opex.Properties.Identifiers.Identifier['@_type'], 'ARK');

    const fixity = opex.Transfer.Fixities.Fixity;
    assert.strictEqual(fixity['@_type'], 'SHA-1');
    assert.strictEqual(fixity['@_value'], 'deadbeef');
    assert.strictEqual(fixity['@_path'], 'Representation_Preservation/page_001/page_001.tif');

    assert.strictEqual(opex.Transfer.Manifest.Folders.Folder[0], 'Representation_Preservation');
    assert.strictEqual(opex.Transfer.Manifest.Files.File['#text'], 'Representation_Preservation/page_001/page_001.tif');
    assert.strictEqual(opex.Transfer.Manifest.Files.File['@_type'], 'content');

    assert.ok(xml.includes('<dc:title>My Item</dc:title>'));
  });
});
