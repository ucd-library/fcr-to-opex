import path from 'path';
import * as cache from './cache.js';
import logger from './logger.js';
import config from './config.js';
import { listObjectsUnderPrefix, downloadObject } from './gcs-client.js';

const DESCRIPTOR_SUFFIX = '.jsonld.json';

/**
 * @description Print an inline (carriage-return, self-overwriting) progress
 * line when attached to a real terminal - a no-op otherwise, so piped/CI logs
 * don't fill up with one line per file.
 * @param {number} done - Objects processed so far (downloaded, skipped, or failed).
 * @param {number} total - Total candidate objects to process.
 * @param {string} relPath - The object currently being processed, for context.
 * @returns {void}
 */
function reportProgress(done, total, relPath) {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\x1b[2K\r[info] Syncing binaries: ${done}/${total} ${relPath}`);
}

/**
 * @description Sync a collection's binaries down from GCS onto its local
 * `dams-*-metadata` checkout, so lib/package/walk.js (which expects binaries
 * already present as real sibling files on disk) can run unchanged afterward.
 *
 * Production's `dams-*-metadata` GitHub repos are .gitignore'd down to only
 * `*.jsonld.json`/`.md`/directory-skeleton files - the actual binary bytes
 * live in GCS instead, at `gs://<bucket>/<slug>/<same-relative-path-as-the-
 * metadata-repo-tree-but-without-the-.jsonld.json-suffix>` (the same
 * convention production's own `collection-import` job uses via `gsutil
 * rsync`). There is no per-item GCS path field anywhere in the JSON-LD -
 * resolution is purely structural.
 *
 * This lists every object under that prefix and downloads it, rather than
 * pre-enumerating expected binary paths from the JSON-LD tree. That avoids
 * re-implementing walk.js's own content-discovery rules a second time (and
 * drifting out of sync with them), mirrors production's own list-and-diff
 * approach, and is safe to over-download: walk.js only ever reads a file when
 * its own sibling-path check already found it.
 *
 * @param {Object} params
 * @param {string} params.metadataDir - Local `dams-*-metadata` checkout (download destination root).
 * @param {string} params.slug - Collection slug / GCS prefix segment.
 * @param {string} [params.bucket] - GCS bucket name, defaults to config.gcs.bucket.
 * @param {boolean} [params.force=false] - Re-download even if a same-named local file already exists.
 * @param {Function} [params.listObjects] - Injectable, for tests. Defaults to listObjectsUnderPrefix.
 * @param {Function} [params.downloadObjectFn] - Injectable, for tests. Defaults to downloadObject.
 * @returns {Promise<{bucket: string, prefix: string, downloaded: string[], skippedExisting: string[], failed: string[]}>}
 */
export async function syncBinariesFromGcs({
  metadataDir,
  slug,
  bucket = config.gcs.bucket,
  force = false,
  listObjects = listObjectsUnderPrefix,
  downloadObjectFn = downloadObject
}) {
  const prefix = `${slug}/`;
  const objects = (await listObjects({ bucket, prefix }))
    .filter(object => !object.name.endsWith(DESCRIPTOR_SUFFIX) && !object.name.includes('/.git/'));

  const downloaded = [];
  const skippedExisting = [];
  const failed = [];

  for (const [index, object] of objects.entries()) {
    const relPath = object.name.slice(prefix.length);
    const destPath = path.join(metadataDir, relPath);
    reportProgress(index + 1, objects.length, relPath);

    if (!force && (await cache.exists(destPath))) {
      skippedExisting.push(relPath);
      continue;
    }

    try {
      await downloadObjectFn({ bucket, objectName: object.name, destPath });
      downloaded.push(relPath);
    } catch (err) {
      logger.warn(`Failed to download gs://${bucket}/${object.name}: ${err.message}`);
      failed.push(relPath);
    }
  }

  if (process.stdout.isTTY && objects.length) process.stdout.write('\n');
  logger.info(`GCS sync complete: ${downloaded.length} downloaded, ${skippedExisting.length} already present, ${failed.length} failed (gs://${bucket}/${prefix})`);
  return { bucket, prefix, downloaded, skippedExisting, failed };
}

export default syncBinariesFromGcs;
