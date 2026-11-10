import path from 'path';
import { packageMetadataDir, listItemNames } from '../package/walk.js';
import { zipDirectory } from '../package/zip.js';
import { cloneMetadataRepo } from '../git-clone.js';
import { syncBinariesFromGcs } from '../gcs-sync.js';
import config from '../config.js';
import logger from '../logger.js';

/**
 * @description Convert a `dams-*-metadata` repo into an OPEX-structured package
 * ready for manual upload via Preservica's web UI, plus a ready-to-upload zip.
 * Always starts by shallow-cloning the collection's `dams-<slug>-metadata` repo
 * (main branch) fresh into `workingDir` (see lib/git-clone.js), then syncs its
 * binaries down from GCS (production checkouts only contain `*.jsonld.json`
 * descriptors - see lib/gcs-sync.js), unless `skipGcsSync` is set (e.g. for
 * inspecting the raw metadata-only checkout).
 * @param {Object} params - Package parameters.
 * @param {string} params.workingDir - Directory to clone the metadata repo into.
 * @param {string} params.outputDir - Directory to write the package tree and zip into.
 * @param {string} params.slug - Collection slug - used for the GitHub repo name (`dams-<slug>-metadata`), the GCS prefix, and the output root folder name.
 * @param {string} [params.githubOrg] - GitHub org the metadata repos live under, defaults to config.github.org.
 * @param {string} [params.gcsBucket] - GCS bucket name, defaults to config.gcs.bucket.
 * @param {boolean} [params.skipGcsSync=false] - Skip the GCS binary sync step entirely.
 * @param {boolean} [params.forceGcsSync=false] - Re-download every binary even if already present locally.
 * @param {?number} [params.limit=null] - Build a small TEST package: only the
 * first N items (sorted order) are synced from GCS (each item's own content is
 * synced in full, just fewer items) and packaged. `null` packages everything.
 * @returns {Promise<{rootDir: string, zipPath: string, stats: Object}>}
 */
export async function runPackage({
  workingDir,
  outputDir,
  slug,
  githubOrg = config.github.org,
  gcsBucket = config.gcs.bucket,
  skipGcsSync = false,
  forceGcsSync = false,
  limit = null
}) {
  if (limit != null) {
    logger.warn(`--limit ${limit} active: building a TEST package (first ${limit} item(s) only) - do NOT treat this as a full export`);
  }

  const metadataDir = await cloneMetadataRepo({ workingDir, slug, githubOrg });
  const itemNames = limit != null ? await listItemNames(path.join(metadataDir, 'items'), limit) : null;

  if (skipGcsSync) {
    logger.info('Skipping GCS binary sync (--skip-gcs-sync)');
  } else {
    await syncBinariesFromGcs({ metadataDir, slug, bucket: gcsBucket, force: forceGcsSync, itemNames });
  }

  const { rootDir, slug: resolvedSlug, stats } = await packageMetadataDir({ metadataDir, outputDir, slug, itemLimit: limit });

  const zipPath = path.join(outputDir, `${resolvedSlug}.zip`);
  await zipDirectory(rootDir, zipPath);
  logger.info(`Wrote ${zipPath} - upload this via Preservica's web ingest/upload screen`);

  return { rootDir, zipPath, stats };
}

export default runPackage;
