import { describe, expect, test } from "bun:test";
import { openApiDocument, openApiYaml } from "./openapi";

describe("OpenAPI document", () => {
  test("describes the mobile-facing API contract", () => {
    expect(openApiDocument.openapi).toBe("3.1.0");
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
});
