import LibsqlDatabase from "libsql";
import { Kysely, SqliteDialect, sql } from "kysely";
import { Migrator, type Migration, type MigrationProvider } from "kysely/migration";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { appEnv } from "../config/env";
import type { Database } from "./schema";
import migration0001 from "./migrations/0001_initial.sql?raw";
import migration0002 from "./migrations/0002_webdav_library_source.sql?raw";
import migration0003 from "./migrations/0003_playback_hls_cache.sql?raw";
import migration0004 from "./migrations/0004_admin_user_fields.sql?raw";
import migration0005 from "./migrations/0005_media_share.sql?raw";
import migration0006 from "./migrations/0006_device_pairing.sql?raw";
import migration0007 from "./migrations/0007_watchlist.sql?raw";
import migration0008 from "./migrations/0008_indexes.sql?raw";

const DATA_DIR = path.resolve(appEnv.LUNARR_DATA_DIR);
const DB_FILE = path.join(DATA_DIR, "lunarr.db");

const MIGRATION_SOURCES = {
  "0001_initial": migration0001,
  "0002_webdav_library_source": migration0002,
  "0003_playback_hls_cache": migration0003,
  "0004_admin_user_fields": migration0004,
  "0005_media_share": migration0005,
  "0006_device_pairing": migration0006,
  "0007_watchlist": migration0007,
  "0008_indexes": migration0008,
} satisfies Record<string, string>;

let sqlite: LibsqlDatabase.Database | undefined;
let kysely: Kysely<Database> | undefined;
let databaseFileOverride: string | undefined;

function splitSqlStatements(source: string) {
  return source
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function getSqlite() {
  if (sqlite) return sqlite;

  const dbFile = databaseFileOverride ?? DB_FILE;
  await mkdir(databaseFileOverride ? path.dirname(databaseFileOverride) : DATA_DIR, { recursive: true });
  sqlite = new LibsqlDatabase(dbFile);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

export async function getDb() {
  if (kysely) return kysely;

  kysely = new Kysely<Database>({
    dialect: new SqliteDialect({
      database: await getSqlite(),
    }),
  });
  return kysely;
}

class SqlFileMigrationProvider implements MigrationProvider {
  async getMigrations() {
    const migrations: Record<string, Migration> = {};

    for (const [name, source] of Object.entries(MIGRATION_SOURCES).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      migrations[name] = {
        up: async (db) => {
          for (const statement of splitSqlStatements(source)) {
            await sql.raw(statement).execute(db);
          }
        },
      };
    }

    return migrations;
  }
}

export async function migrateDatabase() {
  const db = await getDb();
  const migrator = new Migrator({
    db,
    provider: new SqlFileMigrationProvider(),
  });
  const result = await migrator.migrateToLatest();

  if (result.error) {
    throw result.error;
  }
}

export async function closeDatabaseForTests() {
  await kysely?.destroy();
  kysely = undefined;
  sqlite?.close();
  sqlite = undefined;
}

export function currentDatabasePaths() {
  const dbFile = databaseFileOverride ?? DB_FILE;
  return {
    dataDir: databaseFileOverride ? path.dirname(databaseFileOverride) : DATA_DIR,
    dbFile,
  };
}

export async function useDatabaseFileForTests(dbFile: string) {
  await closeDatabaseForTests();
  databaseFileOverride = dbFile;
}

export type { Database };
