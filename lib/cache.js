import fs from 'fs/promises';
import path from 'path';

/**
 * @description Check whether a cache file already exists on disk.
 * @param {string} filePath - Path to the cache file.
 * @returns {Promise<boolean>} True if the file exists.
 */
export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @description Read and JSON-parse a cache file.
 * @param {string} filePath - Path to the cache file.
 * @returns {Promise<Object>} Parsed JSON contents.
 */
export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * @description Write a value to disk as pretty-printed JSON, creating parent
 * directories as needed.
 * @param {string} filePath - Path to write to.
 * @param {Object} value - Value to serialize as JSON.
 * @returns {Promise<void>}
 */
export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

/**
 * @description Copy or stream a file to disk, creating parent directories as needed.
 * @param {string} destPath - Destination path.
 * @param {Buffer|ReadableStream} data - File contents.
 * @returns {Promise<void>}
 */
export async function writeFile(destPath, data) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, data);
}
