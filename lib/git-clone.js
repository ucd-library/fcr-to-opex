import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

const execFileAsync = promisify(execFile);

/**
 * @description Shallow-clone a `dams-*-metadata` repo's `main` branch into a
 * working directory. Any existing checkout at the destination path is removed
 * first - the working directory is treated as ephemeral/managed by this tool,
 * re-cloned fresh on every run so it always reflects the latest metadata.
 * @param {Object} params
 * @param {string} params.workingDir - Parent directory to clone into.
 * @param {string} params.slug - Collection slug; the repo name is `dams-<slug>-metadata`.
 * @param {string} [params.githubOrg='ucd-library'] - GitHub org the metadata repos live under.
 * @returns {Promise<string>} The cloned repo's local directory path.
 */
export async function cloneMetadataRepo({ workingDir, slug, githubOrg = 'ucd-library' }) {
  const repoName = `dams-${slug}-metadata`;
  const repoUrl = `https://github.com/${githubOrg}/${repoName}.git`;
  const destDir = path.join(workingDir, repoName);

  await fs.mkdir(workingDir, { recursive: true });
  await fs.rm(destDir, { recursive: true, force: true });

  logger.info(`Cloning ${repoUrl} (main, depth 1) -> ${destDir}`);
  try {
    await execFileAsync('git', ['clone', '--depth', '1', '--branch', 'main', repoUrl, destDir]);
  } catch (err) {
    const detail = (err.stderr || err.message).trim();
    throw new Error(`Failed to clone ${repoUrl} (branch main) - check --slug/--github-org are correct:\n${detail}`);
  }

  return destDir;
}

export default cloneMetadataRepo;
