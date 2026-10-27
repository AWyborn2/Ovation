/**
 * Publish a club template to every club (template library release 2, ADR-012,
 * TB.6). The dialog shows what other clubs will see (the server's
 * `publishableDocument` result, drawn for another club), the text that still
 * names the club or a sponsor (each flag selects its layer in the editor), the
 * style tags the design can carry, and the rights confirmation. After
 * publishing it follows the fit check: checking, listed, or failed with the
 * report. A pass lists the template; nobody approves it.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetClubTemplatePublishPreviewQueryKey,
  publishClubTemplate,
  useGetClubTemplatePublishPreview,
  type LibraryTemplate,
  type PublishBlocked,
  type PublishFlag,
  type TemplateStyleTag,
} from "@workspace/api-client-react";
import { fitReportSummary, type TemplateFitReport } from "@workspace/scorecard/kind-templates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingState, QueryError } from "@/components/data-states";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { buildPackData } from "@/lib/pack-card-data";
import { sampleCardInput } from "@/lib/sample-card-inputs";
import type { ShareCardInput } from "@/lib/share-card";
import { TemplateThumb } from "./previews";

/** The most style tags one template carries (`MAX_TEMPLATE_TAGS` on the server). */
export const MAX_TAGS = 4;

export const TAG_LABELS: Record<TemplateStyleTag, string> = {
  "photo-led": "Photo-led",
  "bold-type": "Bold type",
  minimal: "Minimal",
  dark: "Dark",
  light: "Light",
  retro: "Retro",
  broadcast: "Broadcast",
  textured: "Textured",
};

/** Another club, so the preview shows the slots filled by someone else's name and colours. */
const OTHER_CLUB = "Another Cricket Club";

const FLAG_LABELS: Record<PublishFlag["kind"], string> = {
  clubName: "names your club",
  sponsorName: "names a sponsor",
};

/** Where the library template stands, in a line. */
export function publishStatusLine(t: LibraryTemplate | null): {
  text: string;
  tone: "wait" | "ok" | "bad" | "off";
} | null {
  if (!t) return null;
  if (t.fitStatus === "pending") {
    return { text: `Version ${t.version}: checking the layout…`, tone: "wait" };
  }
  if (t.fitStatus === "fail") {
    return {
      text: `Version ${t.version} didn't pass the layout check, so other clubs can't see it.`,
      tone: "bad",
    };
  }
  if (t.listed) {
    const used = t.usedBy ?? 0;
    return {
      text: `Version ${t.version} is in the library${used > 0 ? ` · used by ${used} ${used === 1 ? "club" : "clubs"}` : ""}.`,
      tone: "ok",
    };
  }
  return { text: `Version ${t.version} is unlisted. Publish again to list it.`, tone: "off" };
}

const toneCls = {
  wait: "bg-amber-100 text-amber-900",
  ok: "bg-emerald-100 text-emerald-900",
  bad: "bg-red-100 text-red-900",
  off: "bg-muted text-muted-foreground",
} as const;

export function PublishDialog({
  copyId,
  kind,
  name: initialName,
  dirty,
  open,
  onClose,
  onSelectLayer,
}: {
  copyId: number;
  kind: string;
  name: string;
  /** Unsaved changes in the editor: only the saved design publishes. */
  dirty: boolean;
  open: boolean;
  onClose: () => void;
  /** Select a flagged layer in the editor (and close the dialog). */
  onSelectLayer: (page: string, layerId: string) => void;
}) {
  const qc = useQueryClient();
  const [polling, setPolling] = useState(false);
  const q = useGetClubTemplatePublishPreview(copyId, {
    query: {
      queryKey: getGetClubTemplatePublishPreviewQueryKey(copyId),
      enabled: open,
      refetchInterval: polling ? 2000 : false,
    },
  });
  const published = q.data?.published ?? null;
  const [name, setName] = useState(initialName);
  const [tags, setTags] = useState<TemplateStyleTag[] | null>(null);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<PublishBlocked | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Start from what is already published, once it loads.
  useEffect(() => {
    if (!open) return;
    if (published && tags === null) {
      setTags((published.tags ?? []) as TemplateStyleTag[]);
      setName(published.name);
    }
  }, [open, published, tags]);
  useEffect(() => {
    if (!open) {
      setTags(null);
      setRights(false);
      setError(null);
      setBlocked(null);
      setPolling(false);
      setName(initialName);
    }
  }, [open, initialName]);
  // Follow the fit check until it settles.
  useEffect(() => {
    if (polling && published && published.fitStatus !== "pending") setPolling(false);
  }, [polling, published]);

  const input: ShareCardInput = useMemo(
    () => sampleCardInput(kind as ShareCardInput["kind"], OTHER_CLUB),
    [kind],
  );
  const data = useMemo(
    () =>
      buildPackData({
        brand: { name: OTHER_CLUB, primaryColour: "#2b6cb0", backgroundColour: "#1a202c" },
      }),
    [],
  );

  const chosen = tags ?? [];
  const flags = blocked?.flags ?? q.data?.flags ?? [];
  const assetErrors = blocked?.assetErrors ?? q.data?.assetErrors ?? [];
  const checks = q.data?.tagChecks ?? [];
  const canPublish =
    !dirty &&
    rights &&
    name.trim().length > 0 &&
    flags.length === 0 &&
    assetErrors.length === 0 &&
    !busy;

  const toggle = (tag: TemplateStyleTag) =>
    setTags((now) => {
      const list = now ?? [];
      return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
    });

  const publish = async () => {
    setBusy(true);
    setError(null);
    setBlocked(null);
    try {
      await publishClubTemplate(copyId, { name: name.trim(), tags: chosen, rightsConfirmed: true });
      setRights(false);
      await qc.invalidateQueries({ queryKey: getGetClubTemplatePublishPreviewQueryKey(copyId) });
      await qc.invalidateQueries({ queryKey: ["template-library"] });
      setPolling(true);
    } catch (e) {
      const err = e as { status?: number; data?: unknown };
      if (err.status === 422 && err.data && typeof err.data === "object") {
        setBlocked(err.data as PublishBlocked);
      }
      setError(handleAdminMutationError(e) ?? "Couldn't publish. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const status = publishStatusLine(published);
  const report = (published?.fitReport ?? null) as TemplateFitReport | null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish to the library</DialogTitle>
          <DialogDescription>
            Every club can use it once it passes the layout check. Your logo, photos, sponsors,
            colours and name are swapped for each club&apos;s own.
          </DialogDescription>
        </DialogHeader>
        {q.isError ? (
          <QueryError onRetry={() => q.refetch()} />
        ) : q.isLoading || !q.data ? (
          <LoadingState label="Preparing the preview…" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <figure>
              <TemplateThumb document={q.data.document} kind={kind} input={input} data={data} />
              <figcaption className="mt-1 text-center text-xs text-muted-foreground">
                What other clubs see
              </figcaption>
            </figure>
            <div className="space-y-4 text-sm">
              {status && (
                <div role="status" className={`rounded-md px-2 py-1 ${toneCls[status.tone]}`}>
                  {status.text}
                  {published?.fitStatus === "fail" && report && (
                    <button
                      type="button"
                      className="ml-2 underline"
                      aria-expanded={showReport}
                      onClick={() => setShowReport((v) => !v)}
                    >
                      {showReport ? "Hide" : "Show"} the report
                    </button>
                  )}
                </div>
              )}
              {showReport && report && (
                <div className="rounded-md border border-border p-2 text-xs">
                  <p className="font-medium">{fitReportSummary(report)}</p>
                  <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-muted-foreground">
                    {report.issues.map((issue, i) => (
                      <li key={i}>
                        <code>{issue.variant}</code> {issue.reason}
                        {issue.layerId ? ` · layer ${issue.layerId}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dirty && (
                <p role="alert" className="text-amber-700">
                  Save your changes first: only the saved design is published.
                </p>
              )}
              {flags.length > 0 && (
                <section aria-label="Text to change">
                  <p className="font-medium">Make these a field before publishing</p>
                  <ul className="mt-1 space-y-1">
                    {flags.map((f) => (
                      <li key={`${f.page}:${f.layerId}:${f.text}`}>
                        <button
                          type="button"
                          className="text-left underline"
                          onClick={() => onSelectLayer(f.page, f.layerId)}
                        >
                          &ldquo;{f.text}&rdquo; {FLAG_LABELS[f.kind]}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {assetErrors.length > 0 && (
                <section aria-label="Images the library can't share">
                  <p className="font-medium">The library can&apos;t share these images</p>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {assetErrors.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </section>
              )}
              <label className="flex flex-col gap-1 font-medium">
                Name
                <input
                  className="h-9 rounded-md border border-input bg-background px-2 font-normal"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <fieldset>
                <legend className="font-medium">Style tags (up to {MAX_TAGS})</legend>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {checks.map((c) => {
                    const on = chosen.includes(c.tag);
                    const full = !on && chosen.length >= MAX_TAGS;
                    return (
                      <label
                        key={c.tag}
                        className="flex items-center gap-1.5"
                        title={c.ok ? undefined : (c.reason ?? undefined)}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={(!c.ok && !on) || full}
                          onChange={() => toggle(c.tag)}
                        />
                        {TAG_LABELS[c.tag]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rights}
                  onChange={(e) => setRights(e.target.checked)}
                />
                <span>
                  My club has the rights to every image and font in this design, and is happy for
                  other clubs to use it.
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!canPublish} onClick={publish}>
                  {published ? "Publish a new version" : "Publish"}
                </Button>
                {error && (
                  <span role="alert" className="text-destructive">
                    {error}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
