import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadDotenv, parseDotenvLine } from "./env.mjs";

describe("startup env loader", () => {
  test("parses dotenv lines used by Lunarr start", () => {
    expect(parseDotenvLine("AUTH_SECRET=abc")).toEqual({
      key: "AUTH_SECRET",
      value: "abc",
    });
    expect(parseDotenvLine("export PORT=3000")).toEqual({
      key: "PORT",
      value: "3000",
    });
    expect(parseDotenvLine("ORIGIN='http://127.0.0.1:3000'")).toEqual({
      key: "ORIGIN",
      value: "http://127.0.0.1:3000",
    });
    expect(parseDotenvLine("# comment")).toBeUndefined();
  });

  test("loads .env without overwriting explicit process values", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lunarr-env-"));
    try {
      await writeFile(path.join(dir, ".env"), "AUTH_SECRET=from-file\nPORT=3000\n");
      const env = { AUTH_SECRET: "explicit" };

      expect(loadDotenv({ cwd: dir, env })).toBe(1);
      expect(env).toEqual({
        AUTH_SECRET: "explicit",
        PORT: "3000",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
