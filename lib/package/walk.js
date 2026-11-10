import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as cache from '../cache.js';
import logger from '../logger.js';
import { extractIdentifiers } from './jsonld-fields.js';
import { extractDublinCoreFields, buildOaiDcXml } from './dublin-core.js';
import { buildFolderOpex, buildFileOpex, buildPaxOpex } from './opex.js';
import { writePaxContents } from './pax.js';
import { branchToRepresentationType } from '../pax-representations.js';

const DESCRIPTOR_SUFFIX = '.jsonld.json';

/**
 * @param {string} filePath - Path to check.
 * @returns {Promise<?import('fs').Stats>} The stat result, or null if it doesn't exist.
 */
async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath - Path to a binary file.
 * @returns {Promise<string>} SHA-1 hex digest of the file's contents.
 */
async function sha1(filePath) {
  const data = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(data).digest('hex');
}

/**
 * @param {string} filePath - Path to a `*.jsonld.json` file.
 * @returns {Promise<Object>} Parsed JSON contents.
 */
async function readJsonLd(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf-8'));
}

/**
 * @description Write one folder's `.opex` sidecar (title = original directory
 * basename - see lib/package/opex.js for why that's load-bearing, not cosmetic).
 * Used for the collection level (and any nested grouping folders) - item-level
 * packaging uses packageItem() instead, see below.
 * @param {string} descriptorPath - Path to the folder's `<name>.jsonld.json` descriptor.
 * @param {string} name - Original directory basename (also used as the output folder's name).
 * @param {string} outputParentDir - Directory to create `<name>/` inside.
 * @param {Object} stats - Mutable counters: {folders, assets, paxAssets, skipped}.
 * @returns {Promise<string>} The created output directory path.
 */
async function writeFolder(descriptorPath, name, outputParentDir, stats) {
  const json = await readJsonLd(descriptorPath);
  const identifiers = extractIdentifiers(json);
  const dcXml = buildOaiDcXml(extractDublinCoreFields(json));

  const outputDir = path.join(outputParentDir, name);
  await fs.mkdir(outputDir, { recursive: true });
  await cache.writeFile(path.join(outputDir, `${name}.opex`), buildFolderOpex({ title: name, identifiers, dcXml }));

  stats.folders++;
  logger.info(`Folder: ${name}${dcXml ? ' (with descriptive metadata)' : ''}`);
  return outputDir;
}

/**
 * @description Recurse into a container directory (already turned into a
 * Preservica folder) and package its own children. Used only at/above the
 * collection level - items are handled by packageItem()/packageItems() instead.
 * @param {string} descriptorPath - Path to the folder's own `<name>.jsonld.json`.
 * @param {string} dirPath - The directory to recurse into.
 * @param {string} outputParentDir - Directory to create the output folder inside.
 * @param {Object} stats - Mutable counters.
 * @returns {Promise<void>}
 */
async function packageFolder(descriptorPath, dirPath, outputParentDir, stats) {
  const name = path.basename(dirPath);
  const outputDir = await writeFolder(descriptorPath, name, outputParentDir, stats);
  await packageChildren(dirPath, outputDir, stats);
}

/**
 * @description Classify and package every `*.jsonld.json` file directly inside
 * `dirPath` as a folder (container) or skip it as an orphan (no sibling
 * dir/binary - e.g. `labels.jsonld.json`). Used only at/above the collection
 * level - see packageItems() for item-level packaging, which never produces a
 * generic leaf here (that would strip an item's page sequence down to
 * independent, unrelated assets - the bug this module exists to avoid).
 * @param {string} dirPath - Directory whose `*.jsonld.json` children to classify.
 * @param {string} outputDir - Corresponding output directory (already created).
 * @param {Object} stats - Mutable counters: {folders, assets, paxAssets, skipped}.
 * @returns {Promise<void>}
 */
async function packageChildren(dirPath, outputDir, stats) {
  const entries = await fs.readdir(dirPath);
  const descriptorNames = entries.filter(name => name.endsWith(DESCRIPTOR_SUFFIX)).sort();

  for (const descriptorName of descriptorNames) {
    const baseName = descriptorName.slice(0, -DESCRIPTOR_SUFFIX.length);
    const descriptorPath = path.join(dirPath, descriptorName);
    const siblingPath = path.join(dirPath, baseName);
    const siblingStat = await statOrNull(siblingPath);

    if (siblingStat?.isDirectory()) {
      await packageFolder(descriptorPath, siblingPath, outputDir, stats);
    } else {
      logger.warn(`Skipping orphan metadata file with no matching directory: ${descriptorPath}`);
      stats.skipped.push(descriptorPath);
    }
  }
}

/**
 * @description Discover every content file underneath one item's directory,
 * bucketed by Preservica representation type (see lib/pax-representations.js).
 * Transparently descends through an optional `media.jsonld.json` + `media/`
 * wrapper layer, since that wrapper carries no descriptive fields of its own
 * and its shape is regenerated synthetically on reconstruction rather than
 * preserved. A bare file at the base level is the Access representation; a
 * named sub-folder (e.g. `images/`, `text/`) becomes its own representation
 * per file inside it. `*.jsonld.json` files with no matching file/directory
 * are orphans.
 * @param {string} itemDir - The item's directory (`items/<item>/`).
 * @returns {Promise<{buckets: Map<string, Array<{name: string, sourcePath: string, filename: string}>>, orphans: string[]}>}
 */
async function discoverItemContent(itemDir) {
  const buckets = new Map();
  const orphans = [];

  function addLeaf(type, sourcePath) {
    const filename = path.basename(sourcePath);
    // The content-object folder name must be unique within its representation -
    // using the full filename (not the basename with extension stripped) avoids
    // collisions when two different files share a basename, e.g. "item.pdf" and
    // "item.txt" both folding into the Access representation (see
    // lib/pax-representations.js for why they end up in the same representation).
    if (!buckets.has(type)) buckets.set(type, []);
    buckets.get(type).push({ name: filename, sourcePath, filename });
  }

  let baseDir = itemDir;
  const mediaDescriptor = path.join(itemDir, `media${DESCRIPTOR_SUFFIX}`);
  const mediaDir = path.join(itemDir, 'media');
  if (await cache.exists(mediaDescriptor) && (await statOrNull(mediaDir))?.isDirectory()) {
    baseDir = mediaDir;
  }

  const entries = await fs.readdir(baseDir);
  const descriptorNames = entries.filter(name => name.endsWith(DESCRIPTOR_SUFFIX)).sort();

  for (const descriptorName of descriptorNames) {
    const baseName = descriptorName.slice(0, -DESCRIPTOR_SUFFIX.length);
    const siblingPath = path.join(baseDir, baseName);
    const siblingStat = await statOrNull(siblingPath);

    if (siblingStat?.isDirectory()) {
      const representationType = branchToRepresentationType(baseName);
      const subEntries = await fs.readdir(siblingPath);
      const subDescriptorNames = subEntries.filter(name => name.endsWith(DESCRIPTOR_SUFFIX)).sort();

      for (const subDescriptorName of subDescriptorNames) {
        const subBaseName = subDescriptorName.slice(0, -DESCRIPTOR_SUFFIX.length);
        const subFilePath = path.join(siblingPath, subBaseName);
        const subFileStat = await statOrNull(subFilePath);

        if (subFileStat?.isFile()) {
          addLeaf(representationType, subFilePath);
        } else {
          orphans.push(path.join(siblingPath, subDescriptorName));
        }
      }
    } else if (siblingStat?.isFile()) {
      addLeaf(branchToRepresentationType(null), siblingPath);
    } else {
      orphans.push(path.join(baseDir, descriptorName));
    }
  }

  return { buckets, orphans };
}

/**
 * @description Package one `items/<item>.jsonld.json` as exactly one Preservica
 * object - never a wrapping folder - placed directly under `outputParentDir`.
 * Dublin Core + identifiers always come from the item's own descriptor. A
 * single content file becomes a plain leaf-file OPEX; multiple content files
 * (e.g. a page sequence + an access PDF + a text transcript) become one PAX
 * complex asset, bucketed into representations - this is what makes Preservica
 * aware that a compound item's pages belong to one document instead of showing
 * up as N unrelated assets.
 * @param {string} descriptorPath - Path to `items/<item>.jsonld.json`.
 * @param {?string} itemDir - Path to `items/<item>/`, or null if it doesn't exist.
 * @param {string} outputParentDir - The collection's output directory.
 * @param {Object} stats - Mutable counters: {folders, assets, paxAssets, skipped}.
 * @returns {Promise<void>}
 */
async function packageItem(descriptorPath, itemDir, outputParentDir, stats) {
  const itemName = path.basename(descriptorPath, DESCRIPTOR_SUFFIX);
  const json = await readJsonLd(descriptorPath);
  const identifiers = extractIdentifiers(json);
  const dcXml = buildOaiDcXml(extractDublinCoreFields(json));

  if (!itemDir) {
    logger.warn(`Item "${itemName}" has no associated media directory, skipping`);
    stats.skipped.push(descriptorPath);
    return;
  }

  const { buckets, orphans } = await discoverItemContent(itemDir);
  for (const orphan of orphans) {
    logger.warn(`Skipping orphan metadata file with no matching file/directory: ${orphan}`);
    stats.skipped.push(orphan);
  }

  const allFiles = [...buckets.values()].flat();

  if (allFiles.length === 0) {
    logger.warn(`Item "${itemName}" has no content files, skipping`);
    stats.skipped.push(descriptorPath);
    return;
  }

  if (allFiles.length === 1) {
    const file = allFiles[0];
    const digest = await sha1(file.sourcePath);
    const data = await fs.readFile(file.sourcePath);
    await cache.writeFile(path.join(outputParentDir, file.filename), data);
    await cache.writeFile(
      path.join(outputParentDir, `${file.filename}.opex`),
      buildFileOpex({ title: itemName, identifiers, originalFilename: file.filename, sha1: digest, dcXml })
    );
    stats.assets++;
    logger.info(`Asset: ${itemName} -> ${file.filename} (${data.length} bytes)`);
    return;
  }

  const representations = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, contentObjects]) => ({
      type,
      contentObjects: [...contentObjects].sort((a, b) => a.filename.localeCompare(b.filename))
    }));

  const paxDir = path.join(outputParentDir, `${itemName}.pax`);
  const { folders, files, fixities } = await writePaxContents(paxDir, representations);

  await cache.writeFile(
    path.join(outputParentDir, `${itemName}.pax.opex`),
    buildPaxOpex({ title: itemName, identifiers, dcXml, fixities, folders, files })
  );

  stats.paxAssets++;
  logger.info(`PAX asset: ${itemName} (${files.length} files across ${representations.length} representation(s): ${representations.map(r => r.type).join(', ')})`);
}

/**
 * @description List item names (`items/<name>.jsonld.json` basenames, sorted)
 * from a `dams-*-metadata` checkout's `items/` directory, optionally capped to
 * the first `limit` - the exact ordering/truncation packageItems() itself
 * uses when a limit is set, so other code (e.g. the GCS sync step, for
 * `--limit` test packages) can determine exactly which items will end up in
 * the package without duplicating this logic.
 * @param {string} itemsDir - The `items/` directory.
 * @param {?number} [limit=null] - Cap the list to this many items, in sorted order.
 * @returns {Promise<string[]>} Item names (descriptor basenames, without `.jsonld.json`).
 */
export async function listItemNames(itemsDir, limit = null) {
  if (!(await cache.exists(itemsDir))) return [];
  const entries = await fs.readdir(itemsDir);
  const names = entries
    .filter(name => name.endsWith(DESCRIPTOR_SUFFIX))
    .map(name => name.slice(0, -DESCRIPTOR_SUFFIX.length))
    .sort();
  return limit != null ? names.slice(0, limit) : names;
}

/**
 * @description Package every item in `itemNames` as a direct child of the
 * collection's output folder (see packageItem()).
 * @param {string} itemsDir - The `items/` directory.
 * @param {string} outputParentDir - The collection's output directory.
 * @param {Object} stats - Mutable counters.
 * @param {string[]} itemNames - Item names to package, from listItemNames().
 * @returns {Promise<void>}
 */
async function packageItems(itemsDir, outputParentDir, stats, itemNames) {
  for (const itemName of itemNames) {
    const descriptorPath = path.join(itemsDir, `${itemName}${DESCRIPTOR_SUFFIX}`);
    const itemDirPath = path.join(itemsDir, itemName);
    const itemDirExists = (await statOrNull(itemDirPath))?.isDirectory() ?? false;
    await packageItem(descriptorPath, itemDirExists ? itemDirPath : null, outputParentDir, stats);
  }
}

/**
 * @description Package a `dams-*-metadata` repo into an OPEX-structured folder
 * tree. The repo's `collection/<name>.jsonld.json` + `collection/<name>/` pair
 * becomes the package's single root folder; every `items/*.jsonld.json`
 * becomes a Preservica object directly under that root (see packageItem()),
 * even though it lives under a different parent in the source.
 * @param {Object} params - Package parameters.
 * @param {string} params.metadataDir - Path to the `dams-*-metadata` repo.
 * @param {string} params.outputDir - Directory to write the package tree into.
 * @param {?string} [params.slug] - Output root folder name; defaults to the
 * `collection/*.jsonld.json` file's basename.
 * @param {?number} [params.itemLimit] - Package only the first N items
 * (sorted order, see listItemNames()) - for building small test packages.
 * `null` (the default) packages every item.
 * @returns {Promise<{rootDir: string, slug: string, stats: Object}>}
 */
export async function packageMetadataDir({ metadataDir, outputDir, slug = null, itemLimit = null }) {
  const collectionDir = path.join(metadataDir, 'collection');
  const collectionEntries = await fs.readdir(collectionDir);
  const descriptorName = collectionEntries.find(name => name.endsWith(DESCRIPTOR_SUFFIX));
  if (!descriptorName) {
    throw new Error(`No collection/*${DESCRIPTOR_SUFFIX} found in ${metadataDir}`);
  }

  const sourceName = descriptorName.slice(0, -DESCRIPTOR_SUFFIX.length);
  const resolvedSlug = slug || sourceName;
  const descriptorPath = path.join(collectionDir, descriptorName);
  const siblingDirPath = path.join(collectionDir, sourceName);

  const stats = { folders: 0, assets: 0, paxAssets: 0, skipped: [] };

  const rootDir = await writeFolder(descriptorPath, resolvedSlug, outputDir, stats);

  if (await cache.exists(siblingDirPath)) {
    await packageChildren(siblingDirPath, rootDir, stats);
  }

  const itemsDir = path.join(metadataDir, 'items');
  if (await cache.exists(itemsDir)) {
    const itemNames = await listItemNames(itemsDir, itemLimit);
    if (itemLimit != null) {
      logger.warn(`--limit active: packaging only ${itemNames.length} item(s) - this is a TEST package, not a full export`);
    }
    await packageItems(itemsDir, rootDir, stats, itemNames);
  }

  logger.info(`Package complete: ${stats.folders} folders, ${stats.assets} assets, ${stats.paxAssets} compound (PAX) assets, ${stats.skipped.length} skipped`);
  return { rootDir, slug: resolvedSlug, stats };
}

export default packageMetadataDir;
