import type { FigmaReportLine } from "@workspace/api-client-react";

/** A failed Figma import: the server's message, the format's problems and the mapping report. */
export const figmaImportError = (
  err: unknown,
): { message: string; problems: string[]; report: FigmaReportLine[] } => {
  const data = (err as { data?: { error?: unknown; problems?: unknown; report?: unknown } } | null)
    ?.data;
  return {
    message: typeof data?.error === "string" ? data.error : "The import failed. Try again.",
    problems: Array.isArray(data?.problems) ? (data.problems as string[]) : [],
    report: Array.isArray(data?.report) ? (data.report as FigmaReportLine[]) : [],
  };
};

const where = (l: FigmaReportLine) =>
  [l.page, l.sizes?.join(", "), l.layer].filter(Boolean).join(" · ");

/** What a Figma import changed or left out, line by line. */
export function FigmaReport({ lines }: { lines: readonly FigmaReportLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto text-xs" aria-label="Import report">
      {lines.map((l, i) => (
        <li key={i} className={l.level === "warn" ? "text-destructive" : "text-muted-foreground"}>
          {where(l) ? <span className="font-medium">{where(l)}: </span> : null}
          {l.message}
        </li>
      ))}
    </ul>
  );
}
