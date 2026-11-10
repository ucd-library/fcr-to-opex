import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

const execFileAsync = promisify(execFile);

/**
 * @param {string} dir - Directory to check.
 * @returns {Promise<boolean>} True if `dir/.git` exists and is a directory.
 */
async function isGitRepo(dir) {
  try {
    return (await fs.stat(path.join(dir, '.git'))).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @description Ensure a `dams-*-metadata` repo's `main` branch is checked out
 * at `<workingDir>/dams-<slug>-metadata` - shallow-cloning it if nothing is
 * there yet, or updating an existing checkout in place (`git fetch` +
 * `git reset --hard origin/main`) otherwise.
 *
 * Updating in place rather than wiping and re-cloning matters because GCS
 * binary sync (lib/gcs-sync.js) downloads untracked files into this same
 * directory - a full wipe would destroy binaries a previous run already
 * synced, which is exactly the surprising behavior that motivated this: a
 * `--skip-gcs-sync` run reusing a working directory should see the binaries
 * the prior run put there, not lose them to the next run's clone step. Since
 * those binaries are untracked (production's `dams-*-metadata` repos
 * `.gitignore` everything but `*.jsonld.json`/`.md`), `git reset --hard` only
 * touches tracked descriptor files and leaves them alone.
 * @param {Object} params
 * @param {string} params.workingDir - Parent directory to clone/update into.
 * @param {string} params.slug - Collection slug; the repo name is `dams-<slug>-metadata`.
 * @param {string} [params.githubOrg='ucd-library'] - GitHub org the metadata repos live under.
 * @returns {Promise<string>} The local repo directory path.
 */
export async function cloneMetadataRepo({ workingDir, slug, githubOrg = 'ucd-library' }) {
  const repoName = `dams-${slug}-metadata`;
  const repoUrl = `https://github.com/${githubOrg}/${repoName}.git`;
  const destDir = path.join(workingDir, repoName);

  await fs.mkdir(workingDir, { recursive: true });

  if (await isGitRepo(destDir)) {
    logger.info(`Found existing checkout at ${destDir} - updating metadata (previously-synced binaries are preserved)`);
    try {
      await execFileAsync('git', ['fetch', '--depth', '1', 'origin', 'main'], { cwd: destDir });
      await execFileAsync('git', ['reset', '--hard', 'origin/main'], { cwd: destDir });
    } catch (err) {
      const detail = (err.stderr || err.message).trim();
      throw new Error(`Failed to update existing checkout at ${destDir} (git fetch/reset) - delete it and retry if it's corrupted:\n${detail}`);
    }
    return destDir;
  }

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
