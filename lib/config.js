import 'dotenv/config';

const env = process.env;

/**
 * @description Single env-driven config object for the fcr-to-opex CLI, built
 * once at module load. Organized by subsystem.
 */
const config = {
  gcs: {
    bucket: env.FCR_TO_OPEX_GCS_BUCKET || 'dams-collections-binary-backups'
  },
  github: {
    org: env.FCR_TO_OPEX_GITHUB_ORG || 'ucd-library'
  }
};

export default config;
