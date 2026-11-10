import { XMLBuilder } from 'fast-xml-parser';

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true
});

export const OAI_DC_SCHEMA_URI = 'http://www.openarchives.org/OAI/2.0/oai_dc/';

/**
 * @param {*} value - A JSON-LD value that may be a plain string or a typed
 * literal `{"@value": ...}`.
 * @returns {?string} The trimmed text value, or null.
 */
function textValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object' && '@value' in value) return String(value['@value']).trim() || null;
  return null;
}

/**
 * @description Read the first plain-string value out of a field that may be a
 * single value or an array mixing strings and `{"@id": ...}`/typed-literal
 * objects - `{"@id": ...}` entries are silently skipped (used for `schema:publisher`,
 * which mixes a plain string with an LOC name-authority reference).
 * @param {*} value - A JSON-LD field value.
 * @returns {?string} The first text value found, or null.
 */
function firstString(value) {
  if (value == null) return null;
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    const text = textValue(entry);
    if (text) return text;
  }
  return null;
}

/**
 * @param {*} value - A JSON-LD value, expected to be `{"@id": "..."}`.
 * @returns {?string} The `@id` URI, or null.
 */
function idValue(value) {
  return (value && typeof value === 'object' && value['@id']) || null;
}

/**
 * @description Best-effort schema.org -> Dublin Core field extraction, applied
 * only at the collection/item level (nodes with no matching fields, e.g. the
 * LDP/ebucore-only container and technical-metadata records nested under an
 * item, return null so no DescriptiveMetadata block is attached to them at all).
 * @param {Object} json - A source `*.jsonld.json` document.
 * @returns {?{title: ?string, description: ?string, creator: ?string, date: ?string,
 * rights: ?string, subjects: string[], publisher: ?string}} Extracted fields, or
 * null if nothing mapped.
 */
export function extractDublinCoreFields(json) {
  const title = firstString(json?.['schema:name']);
  const description = firstString(json?.['schema:description']);
  const creator = firstString(json?.['schema:creator']);
  const date = firstString(json?.['schema:datePublished']);
  const rights = idValue(json?.['schema:license']);
  const about = json?.['schema:about'];
  const subjects = (Array.isArray(about) ? about : (about ? [about] : [])).map(idValue).filter(Boolean);
  const publisher = firstString(json?.['schema:publisher']);

  const hasAny = Boolean(title || description || creator || date || rights || subjects.length || publisher);
  return hasAny ? { title, description, creator, date, rights, subjects, publisher } : null;
}

/**
 * @description Render extracted Dublin Core fields as an `oai_dc:dc` XML
 * fragment - one of the schemas Preservica natively speaks (its own OAI-PMH
 * endpoint always supports `oai_dc`), so it's usable as real, standard
 * descriptive metadata without a custom metadata template.
 * @param {?Object} fields - From extractDublinCoreFields(), or null.
 * @returns {?string} The `oai_dc:dc` XML fragment (no XML prolog), or null if
 * `fields` is null - signaling that no DescriptiveMetadata should be attached.
 */
export function buildOaiDcXml(fields) {
  if (!fields) return null;

  const dc = {};
  if (fields.title) dc['dc:title'] = fields.title;
  if (fields.description) dc['dc:description'] = fields.description;
  if (fields.creator) dc['dc:creator'] = fields.creator;
  if (fields.date) dc['dc:date'] = fields.date;
  if (fields.rights) dc['dc:rights'] = fields.rights;
  if (fields.subjects?.length) dc['dc:subject'] = fields.subjects;
  if (fields.publisher) dc['dc:publisher'] = fields.publisher;

  const doc = {
    'oai_dc:dc': {
      '@_xmlns:oai_dc': OAI_DC_SCHEMA_URI,
      '@_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      ...dc
    }
  };

  return builder.build(doc).trim();
}

export default { extractDublinCoreFields, buildOaiDcXml };
