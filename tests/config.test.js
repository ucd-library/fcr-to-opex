import assert from 'assert';

describe('lib/config.js', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults gcs.bucket to dams-collections-binary-backups when unset', async () => {
    delete process.env.FCR_TO_OPEX_GCS_BUCKET;
    const { default: config } = await import(`../lib/config.js?t=${Math.random()}`);
    assert.strictEqual(config.gcs.bucket, 'dams-collections-binary-backups');
  });

  it('respects FCR_TO_OPEX_GCS_BUCKET override', async () => {
    process.env.FCR_TO_OPEX_GCS_BUCKET = 'custom-bucket';
    const { default: config } = await import(`../lib/config.js?t=${Math.random()}`);
    assert.strictEqual(config.gcs.bucket, 'custom-bucket');
  });
});
