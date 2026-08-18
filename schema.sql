PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS upload_grants (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  time_rule_enabled INTEGER NOT NULL DEFAULT 1,
  valid_from INTEGER,
  valid_until INTEGER,
  uses_rule_enabled INTEGER NOT NULL DEFAULT 1,
  max_uses INTEGER,
  used_uses INTEGER NOT NULL DEFAULT 0,
  max_batch_bytes INTEGER NOT NULL DEFAULT 5368709120,
  revoked_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS upload_grant_codes (
  upload_grant_id TEXT PRIMARY KEY REFERENCES upload_grants(id) ON DELETE CASCADE,
  code_ciphertext TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transfer_batches (
  id TEXT PRIMARY KEY,
  upload_grant_id TEXT NOT NULL REFERENCES upload_grants(id),
  pickup_hash TEXT NOT NULL UNIQUE,
  share_hash TEXT NOT NULL UNIQUE,
  completion_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','ready','revoked','expired')),
  total_files INTEGER NOT NULL,
  total_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS stored_objects (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  md5_hex TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','ready','deleted')),
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS batch_files (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES transfer_batches(id),
  object_id TEXT NOT NULL REFERENCES stored_objects(id),
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  md5_hex TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS oidc_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash, bucket)
);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON transfer_batches(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_objects_fingerprint ON stored_objects(status, size_bytes, md5_hex);
CREATE INDEX IF NOT EXISTS idx_batch_files_batch ON batch_files(batch_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_batch_files_object ON batch_files(object_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON oidc_sessions(expires_at);
