import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as cache from '../cache.js';

/**
 * @param {string} filePath - Path to a file whose contents to hash.
 * @returns {Promise<{data: Buffer, sha1: string}>} File contents and SHA-1 hex digest.
 */
async function readAndHash(filePath) {
  const data = await fs.readFile(filePath);
  const sha1 = crypto.createHash('sha1').update(data).digest('hex');
  return { data, sha1 };
}

/**
 * @description Write a PAX asset's contents: `Representation_<Type>/<content-object-name>/<file>`
 * for every file, one sub-folder per content object (no extra Generation layer,
 * since none of these have more than one generation). Content-object order
 * within a representation is alphanumeric by folder name - callers should pass
 * `contentObjects` pre-sorted (e.g. by original zero-padded filename) since
 * that's what Preservica uses to render page order.
 * @param {string} paxDir - Path to create the `.pax` folder tree at.
 * @param {Array<{type: string, contentObjects: Array<{name: string, sourcePath: string, filename: string}>}>} representations -
 * One entry per representation type, each with its content objects in the order they should appear.
 * @returns {Promise<{folders: string[], files: string[], fixities: Array<{path: string, sha1: string}>}>}
 * Relative paths (posix-style, relative to `paxDir`) for building the OPEX Manifest/Fixities blocks.
 */
export async function writePaxContents(paxDir, representations) {
  const folders = [];
  const files = [];
  const fixities = [];

  for (const rep of representations) {
    const repFolder = `Representation_${rep.type}`;
    folders.push(repFolder);

    for (const co of rep.contentObjects) {
      const coFolder = `${repFolder}/${co.name}`;
      folders.push(coFolder);

      const relFilePath = `${coFolder}/${co.filename}`;
      files.push(relFilePath);

      const { data, sha1 } = await readAndHash(co.sourcePath);
      await cache.writeFile(path.join(paxDir, coFolder, co.filename), data);
      fixities.push({ path: relFilePath, sha1 });
    }
  }

  return { folders, files, fixities };
}

export default writePaxContents;
