import assert from 'assert';
import { XMLParser } from 'fast-xml-parser';
import { extractDublinCoreFields, buildOaiDcXml, OAI_DC_SCHEMA_URI } from '../lib/package/dublin-core.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });

describe('lib/package/dublin-core.js', () => {
  describe('extractDublinCoreFields', () => {
    it('extracts fields from an item-shaped schema.org document', () => {
      const fields = extractDublinCoreFields({
        'schema:name': "Jensen Vineyard at Calera Wine Company's Mt. Harlan Estate",
        'schema:creator': 'Haeger, John Winthrop',
        'schema:datePublished': { '@type': 'http://www.w3.org/2001/XMLSchema#gYearMonth', '@value': '2024-09' },
        'schema:license': { '@id': 'http://rightsstatements.org/vocab/InC-NC/1.0/' },
        'schema:about': [{ '@id': 'http://id.worldcat.org/fast/2019959' }, { '@id': 'http://id.worldcat.org/fast/1175907' }],
        'schema:publisher': 'UC Davis Library, Archives and Special Collections'
      });

      assert.strictEqual(fields.title, "Jensen Vineyard at Calera Wine Company's Mt. Harlan Estate");
      assert.strictEqual(fields.creator, 'Haeger, John Winthrop');
      assert.strictEqual(fields.date, '2024-09');
      assert.strictEqual(fields.rights, 'http://rightsstatements.org/vocab/InC-NC/1.0/');
      assert.deepStrictEqual(fields.subjects, ['http://id.worldcat.org/fast/2019959', 'http://id.worldcat.org/fast/1175907']);
      assert.strictEqual(fields.publisher, 'UC Davis Library, Archives and Special Collections');
    });

    it('takes the first plain-string publisher entry, skipping an {"@id"} entry', () => {
      const fields = extractDublinCoreFields({
        'schema:name': 'x',
        'schema:publisher': [{ '@id': 'http://id.loc.gov/authorities/names/no2008108707' }, 'UC Davis Library']
      });
      assert.strictEqual(fields.publisher, 'UC Davis Library');
    });

    it('returns null when nothing maps (e.g. a purely-structural LDP container)', () => {
      const fields = extractDublinCoreFields({
        '@type': ['ldp:DirectContainer'],
        'ldp:hasMemberRelation': { '@id': 'schema:associatedMedia' }
      });
      assert.strictEqual(fields, null);
    });
  });

  describe('buildOaiDcXml', () => {
    it('returns null when fields is null', () => {
      assert.strictEqual(buildOaiDcXml(null), null);
    });

    it('renders a valid oai_dc:dc fragment with repeated dc:subject elements', () => {
      const xml = buildOaiDcXml({
        title: 'Title & <Test>',
        description: null,
        creator: 'Someone',
        date: '2025',
        rights: null,
        subjects: ['http://id.worldcat.org/fast/1', 'http://id.worldcat.org/fast/2'],
        publisher: null
      });

      assert.ok(xml.includes(`xmlns:oai_dc="${OAI_DC_SCHEMA_URI}"`));
      assert.ok(xml.includes('xmlns:dc="http://purl.org/dc/elements/1.1/"'));

      const parsed = parser.parse(xml);
      assert.strictEqual(parsed.dc.title, 'Title & <Test>');
      assert.strictEqual(parsed.dc.creator, 'Someone');
      assert.strictEqual(parsed.dc.date, 2025);
      assert.deepStrictEqual(parsed.dc.subject, ['http://id.worldcat.org/fast/1', 'http://id.worldcat.org/fast/2']);
      assert.strictEqual(parsed.dc.description, undefined);
      assert.strictEqual(parsed.dc.publisher, undefined);
    });
  });
});
