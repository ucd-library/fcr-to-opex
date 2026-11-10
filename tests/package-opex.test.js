import assert from 'assert';
import { XMLParser } from 'fast-xml-parser';
import { buildFolderOpex, buildFileOpex } from '../lib/package/opex.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

describe('lib/package/opex.js', () => {
  describe('buildFolderOpex', () => {
    it('renders Title and Identifiers, omitting DescriptiveMetadata when dcXml is null', () => {
      const xml = buildFolderOpex({
        title: 'calera-formatted',
        identifiers: [{ type: 'ARK', value: 'ark:/87293/d37m04681' }, { type: 'LocalID', value: 'D-641' }],
        dcXml: null
      });

      const parsed = parser.parse(xml);
      const props = parsed.OPEXMetadata.Properties;
      assert.strictEqual(props.Title, 'calera-formatted');
      assert.strictEqual(props.Identifiers.Identifier[0]['@_type'], 'ARK');
      assert.strictEqual(props.Identifiers.Identifier[0]['#text'], 'ark:/87293/d37m04681');
      assert.strictEqual(props.Identifiers.Identifier[1]['@_type'], 'LocalID');
      assert.strictEqual(parsed.OPEXMetadata.DescriptiveMetadata, undefined);
    });

    it('omits Identifiers entirely when there are none', () => {
      const xml = buildFolderOpex({ title: 'media', identifiers: [], dcXml: null });
      const parsed = parser.parse(xml);
      assert.strictEqual(parsed.OPEXMetadata.Properties.Identifiers, undefined);
    });

    it('embeds a provided dcXml fragment inside DescriptiveMetadata', () => {
      const xml = buildFolderOpex({ title: 'haeger', identifiers: [], dcXml: '<oai_dc:dc><dc:title>Haeger</dc:title></oai_dc:dc>' });
      assert.ok(xml.includes('<DescriptiveMetadata>'));
      assert.ok(xml.includes('<dc:title>Haeger</dc:title>'));
    });

    it('escapes special characters in the title', () => {
      const xml = buildFolderOpex({ title: 'A & B <Test>', identifiers: [], dcXml: null });
      const parsed = parser.parse(xml);
      assert.strictEqual(parsed.OPEXMetadata.Properties.Title, 'A & B <Test>');
    });
  });

  describe('buildFileOpex', () => {
    it('renders Title, Fixities and OriginalFilename', () => {
      const xml = buildFileOpex({
        title: 'page_001.tif',
        identifiers: [],
        originalFilename: 'page_001.tif',
        sha1: '8438a9895adf6a1d02dc5ebbed7c46b5db93e96c',
        dcXml: null
      });

      const parsed = parser.parse(xml);
      const opex = parsed.OPEXMetadata;
      assert.strictEqual(opex.Properties.Title, 'page_001.tif');
      assert.strictEqual(opex.Transfer.OriginalFilename, 'page_001.tif');
      assert.strictEqual(opex.Transfer.Fixities.Fixity['@_type'], 'SHA-1');
      assert.strictEqual(opex.Transfer.Fixities.Fixity['@_value'], '8438a9895adf6a1d02dc5ebbed7c46b5db93e96c');
      assert.strictEqual(opex.DescriptiveMetadata, undefined);
    });
  });
});
