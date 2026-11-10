import assert from 'assert';
import { extractIdentifiers } from '../lib/package/jsonld-fields.js';

describe('lib/package/jsonld-fields.js', () => {
  describe('extractIdentifiers', () => {
    it('tags ARK-shaped values and treats everything else as LocalID', () => {
      const result = extractIdentifiers({ 'schema:identifier': ['D-641', 'ark:/87293/d33t9dd5t'] });
      assert.deepStrictEqual(result, [
        { type: 'LocalID', value: 'D-641' },
        { type: 'ARK', value: 'ark:/87293/d33t9dd5t' }
      ]);
    });

    it('handles a single string value (not wrapped in an array)', () => {
      const result = extractIdentifiers({ 'schema:identifier': 'ark:/87293/d37m04681' });
      assert.deepStrictEqual(result, [{ type: 'ARK', value: 'ark:/87293/d37m04681' }]);
    });

    it('returns an empty array when schema:identifier is absent', () => {
      assert.deepStrictEqual(extractIdentifiers({}), []);
    });
  });
});
