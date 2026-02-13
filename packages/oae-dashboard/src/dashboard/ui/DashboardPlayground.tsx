import type { Spec } from "@json-render/core";
import { JSONUIProvider, Renderer } from "@json-render/react";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { registry } from "../registry";
import { m1Spec, sampleDatasets } from "../sample-spec";
import type { DashboardRow } from "../types";

type JsonRecord = Record<string, unknown>;

interface CatalogPromptResponse {
  catalogVersion: string;
  prompt: string;
}

interface ValidateResponse {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

interface AutofixResponse {
  fixed: boolean;
  spec: Spec;
  changes: string[];
}

const defaultIntent =
  "Build a dashboard with trend, composition, hierarchy, and flow charts for this dataset.";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSpecLike(value: unknown): value is Spec {
  return isRecord(value) && "root" in value && "elements" in value;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unexpected error.";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseSpec(text: string): Spec {
  const parsed = JSON.parse(text) as unknown;
  if (!isSpecLike(parsed)) {
    throw new Error("Spec must include root and elements.");
  }
  return parsed;
}

function parseDatasets(text: string): Record<string, DashboardRow[]> {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Datasets must be a JSON object.");
  }

  const datasets: Record<string, DashboardRow[]> = {};
  for (const [id, rows] of Object.entries(parsed)) {
    if (!Array.isArray(rows)) {
      throw new Error(`Dataset \"${id}\" must be an array.`);
    }
    datasets[id] = rows as DashboardRow[];
  }

  return datasets;
}

function withDatasets(spec: Spec, datasets: Record<string, DashboardRow[]>): Spec {
  const nextSpec = structuredClone(spec) as Spec;
  if (typeof nextSpec.root !== "string") {
    throw new Error("Spec root must reference a root element key.");
  }
  if (!isRecord(nextSpec.elements)) {
    throw new Error("Spec elements must be a map.");
  }

  const rootElement = nextSpec.elements[nextSpec.root];
  if (!isRecord(rootElement)) {
    throw new Error("Root element is missing.");
  }

  const props = isRecord(rootElement.props) ? rootElement.props : {};
  rootElement.props = { ...props, datasets };
  return nextSpec;
}

class RenderErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { message: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo) {}

  override render() {
    if (this.state.message) {
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Render failed: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function DashboardPlayground() {
  const [specText, setSpecText] = useState(() => formatJson(m1Spec));
  const [datasetsText, setDatasetsText] = useState(() => formatJson(sampleDatasets));
  const [intent, setIntent] = useState(defaultIntent);
  const [renderSpec, setRenderSpec] = useState<Spec>(m1Spec);
  const [renderKey, setRenderKey] = useState(0);
  const [catalogPrompt, setCatalogPrompt] = useState("");
  const [catalogVersion, setCatalogVersion] = useState("-");
  const [validateResult, setValidateResult] = useState<ValidateResponse | null>(null);
  const [autofixChanges, setAutofixChanges] = useState<string[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState<"validate" | "autofix" | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);

  const applyRenderSpec = useCallback((nextSpec: Spec) => {
    setRenderSpec(nextSpec);
    setRenderKey(prev => prev + 1);
  }, []);

  const requestJson = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      if (isRecord(payload) && typeof payload.error === "string") {
        throw new Error(payload.error);
      }
      throw new Error(`Request failed (${response.status}).`);
    }

    return payload as T;
  }, []);

  const loadCatalogPrompt = useCallback(async () => {
    setPromptLoading(true);
    try {
      const payload = await requestJson<CatalogPromptResponse>("/api/v1/dashboard/catalog-prompt");
      setCatalogPrompt(payload.prompt);
      setCatalogVersion(payload.catalogVersion);
      setMessage(null);
    } catch (error) {
      setMessage({ text: toErrorMessage(error), error: true });
    } finally {
      setPromptLoading(false);
    }
  }, [requestJson]);

  useEffect(() => {
    void loadCatalogPrompt();
  }, [loadCatalogPrompt]);

  const promptPreview = useMemo(() => {
    const intentText = intent.trim();
    if (!catalogPrompt) {
      return "";
    }
    if (!intentText) {
      return catalogPrompt;
    }
    return `${catalogPrompt}\n\nUser intent:\n${intentText}`;
  }, [catalogPrompt, intent]);

  const providerState = useMemo(() => {
    return isRecord(renderSpec.state) ? renderSpec.state : undefined;
  }, [renderSpec]);

  const handleApplyDatasets = useCallback(() => {
    try {
      const datasets = parseDatasets(datasetsText);
      const spec = parseSpec(specText);
      const nextSpec = withDatasets(spec, datasets);
      setSpecText(formatJson(nextSpec));
      setMessage({ text: "Datasets merged into spec. Run validate to render.", error: false });
    } catch (error) {
      setMessage({ text: toErrorMessage(error), error: true });
    }
  }, [datasetsText, specText]);

  const handleValidate = useCallback(async () => {
    try {
      const spec = parseSpec(specText);
      setActionLoading("validate");
      const result = await requestJson<ValidateResponse>("/api/v1/dashboard/spec/validate", { spec });
      setValidateResult(result);
      if (result.valid) {
        applyRenderSpec(spec);
        setMessage({ text: "Validate passed. Canvas updated.", error: false });
      } else {
        setMessage({ text: `Validate failed with ${result.errors.length} issue(s).`, error: true });
      }
    } catch (error) {
      setMessage({ text: toErrorMessage(error), error: true });
    } finally {
      setActionLoading(null);
    }
  }, [applyRenderSpec, requestJson, specText]);

  const handleAutofix = useCallback(async () => {
    try {
      const spec = parseSpec(specText);
      setActionLoading("autofix");

      const fixed = await requestJson<AutofixResponse>("/api/v1/dashboard/spec/autofix", {
        spec,
      });

      const nextSpec = fixed.spec;
      setSpecText(formatJson(nextSpec));
      setAutofixChanges(fixed.changes);

      const validation = await requestJson<ValidateResponse>("/api/v1/dashboard/spec/validate", {
        spec: nextSpec,
      });

      setValidateResult(validation);
      if (validation.valid) {
        applyRenderSpec(nextSpec);
        setMessage({
          text: fixed.fixed
            ? `Autofix applied ${fixed.changes.length} change(s) and rendered.`
            : "No autofix changes needed. Spec remains valid.",
          error: false,
        });
      } else {
        setMessage({ text: "Autofix finished, but spec is still invalid.", error: true });
      }
    } catch (error) {
      setMessage({ text: toErrorMessage(error), error: true });
    } finally {
      setActionLoading(null);
    }
  }, [applyRenderSpec, requestJson, specText]);

  const handleReset = useCallback(() => {
    setSpecText(formatJson(m1Spec));
    setDatasetsText(formatJson(sampleDatasets));
    setIntent(defaultIntent);
    setValidateResult(null);
    setAutofixChanges([]);
    applyRenderSpec(m1Spec);
    setMessage({ text: "Reset to baseline sample.", error: false });
  }, [applyRenderSpec]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-background to-slate-100 p-4 md:p-6">
      <div className="mx-auto grid max-w-[1800px] gap-4 xl:grid-cols-[340px_minmax(0,1fr)_420px]">
        <section className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-foreground">Data + Intent</h2>
            <button
              type="button"
              onClick={() => void loadCatalogPrompt()}
              disabled={promptLoading}
              className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {promptLoading ? "Loading..." : "Refresh Prompt"}
            </button>
          </div>

          <p className="mb-2 text-xs text-muted-foreground">Dataset JSON</p>
          <textarea
            value={datasetsText}
            onChange={event => setDatasetsText(event.target.value)}
            className="h-48 w-full rounded-lg border border-border/70 bg-muted/20 p-3 font-mono text-xs outline-none ring-ring transition focus:ring-2"
            spellCheck={false}
          />

          <button
            type="button"
            onClick={handleApplyDatasets}
            className="mt-2 w-full rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background transition hover:opacity-90"
          >
            Apply Datasets To Spec
          </button>

          <p className="mb-2 mt-4 text-xs text-muted-foreground">Business intent</p>
          <textarea
            value={intent}
            onChange={event => setIntent(event.target.value)}
            className="h-24 w-full rounded-lg border border-border/70 bg-muted/20 p-3 text-xs outline-none ring-ring transition focus:ring-2"
            spellCheck={false}
          />

          <div className="mt-4 rounded-lg border border-border/70 bg-muted/15 p-3">
            <p className="text-xs text-muted-foreground">Catalog version: {catalogVersion}</p>
            <p className="mt-2 text-xs text-muted-foreground">Agent prompt preview</p>
            <textarea
              value={promptPreview}
              readOnly
              className="mt-2 h-40 w-full rounded-lg border border-border/70 bg-background/70 p-3 font-mono text-[11px] outline-none"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">Renderer Canvas</h2>

          <div className="rounded-xl border border-border/60 bg-gradient-to-b from-background to-muted/25 p-4">
            <RenderErrorBoundary key={renderKey}>
              <JSONUIProvider registry={registry} initialState={providerState}>
                <Renderer spec={renderSpec} registry={registry} />
              </JSONUIProvider>
            </RenderErrorBoundary>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Validate before render; autofix can patch common schema and structure issues.
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-background/90 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">Spec + Debug</h2>

          <textarea
            value={specText}
            onChange={event => setSpecText(event.target.value)}
            className="h-[360px] w-full rounded-lg border border-border/70 bg-muted/20 p-3 font-mono text-xs outline-none ring-ring transition focus:ring-2"
            spellCheck={false}
          />

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => void handleValidate()}
              disabled={actionLoading !== null}
              className="rounded-md border border-border bg-background px-2 py-2 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading === "validate" ? "Validating..." : "Validate"}
            </button>
            <button
              type="button"
              onClick={() => void handleAutofix()}
              disabled={actionLoading !== null}
              className="rounded-md border border-border bg-background px-2 py-2 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLoading === "autofix" ? "Fixing..." : "Autofix"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={actionLoading !== null}
              className="rounded-md border border-border bg-background px-2 py-2 text-xs font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reset
            </button>
          </div>

          {message ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                message.error
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-emerald-400/40 bg-emerald-500/10 text-emerald-700"
              }`}
              aria-live="polite"
            >
              {message.text}
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-border/70 bg-muted/15 p-3">
            <p className="text-xs font-medium text-foreground">Validate result</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {validateResult
                ? validateResult.valid
                  ? "valid=true"
                  : `valid=false, errors=${validateResult.errors.length}`
                : "No validation run yet."}
            </p>
            {!validateResult?.valid && validateResult ? (
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-[11px] text-destructive">
                {validateResult.errors.map(issue => (
                  <li key={`${issue.path}:${issue.message}`}>
                    {issue.path} - {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="mt-3 rounded-lg border border-border/70 bg-muted/15 p-3">
            <p className="text-xs font-medium text-foreground">Autofix changes</p>
            {autofixChanges.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">No autofix changes yet.</p>
            ) : (
              <ul className="mt-2 max-h-32 space-y-1 overflow-auto font-mono text-[11px] text-muted-foreground">
                {autofixChanges.map(change => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
