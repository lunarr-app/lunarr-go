import { describe, expect, test } from "bun:test";
import { openApiDocument } from "$lib/server/openapi";
import { OPENAPI_TYPED_SCHEMAS } from "./types";

describe("API OpenAPI contract", () => {
  test("declares strongly typed schemas for the shared API contract", () => {
    const schemas = (openApiDocument.components as { schemas: Record<string, unknown> }).schemas;

    for (const schemaName of OPENAPI_TYPED_SCHEMAS) {
      expect(schemas, `${schemaName} is missing from OpenAPI components.schemas`).toHaveProperty(schemaName);
    }
  });
});
