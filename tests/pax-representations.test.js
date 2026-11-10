import assert from 'assert';
import { branchToRepresentationType, representationTypeToBranch } from '../lib/pax-representations.js';

describe('lib/pax-representations.js', () => {
  describe('branchToRepresentationType', () => {
    it('maps the images branch to Preservation', () => {
      assert.strictEqual(branchToRepresentationType('images'), 'Preservation');
    });

    it('maps a bare file (null branch) to Access', () => {
      assert.strictEqual(branchToRepresentationType(null), 'Access');
    });

    it('maps every other branch name to Access - only Preservation/Access are Preservica-recognized types', () => {
      assert.strictEqual(branchToRepresentationType('text'), 'Access');
      assert.strictEqual(branchToRepresentationType('audio'), 'Access');
    });
  });

  describe('representationTypeToBranch', () => {
    it('maps Preservation back to images', () => {
      assert.strictEqual(representationTypeToBranch('Preservation'), 'images');
    });

    it('maps Access to null (direct child of media/)', () => {
      assert.strictEqual(representationTypeToBranch('Access'), null);
    });
  });
});
