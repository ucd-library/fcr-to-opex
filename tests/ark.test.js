import assert from 'assert';
import { isArk } from '../lib/ark.js';

describe('lib/ark.js', () => {
  it('recognizes ARK-shaped strings', () => {
    assert.strictEqual(isArk('ark:/87293/d33t9dd5t'), true);
    assert.strictEqual(isArk('ark:/13030/c8x63tm3'), true);
  });

  it('rejects non-ARK strings', () => {
    assert.strictEqual(isArk('D-641'), false);
    assert.strictEqual(isArk('not-an-ark'), false);
    assert.strictEqual(isArk(''), false);
  });

  it('rejects non-string values', () => {
    assert.strictEqual(isArk(null), false);
    assert.strictEqual(isArk(undefined), false);
    assert.strictEqual(isArk(123), false);
  });
});
