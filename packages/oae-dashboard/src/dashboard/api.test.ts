import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Spec } from "@json-render/core";
import { createDashboardServer } from "../index";
import { catalogVersion } from "./catalog";
import { m1Spec } from "./sample-spec";

interface ValidatePayload {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

interface AutofixPayload {
  fixed: boolean;
  spec: Spec;
  changes: string[];
}

let server: ReturnType<typeof createDashboardServer> | null = null;

function postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  if (!server) {
    throw new Error("Server not initialized.");
  }
  return fetch(new URL(path, server.url), init);
}

describe("dashboard M3 api loop", () => {
  beforeAll(() => {
    server = createDashboardServer({ port: 0, development: false });
  });

  afterAll(() => {
    if (server) {
      server.stop(true);
      server = null;
    }
  });

  test("catalog prompt is versioned and supports etag", async () => {
    const first = await request("/api/v1/dashboard/catalog-prompt");
    expect(first.status).toBe(200);
    expect(first.headers.get("x-catalog-version")).toBe(catalogVersion);

    const firstBody = (await first.json()) as {
      catalogVersion: string;
      prompt: string;
      supportedChartTypes: string[];
    };

    expect(firstBody.catalogVersion).toBe(catalogVersion);
    expect(firstBody.prompt.length).toBeGreaterThan(0);
    expect(firstBody.supportedChartTypes.length).toBe(12);

    const etag = first.headers.get("etag");
    expect(etag).not.toBeNull();

    const second = await request("/api/v1/dashboard/catalog-prompt", {
      headers: { "if-none-match": etag ?? "" },
    });
    expect(second.status).toBe(304);
  });

  test("validate accepts baseline spec", async () => {
    const response = await request("/api/v1/dashboard/spec/validate", postJson({ spec: m1Spec }));
    expect(response.status).toBe(200);

    const payload = (await response.json()) as ValidatePayload;
    expect(payload.valid).toBe(true);
    expect(payload.errors.length).toBe(0);
  });

  test("validate rejects structure-invalid spec", async () => {
    const invalidSpec: Spec = {
      root: "root",
      elements: {
        root: {
          type: "DashboardShell",
          props: {
            title: "Invalid",
            datasets: {
              sales: [{ month: "Jan", revenue: 1 }],
            },
          },
          children: ["ghost"],
        },
      },
    };

    const response = await request("/api/v1/dashboard/spec/validate", postJson({ spec: invalidSpec }));
    expect(response.status).toBe(200);

    const payload = (await response.json()) as ValidatePayload;
    expect(payload.valid).toBe(false);
    expect(payload.errors.length).toBeGreaterThan(0);
  });

  test("autofix endpoint returns fixed payload shape", async () => {
    const response = await request("/api/v1/dashboard/spec/autofix", postJson({ spec: m1Spec }));
    expect(response.status).toBe(200);

    const payload = (await response.json()) as AutofixPayload;
    expect(typeof payload.fixed).toBe("boolean");
    expect(Array.isArray(payload.changes)).toBe(true);
    expect(payload.spec).toBeDefined();
  });

  test("validate rejects malformed body", async () => {
    const response = await request("/api/v1/dashboard/spec/validate", postJson({ foo: "bar" }));
    expect(response.status).toBe(400);
  });
});
