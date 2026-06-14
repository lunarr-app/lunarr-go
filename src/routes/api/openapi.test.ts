import { describe, expect, test } from "bun:test";
import { GET as jsonGet } from "./openapi.json/+server";
import { GET as yamlGet } from "./openapi.yaml/+server";

describe("OpenAPI routes", () => {
  test("serves JSON OpenAPI", async () => {
    const response = await jsonGet({} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      openapi: "3.1.0",
      info: { title: "Lunarr API" },
    });
  });

  test("serves YAML OpenAPI", async () => {
    const response = await yamlGet({} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/yaml");
    expect(await response.text()).toContain('title: "Lunarr API"');
  });
});
