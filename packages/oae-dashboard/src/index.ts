import { serve } from "bun";
import { autoFixSpec, type Spec, validateSpec } from "@json-render/core";
import {
  catalog,
  catalogVersion,
  getCatalogManifest,
  getCatalogPrompt,
  supportedChartTypes,
} from "./dashboard/catalog";
import index from "./index.html";

const catalogETag = `"${catalogVersion}"`;
const catalogPromptPayload = {
  catalogVersion,
  prompt: getCatalogPrompt(),
  supportedChartTypes,
  constraints: {
    maxChartsPerView: 12,
    preferDiverseChartFamilies: true,
  },
};
const catalogManifestPayload = getCatalogManifest();

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

function versionHeaders() {
  return {
    ETag: catalogETag,
    "x-catalog-version": catalogVersion,
    "cache-control": "public, max-age=0, must-revalidate",
  };
}

function versionedJson(req: Request, payload: unknown) {
  if (req.headers.get("if-none-match") === catalogETag) {
    return new Response(null, {
      status: 304,
      headers: versionHeaders(),
    });
  }

  return Response.json(payload, {
    headers: versionHeaders(),
  });
}

async function readSpec(req: Request): Promise<Spec | null> {
  const body = (await req.json().catch(() => null)) as { spec?: unknown } | null;
  if (!body || typeof body !== "object" || !body.spec || typeof body.spec !== "object") {
    return null;
  }
  return body.spec as Spec;
}

function collectSchemaErrors(spec: Spec) {
  const result = catalog.validate(spec);
  if (result.success || !result.error) {
    return [] as Array<{ path: string; message: string }>;
  }

  return result.error.issues.map(issue => {
    const path = issue.path.length ? `/${issue.path.join("/")}` : "/";
    return { path, message: issue.message };
  });
}

function collectStructureErrors(spec: Spec) {
  const result = validateSpec(spec, { checkOrphans: true });
  return result.issues
    .filter(issue => issue.severity === "error")
    .map(issue => ({
      path: issue.elementKey ? `/elements/${issue.elementKey}` : "/",
      message: issue.message,
    }));
}

export function createDashboardServer(options?: { port?: number; development?: boolean }) {
  const development =
    options?.development === undefined
      ? process.env.NODE_ENV !== "production"
        ? {
            hmr: true,
            console: true,
          }
        : false
      : options.development
        ? {
            hmr: true,
            console: true,
          }
        : false;

  return serve({
    port: options?.port,
    routes: {
      "/api/v1/dashboard/catalog-prompt": {
        GET(req) {
          return versionedJson(req, catalogPromptPayload);
        },
      },

      "/api/v1/dashboard/catalog-manifest": {
        GET(req) {
          return versionedJson(req, catalogManifestPayload);
        },
      },

      "/api/v1/dashboard/spec/validate": {
        async POST(req) {
          const spec = await readSpec(req);
          if (!spec) {
            return badRequest("Invalid request body. Expected { spec: object }.");
          }

          const errors = [...collectSchemaErrors(spec), ...collectStructureErrors(spec)];
          return Response.json({
            valid: errors.length === 0,
            errors,
          });
        },
      },

      "/api/v1/dashboard/spec/autofix": {
        async POST(req) {
          const spec = await readSpec(req);
          if (!spec) {
            return badRequest("Invalid request body. Expected { spec: object }.");
          }

          const { spec: fixedSpec, fixes } = autoFixSpec(spec);
          return Response.json({
            fixed: fixes.length > 0,
            spec: fixedSpec,
            changes: fixes,
          });
        },
      },

      "/api/hello": {
        async GET(req) {
          return Response.json({
            message: "Hello, world!",
            method: "GET",
          });
        },
        async PUT(req) {
          return Response.json({
            message: "Hello, world!",
            method: "PUT",
          });
        },
      },

      "/api/hello/:name": async req => {
        const name = req.params.name;
        return Response.json({
          message: `Hello, ${name}!`,
        });
      },

      "/*": index,
    },
    development,
  });
}

if (import.meta.main) {
  const server = createDashboardServer();
  console.log(`🚀 Server running at ${server.url}`);
}
