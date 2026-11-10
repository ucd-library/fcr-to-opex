import { runApplicationDefaultLogin } from '../gcloud-auth.js';
import logger from '../logger.js';

/**
 * @description Authenticate Application Default Credentials (ADC) for GCS
 * access, via `gcloud auth application-default login`. This is what
 * `package`'s GCS binary sync step actually reads - a separate login from
 * `gcloud auth login`/your active `gcloud` CLI account - so run this whenever
 * `package` fails with a GCS permission error even though `gcloud config
 * list` shows the expected account.
 * @returns {Promise<void>}
 */
export async function runLogin() {
  await runApplicationDefaultLogin();
  logger.info('Application Default Credentials updated - GCS binary sync should now authenticate as the account you just signed in with.');
}

export default runLogin;
