// SQLite via better-sqlite3 (synchronous, WAL). One file per process: data/allowance.db by default.
// On Render's free plan the disk is ephemeral: the app re-seeds on boot (lib/store/seed.ts).
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

let shared: Db | undefined;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.exec(readFileSync(path.join(process.cwd(), 'lib', 'store', 'schema.sql'), 'utf8'));
  migrate(db);
  return db;
}

/** The app's shared connection. */
export function getDb(): Db {
  shared ??= openDb(process.env.ALLOWANCE_DB_PATH ?? path.join(process.cwd(), 'data', 'allowance.db'));
  return shared;
}

/** Additive migrations for databases created by an older schema. */
function migrate(db: Db) {
  const cols = (db.prepare('PRAGMA table_info(decisions)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('source')) db.exec("ALTER TABLE decisions ADD COLUMN source TEXT NOT NULL DEFAULT 'live'");
}
