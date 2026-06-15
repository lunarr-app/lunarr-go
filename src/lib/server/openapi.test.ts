import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { openApiDocument, openApiYaml } from "./openapi";
import { APP_VERSION } from "./version";

const ROUTE_ROOTS = ["src/routes/api", "src/routes/media"];
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

async function routeFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) return routeFiles(entryPath);
      return entry.name === "+server.ts" ? [entryPath] : [];
    }),
  );
  return files.flat();
}

function routePathForFile(filePath: string) {
  const routePath = filePath
    .replace(/^src\/routes/, "")
    .replace(/\/\+server\.ts$/, "")
    .replace(/\[([^\]]+)\]/g, "{$1}");
  return routePath || "/";
}

async function exportedMethods(filePath: string) {
  const source = await readFile(filePath, "utf8");
  return HTTP_METHODS.filter((method) => new RegExp(`export\\s+const\\s+${method}\\b`).test(source));
}

function collectRefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectRefs);
  if (!value || typeof value !== "object") return [];

  const refs: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string") refs.push(child);
    refs.push(...collectRefs(child));
  }
  return refs;
}

function resolveJsonPointer(document: unknown, pointer: string) {
  if (!pointer.startsWith("#/")) return undefined;
  return pointer
    .slice(2)
    .split("/")
    .reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object") return undefined;
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      return (current as Record<string, unknown>)[key];
    }, document);
}

describe("OpenAPI document", () => {
  test("describes the Lunarr API contract", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
    expect(openApiDocument.info).toMatchObject({
      title: "Lunarr API",
      version: APP_VERSION,
    });
    expect(openApiDocument.paths).toHaveProperty("/api/me");
    expect(openApiDocument.paths).toHaveProperty("/api/continue");
    expect(openApiDocument.paths).toHaveProperty("/api/playback/{id}");
    expect(openApiDocument.paths).toHaveProperty("/media/files/{id}/stream");
    expect(openApiDocument.components).toHaveProperty("securitySchemes");
  });

  test("serializes the document as YAML", () => {
    const yaml = openApiYaml();

    expect(yaml).toContain('openapi: "3.1.0"');
    expect(yaml).toContain('"/api/movies/{id}":');
    expect(yaml).toContain("operationId:");
  });

  test("documents every API and media route method", async () => {
    const files = (await Promise.all(ROUTE_ROOTS.map(routeFiles))).flat();
    const documentedPaths = openApiDocument.paths as Record<string, Record<string, unknown>>;

    for (const file of files) {
      const routePath = routePathForFile(file);
      const methods = await exportedMethods(file);

      expect(Object.hasOwn(documentedPaths, routePath), `${routePath} is missing from OpenAPI`).toBe(true);
      for (const method of methods) {
        expect(
          Object.hasOwn(documentedPaths[routePath] ?? {}, method.toLowerCase()),
          `${method} ${routePath} is missing from OpenAPI`,
        ).toBe(true);
      }
    }
  });

  test("does not declare JSON bodies for no-content or HEAD responses", () => {
    const documentedPaths = openApiDocument.paths as Record<
      string,
      Record<string, { responses?: Record<string, { content?: unknown }> }>
    >;

    for (const [routePath, pathItem] of Object.entries(documentedPaths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (status === "204" || method === "head") {
            expect(
              response.content,
              `${method.toUpperCase()} ${routePath} ${status} should not document a response body`,
            ).toBeUndefined();
          }
        }
      }
    }
  });

  test("uses valid local component references", () => {
    for (const ref of collectRefs(openApiDocument)) {
      expect(ref.startsWith("#/"), `${ref} should be a local OpenAPI reference`).toBe(true);
      expect(resolveJsonPointer(openApiDocument, ref), `${ref} should resolve`).toBeDefined();
    }
  });
});
