import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';

let storage = null;

/**
 * @description Lazily construct a single shared Storage client. Auth is
 * resolved automatically via standard Google Application Default Credentials
 * (honors GOOGLE_APPLICATION_CREDENTIALS) - no custom auth code needed.
 * @returns {Storage}
 */
function getStorage() {
  if (!storage) storage = new Storage();
  return storage;
}

/**
 * @description List every object under a GCS prefix.
 * @param {Object} params
 * @param {string} params.bucket - GCS bucket name.
 * @param {string} params.prefix - Object key prefix to list under.
 * @returns {Promise<Array<{name: string, size: number}>>} Matching objects.
 */
export async function listObjectsUnderPrefix({ bucket, prefix }) {
  const [files] = await getStorage().bucket(bucket).getFiles({ prefix });
  return files.map(file => ({ name: file.name, size: Number(file.metadata?.size) || 0 }));
}

/**
 * @description Download one GCS object to a local path, creating parent
 * directories as needed.
 * @param {Object} params
 * @param {string} params.bucket - GCS bucket name.
 * @param {string} params.objectName - Full bucket-relative object key.
 * @param {string} params.destPath - Local destination path.
 * @returns {Promise<void>}
 */
export async function downloadObject({ bucket, objectName, destPath }) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await getStorage().bucket(bucket).file(objectName).download({ destination: destPath });
}

export default { listObjectsUnderPrefix, downloadObject };
