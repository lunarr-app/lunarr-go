import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import LibsqlDatabase from "libsql";
import { readSavedTmdbCredentials, resolveTmdbCredentials, verifyTmdb } from "./verify-tmdb.mjs";

describe("TMDb verifier", () => {
  test("resolves saved TMDb credentials and ignores environment values", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-verify-tmdb-"));
    try {
      await mkdir(path.join(dir, "data"));
      const db = new LibsqlDatabase(path.join(dir, "data", "lunarr.db"));
      db.exec("create table app_setting (key text primary key, value text not null, updated_at text not null)");
      db.prepare("insert into app_setting (key, value, updated_at) values (?, ?, ?)").run(
        "tmdb_api_key",
        "saved-key",
        new Date().toISOString(),
      );
      db.close();

      const env = {
        LUNARR_DATA_DIR: "data",
        IGNORED_ACCESS_TOKEN: "",
        IGNORED_API_KEY: "env-key",
      };
      const saved = readSavedTmdbCredentials({ cwd: dir, env });

      expect(saved).toEqual({ tmdb_api_key: "saved-key" });
      expect(resolveTmdbCredentials({ saved, env })).toEqual({
        token: "",
        apiKey: "saved-key",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("verifies a live-shaped TMDb response without exposing the secret", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-verify-tmdb-"));
    const requestedUrls = [];
    try {
      await mkdir(path.join(dir, "data"));
      const db = new LibsqlDatabase(path.join(dir, "data", "lunarr.db"));
      db.exec("create table app_setting (key text primary key, value text not null, updated_at text not null)");
      db.prepare("insert into app_setting (key, value, updated_at) values (?, ?, ?)").run(
        "tmdb_access_token",
        "saved-token-value",
        new Date().toISOString(),
      );
      db.close();

      const result = await verifyTmdb({
        cwd: dir,
        env: {
          LUNARR_DATA_DIR: "data",
          IGNORED_ACCESS_TOKEN: "env-token-value",
        },
        fetcher: async (url, init) => {
          requestedUrls.push(String(url));
          expect(init.headers.authorization).toBe("Bearer saved-token-value");

          if (String(url).includes("/search/movie")) {
            return Response.json({
              results: [{ id: 603, title: "The Matrix" }],
            });
          }

          return Response.json({
            id: 603,
            title: "The Matrix",
            poster_path: "/matrix.jpg",
          });
        },
      });

      expect(result).toEqual({
        ok: true,
        message: "TMDb returned The Matrix with poster /matrix.jpg.",
        title: "The Matrix",
        posterPath: "/matrix.jpg",
      });
      expect(requestedUrls).toHaveLength(2);
      expect(result.message).not.toContain("saved-token-value");
      expect(result.message).not.toContain("env-token-value");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("uses the bundled fallback when no user credential exists", async () => {
    const requestedUrls = [];
    const result = await verifyTmdb({
      env: {},
      fetcher: async (url, init) => {
        requestedUrls.push(String(url));
        expect(init.headers.authorization).toMatch(/^Bearer /);

        if (String(url).includes("/search/movie")) {
          return Response.json({ results: [{ id: 603, title: "The Matrix" }] });
        }

        return Response.json({
          id: 603,
          title: "The Matrix",
          poster_path: "/matrix.jpg",
        });
      },
    });

    expect(result.ok).toBe(true);
    expect(result.message).toBe("TMDb returned The Matrix with poster /matrix.jpg.");
    expect(requestedUrls).toHaveLength(2);
  });
});
