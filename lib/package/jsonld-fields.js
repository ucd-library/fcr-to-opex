import { isArk } from '../ark.js';

/**
 * @description Normalize a schema:identifier entry (usually a plain string in
 * this profile, but tolerate `{"@id": ...}`/`{"@value": ...}` shapes) to a string.
 * @param {*} entry - One schema:identifier array entry.
 * @returns {?string} The identifier value, or null if it couldn't be read.
 */
function identifierValue(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') return entry['@id'] || entry['@value'] || null;
  return null;
}

/**
 * @description Extract `schema:identifier` values from a source JSON-LD document
 * for use as Preservica OPEX `Properties/Identifiers/Identifier` entries. ARK-shaped
 * values are tagged `type: "ARK"`, everything else `type: "LocalID"`.
 * @param {Object} json - A source `*.jsonld.json` document.
 * @returns {Array<{type: 'ARK'|'LocalID', value: string}>} Identifiers found, `[]` if none.
 */
export function extractIdentifiers(json) {
  const raw = json?.['schema:identifier'];
  if (!raw) return [];

  const entries = Array.isArray(raw) ? raw : [raw];
  return entries
    .map(identifierValue)
    .filter(Boolean)
    .map(value => ({ type: isArk(value) ? 'ARK' : 'LocalID', value }));
}

export default extractIdentifiers;
