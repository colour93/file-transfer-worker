export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  S3_ENDPOINT: string
  S3_BUCKET: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_REGION: string
  S3_FORCE_PATH_STYLE?: string
  OIDC_ISSUER: string
  OIDC_CLIENT_ID: string
  OIDC_CLIENT_SECRET: string
  OIDC_REDIRECT_URI: string
  OIDC_REQUIRE_VERIFIED_EMAIL?: string
  ADMIN_EMAILS: string
  APP_ORIGIN?: string
  HASH_SECRET: string
  MAX_FILE_BYTES?: string
  UPLOAD_URL_TTL?: string
  DOWNLOAD_URL_TTL?: string
  SESSION_TTL?: string
  APP_TITLE?: string
  MAX_BATCH_FILES?: string
}
