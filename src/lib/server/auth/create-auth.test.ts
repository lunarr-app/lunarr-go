import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "kysely";
import { auth, rebindAuthForTests } from "./create-auth";
import { closeDatabaseForTests, getDb, useDatabaseFileForTests } from "../db";

describe("auth init on a fresh database", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lunarr-auth-init-"));
    await useDatabaseFileForTests(path.join(tempDir, "lunarr.db"));
  });

  afterAll(async () => {
    await closeDatabaseForTests();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("migrates before better-auth validates the schema", async () => {
    await rebindAuthForTests();

    const session = await auth.api.getSession({ headers: new Headers() });
    expect(session).toBeNull();

    const db = await getDb();
    const applied = await sql<{ count: number }>`select count(*) as count from kysely_migration`.execute(db);
    expect(Number(applied.rows[0]?.count)).toBeGreaterThan(0);

    const columns = await sql<{ name: string }>`select name from pragma_table_info('account')`.execute(db);
    expect(columns.rows.map((row) => row.name)).not.toContain("issuer");

    const indexes = await sql<{ name: string }>`
      select name from sqlite_master where type = 'index' and tbl_name = 'account'
    `.execute(db);
    expect(indexes.rows.map((row) => row.name)).not.toContain("account_issuer_account_id_uidx");
  });
});
