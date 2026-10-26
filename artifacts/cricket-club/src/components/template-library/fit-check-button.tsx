/**
 * Run a template's fit check here in the browser and show its report (L2-B,
 * T2.10): the template proofs sheet's way to see what the server's fit job
 * and the CI bundle check would say, with the same routine and the same
 * worst-case content. Key it by template, so another template starts afresh.
 */
import { useEffect, useRef, useState } from "react";
import { fitReportSummary, type TemplateFitReport } from "@workspace/scorecard/kind-templates";
import { createFitMount } from "@/lib/pack-render/fit-mount";
import { runTemplateFit } from "@/lib/pack-render/template-fit";

type State =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; report: TemplateFitReport }
  | { status: "error"; message: string };

export function FitCheckButton({ document, kind }: { document: unknown; kind: string }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [open, setOpen] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = async () => {
    setState({ status: "running", done: 0, total: 0 });
    const fit = createFitMount();
    try {
      const report = await runTemplateFit(document, kind, fit.mount, {
        fonts: "browser",
        onVariant: (done, total) => {
          if (alive.current) setState({ status: "running", done, total });
        },
      });
      if (alive.current) setState({ status: "done", report });
    } catch (err) {
      if (alive.current)
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      fit.dispose();
    }
  };

  return (
    <div className="text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:opacity-50"
          onClick={() => void run()}
          disabled={state.status === "running"}
        >
          {state.status === "done" ? "Check fit again" : "Check fit"}
        </button>
        {state.status === "running" && (
          <span className="text-muted-foreground" role="status">
            Checking{state.total ? ` ${state.done} of ${state.total} variants` : ""}…
          </span>
        )}
        {state.status === "error" && (
          <span className="text-destructive" role="alert">
            The fit check didn&apos;t run: {state.message}
          </span>
        )}
        {state.status === "done" && (
          <>
            <span
              className={
                state.report.status === "pass"
                  ? "rounded bg-emerald-100 px-1.5 text-emerald-900"
                  : "rounded bg-amber-100 px-1.5 text-amber-900"
              }
            >
              {fitReportSummary(state.report)}
            </span>
            {state.report.issues.length > 0 && (
              <button
                type="button"
                className="underline"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {open ? "Hide" : "Show"} what doesn&apos;t fit
              </button>
            )}
          </>
        )}
      </div>
      {state.status === "done" && open && (
        <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-muted-foreground">
          {state.report.issues.map((issue, i) => (
            <li key={i}>
              <code>{issue.variant}</code> {issue.reason}
              {issue.layerId ? ` · layer ${issue.layerId}` : ""}
              {issue.field ? ` · ${issue.field}` : ""}
              {issue.detail ? ` · ${issue.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
