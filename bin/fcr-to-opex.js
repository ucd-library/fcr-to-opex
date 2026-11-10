#!/usr/bin/env node
import { Command } from 'commander';
import { runPackage } from '../lib/commands/package.js';
import { runLogin } from '../lib/commands/login.js';
import config from '../lib/config.js';

const program = new Command();

program
  .name('fcr-to-opex')
  .description('Convert a dams-*-metadata repo (synced with its GCS binary archive) into a Preservica OPEX/PAX package');

program
  .command('login')
  .description('Authenticate Application Default Credentials for GCS access (gcloud auth application-default login) - a separate login from `gcloud auth login`/your active gcloud CLI account, and what this tool\'s GCS binary sync actually reads. Run this if `package` fails with a GCS permission error even though `gcloud config list` shows the right account.')
  .action(async () => {
    await runLogin();
  });

program
  .command('package')
  .description('Clone a dams-*-metadata repo, sync its GCS binaries, and convert it into an OPEX package + zip, ready for manual upload via Preservica\'s web UI (no API)')
  .requiredOption('-w, --working-dir <dir>', 'Directory to shallow-clone the dams-<slug>-metadata repo into')
  .requiredOption('-o, --output-dir <dir>', 'Output directory for the OPEX tree and zip')
  .requiredOption('-s, --slug <slug>', 'Collection slug - used for the GitHub repo name (dams-<slug>-metadata), the GCS binary prefix, and the output root folder name')
  .option('--github-org <org>', 'GitHub org the metadata repos live under', config.github.org)
  .option('--gcs-bucket <bucket>', 'GCS bucket to sync binaries from', config.gcs.bucket)
  .option('--skip-gcs-sync', 'Skip the GCS binary sync step (inspect the raw metadata-only checkout)', false)
  .option('--force-gcs-sync', 'Re-download every binary even if already present locally', false)
  .action(async (opts) => {
    await runPackage({
      workingDir: opts.workingDir,
      outputDir: opts.outputDir,
      slug: opts.slug,
      githubOrg: opts.githubOrg,
      gcsBucket: opts.gcsBucket,
      skipGcsSync: opts.skipGcsSync,
      forceGcsSync: opts.forceGcsSync
    });
  });

program.parseAsync(process.argv).catch(err => {
  console.error('[error]', err.message);
  process.exit(1);
});
