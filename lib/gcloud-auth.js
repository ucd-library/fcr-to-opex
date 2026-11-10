import { spawn } from 'child_process';

/**
 * @description Run `gcloud auth application-default login` interactively,
 * inheriting this process's stdio so the user sees gcloud's own browser-login
 * flow and prompts.
 *
 * This sets Application Default Credentials (ADC) - the credential store
 * `@google-cloud/storage` actually reads (see lib/gcs-client.js's bare
 * `new Storage()`), which is a **separate** login from `gcloud auth login`/the
 * CLI's own active account shown by `gcloud config list`. A stale or
 * mismatched ADC login (e.g. from an old `gcloud auth application-default
 * login` under a different Google account) is a common, confusing cause of
 * "does not have storage.objects.list access" errors even when
 * `gcloud config list` shows the correct, expected account.
 * @returns {Promise<void>}
 */
export async function runApplicationDefaultLogin() {
  await new Promise((resolve, reject) => {
    const child = spawn('gcloud', ['auth', 'application-default', 'login'], { stdio: 'inherit' });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('gcloud CLI not found on PATH - install the Google Cloud SDK first: https://cloud.google.com/sdk/docs/install'));
      } else {
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gcloud auth application-default login exited with code ${code}`));
    });
  });
}

export default runApplicationDefaultLogin;
