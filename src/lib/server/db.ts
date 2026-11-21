import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { serverConfig } from "./config";

let instance: Database.Database | null = null;

function open() {
  mkdirSync(path.dirname(serverConfig.databasePath), { recursive: true });
  const db = new Database(serverConfig.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  // Scans and the web app share the same file. Wait for short writer
  // transactions instead of failing a folder with SQLITE_BUSY.
  db.pragma("busy_timeout = 15000");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -32000");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS titles (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('movie', 'series')),
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      alt_titles TEXT NOT NULL DEFAULT '[]',
      year INTEGER,
      overview TEXT,
      tagline TEXT,
      rating REAL,
      vote_count INTEGER,
      runtime INTEGER,
      genres TEXT NOT NULL DEFAULT '[]',
      cast_json TEXT NOT NULL DEFAULT '[]',
      directors TEXT NOT NULL DEFAULT '[]',
      poster_url TEXT,
      backdrop_url TEXT,
      trailer_url TEXT,
      local_poster TEXT,
      local_backdrop TEXT,
      folder_path TEXT NOT NULL,
      category TEXT,
      language TEXT,
      tmdb_id INTEGER,
      tmdb_kind TEXT,
      imdb_id TEXT,
      metadata_status TEXT NOT NULL DEFAULT 'none',
      metadata_updated_at INTEGER,
      file_path TEXT NOT NULL DEFAULT '',
      extension TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      total_size INTEGER NOT NULL DEFAULT 0,
      subtitles TEXT NOT NULL DEFAULT '[]',
      added_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      popularity REAL NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS titles_kind_folder_idx ON titles(kind, folder_path);
    CREATE INDEX IF NOT EXISTS titles_kind_year_idx ON titles(kind, year DESC);
    CREATE INDEX IF NOT EXISTS titles_added_idx ON titles(added_at DESC);
    CREATE INDEX IF NOT EXISTS titles_rating_idx ON titles(rating DESC);
    CREATE INDEX IF NOT EXISTS titles_normalized_idx ON titles(normalized_title);

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
      season INTEGER NOT NULL DEFAULT 1,
      episode INTEGER NOT NULL DEFAULT 1,
      name TEXT,
      path TEXT NOT NULL UNIQUE,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      runtime INTEGER,
      still_url TEXT,
      overview TEXT,
      subtitles TEXT NOT NULL DEFAULT '[]',
      modified_at INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS episodes_title_idx ON episodes(title_id, season, episode);
    CREATE INDEX IF NOT EXISTS episodes_path_idx ON episodes(path);

    CREATE TABLE IF NOT EXISTS media_files (
      path TEXT PRIMARY KEY,
      title_id TEXT NOT NULL,
      episode_id TEXT,
      kind TEXT NOT NULL,
      season INTEGER,
      episode INTEGER,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      modified_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS media_files_title_idx ON media_files(title_id);

    CREATE TABLE IF NOT EXISTS scan_dirs (
      path TEXT PRIMARY KEY,
      parent_path TEXT NOT NULL,
      mtime TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'collection',
      item_count INTEGER NOT NULL DEFAULT 0,
      depth INTEGER NOT NULL DEFAULT 0,
      last_scan_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS scan_dirs_parent_idx ON scan_dirs(parent_path);

    CREATE TABLE IF NOT EXISTS scan_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      status TEXT NOT NULL,
      scanned_dirs INTEGER NOT NULL DEFAULT 0,
      discovered_files INTEGER NOT NULL DEFAULT 0,
      indexed_titles INTEGER NOT NULL DEFAULT 0,
      indexed_episodes INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      message TEXT
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      query TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

export function getDb() {
  if (!instance) instance = open();
  return instance;
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function getLibraryVersion() {
  return Number(getSetting("library_version") || "0");
}

export function bumpLibraryVersion() {
  const next = getLibraryVersion() + 1;
  setSetting("library_version", String(next));
  return next;
}

export function getLastScanAt(): number | null {
  const value = getSetting("last_scan_at");
  return value ? Number(value) : null;
}

export function closeDb() {
  instance?.close();
  instance = null;
}

export type Db = Database.Database;
