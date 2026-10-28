import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getListConsoleLibraryLooksQueryKey,
  getListConsoleLibraryTemplatesQueryKey,
  getListLibraryTemplateReportsQueryKey,
  useDismissLibraryTemplateReports,
  useCreateConsoleLibraryLook,
  useCreateConsoleLibraryTemplate,
  useDuplicateConsoleLibraryTemplate,
  useListConsoleLibraryLooks,
  useListConsoleLibraryTemplate,
  useListConsoleLibraryTemplates,
  useListLibraryTemplateReports,
  useUnlistConsoleLibraryTemplate,
  type ConsoleLibraryTemplate,
  type ListConsoleLibraryTemplatesParams,
} from "@workspace/api-client-react";
import { TEMPLATE_CARD_KINDS, placeholderDocument } from "@workspace/scorecard/kind-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusPillTone } from "@/components/ui/stat-badge";
import { kindLabel } from "@/lib/social-studio";
import { FigmaImportCard } from "./figma-import-card";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const inputClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const editHref = (id: number) => `/platform-admin/library/${id}/edit`;

const ORIGIN_LABEL: Record<ConsoleLibraryTemplate["origin"], string> = {
  bundle: "Bundle",
  console: "Console",
  club: "Club",
};

const FIT: Record<string, { label: string; tone: StatusPillTone }> = {
  pass: { label: "Fit passed", tone: "live" },
  fail: { label: "Fit failed", tone: "danger" },
  pending: { label: "Checking", tone: "pilot" },
};

/** The fit pill: a pass recorded while no fit job ran says so. */
function fitPill(t: ConsoleLibraryTemplate) {
  const skipped = (t.fitReport as { skipped?: boolean } | null)?.skipped === true;
  const f = skipped ? { label: "Not checked", tone: "neutral" as const } : FIT[t.fitStatus];
  return f ? <StatusPill tone={f.tone}>{f.label}</StatusPill> : null;
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-AU");

/** A template's reports from clubs, open first (release 2, R2-C). */
function Reports({ id }: { id: number }) {
  const q = useListLibraryTemplateReports(id, {
    query: { queryKey: getListLibraryTemplateReportsQueryKey(id) },
  });
  if (q.isLoading) return <p className="text-xs text-muted-foreground">Loading reports…</p>;
  const reports = q.data ?? [];
  if (reports.length === 0) return <p className="text-xs text-muted-foreground">No reports.</p>;
  return (
    <ul className="space-y-1 text-xs" aria-label="Reports">
      {reports.map((r) => (
        <li key={r.id} className={r.resolvedAt ? "text-muted-foreground" : undefined}>
          <span className="font-semibold">{r.clubName}</span> ({dateOf(r.createdAt)}
          {r.resolvedAt ? `, resolved ${dateOf(r.resolvedAt)}` : ""}): {r.reason}
        </li>
      ))}
    </ul>
  );
}

/** What a failed request says, from its body. */
const errorOf = (err: unknown, fallback: string): string => {
  const data = (err as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : fallback;
};

/**
 * Console → Library (ADR-011 L7-A): every library template, listed or not.
 * Ovation's designers make console templates here (new, or a duplicate of any
 * template; a bundle template changes only with a deploy, so editing one
 * starts from a duplicate), edit them in editor v2 where each save is a new
 * version, and list them once their layout check has passed at every page,
 * size and preset. Clubs' reports of a template show here (release 2, R2-C):
 * unlisting resolves them, or Ovation keeps it and dismisses them.
 */
export default function LibraryPage() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [filters, setFilters] = useState<ListConsoleLibraryTemplatesParams>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unlisting, setUnlisting] = useState<{ id: number; reason: string } | null>(null);
  const [reportsOf, setReportsOf] = useState<number | null>(null);

  const templatesQ = useListConsoleLibraryTemplates(filters, {
    query: { queryKey: getListConsoleLibraryTemplatesQueryKey(filters) },
  });
  const looksQ = useListConsoleLibraryLooks();
  const looks = looksQ.data?.looks ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getListConsoleLibraryTemplatesQueryKey() });
    if (reportsOf !== null) {
      void qc.invalidateQueries({ queryKey: getListLibraryTemplateReportsQueryKey(reportsOf) });
    }
    void qc.invalidateQueries({ queryKey: getListConsoleLibraryLooksQueryKey() });
  };
  const done = (message: string) => {
    setError(null);
    setNotice(message);
    refresh();
  };
  const failed = (fallback: string) => (err: unknown) => {
    setNotice(null);
    setError(errorOf(err, fallback));
  };

  const duplicate = useDuplicateConsoleLibraryTemplate({
    mutation: {
      onSuccess: (t) => {
        refresh();
        navigate(editHref(t.id));
      },
      onError: failed("Couldn't duplicate the template."),
    },
  });
  const list = useListConsoleLibraryTemplate({
    mutation: {
      onSuccess: (t) => done(`“${t.name}” is listed.`),
      onError: failed("Couldn't list the template."),
    },
  });
  const unlist = useUnlistConsoleLibraryTemplate({
    mutation: {
      onSuccess: (t) => {
        setUnlisting(null);
        done(`“${t.name}” is unlisted. Clubs' copies keep working.`);
      },
      onError: failed("Couldn't unlist the template."),
    },
  });

  const dismiss = useDismissLibraryTemplateReports({
    mutation: {
      onSuccess: () => done("Reports dismissed. The template stays listed."),
      onError: failed("Couldn't dismiss the reports."),
    },
  });

  // New template.
  const [newKind, setNewKind] = useState<string>(TEMPLATE_CARD_KINDS[0]);
  const [newName, setNewName] = useState("");
  const [newLook, setNewLook] = useState("");
  const create = useCreateConsoleLibraryTemplate({
    mutation: {
      onSuccess: (t) => {
        refresh();
        navigate(editHref(t.id));
      },
      onError: failed("Couldn't create the template."),
    },
  });

  // New look.
  const [lookSlug, setLookSlug] = useState("");
  const [lookName, setLookName] = useState("");
  const createLook = useCreateConsoleLibraryLook({
    mutation: {
      onSuccess: (l) => {
        setLookSlug("");
        setLookName("");
        done(`The look “${l.name}” is ready to file templates under.`);
      },
      onError: failed("Couldn't create the look."),
    },
  });

  const setFilter = (key: keyof ListConsoleLibraryTemplatesParams, value: string) =>
    setFilters((f) => {
      const next = { ...f } as Record<string, unknown>;
      if (value === "") delete next[key];
      else next[key] = key === "listed" || key === "reported" ? value === "true" : value;
      return next as ListConsoleLibraryTemplatesParams;
    });

  const templates = templatesQ.data?.templates ?? [];

  return (
    <div>
      <h1 className="mb-2 text-[clamp(38px,4.6vw,64px)] leading-none">Template library</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Every template clubs can pick from, and those they can&rsquo;t yet. A template is listed
        once its current version passes the layout check at every page, size and preset. Bundle
        templates change with a deploy, so editing one starts from a duplicate.
      </p>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              <select
                aria-label="Card kind"
                className={selectClass}
                value={filters.kind ?? ""}
                onChange={(e) => setFilter("kind", e.target.value)}
              >
                <option value="">Every kind</option>
                {TEMPLATE_CARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Origin"
                className={selectClass}
                value={filters.origin ?? ""}
                onChange={(e) => setFilter("origin", e.target.value)}
              >
                <option value="">Every origin</option>
                <option value="bundle">Bundle</option>
                <option value="console">Console</option>
                <option value="club">Club</option>
              </select>
              <select
                aria-label="Listing"
                className={selectClass}
                value={filters.listed === undefined ? "" : String(filters.listed)}
                onChange={(e) => setFilter("listed", e.target.value)}
              >
                <option value="">Listed or not</option>
                <option value="true">Listed</option>
                <option value="false">Unlisted</option>
              </select>
              <select
                aria-label="Reports"
                className={selectClass}
                value={filters.reported ? "true" : ""}
                onChange={(e) => setFilter("reported", e.target.value)}
              >
                <option value="">Reported or not</option>
                <option value="true">With open reports</option>
              </select>
            </div>

            {templatesQ.isLoading ? (
              <div className="flex items-center py-4 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : templatesQ.isError ? (
              <p className="text-sm text-destructive">Couldn&rsquo;t load the library.</p>
            ) : templates.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No templates match.</p>
            ) : (
              <ul className="divide-y text-sm" data-testid="library-templates">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        <StatusPill tone={t.listed ? "live" : "neutral"}>
                          {t.listed ? "Listed" : "Unlisted"}
                        </StatusPill>
                        {fitPill(t)}
                        {t.openReports > 0 && (
                          <StatusPill tone="danger">
                            {t.openReports} open {t.openReports === 1 ? "report" : "reports"}
                          </StatusPill>
                        )}
                        {!t.listed && t.unlistedBy === "author" && (
                          <StatusPill tone="neutral">Unlisted by its club</StatusPill>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {kindLabel(t.kind)} · {ORIGIN_LABEL[t.origin]}
                        {t.origin === "club" ? ` (${t.authorName})` : ""}
                        {t.look ? ` · ${t.look.name}` : ""} · v{t.version}
                        {t.unlistReason ? ` · Unlisted: ${t.unlistReason}` : ""}
                      </p>
                      {reportsOf === t.id && (
                        <div className="mt-2">
                          <Reports id={t.id} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.origin === "club" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={reportsOf === t.id}
                          onClick={() => setReportsOf((v) => (v === t.id ? null : t.id))}
                        >
                          {reportsOf === t.id ? "Hide reports" : "Reports"}
                        </Button>
                      )}
                      {t.openReports > 0 && t.listed && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={dismiss.isPending}
                          onClick={() => dismiss.mutate({ id: t.id })}
                        >
                          Keep it, dismiss reports
                        </Button>
                      )}
                      {t.readOnly ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={duplicate.isPending}
                          onClick={() => duplicate.mutate({ id: t.id, data: {} })}
                        >
                          Duplicate to edit
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={editHref(t.id)} aria-label={`Edit ${t.name}`}>
                              Edit
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={duplicate.isPending}
                            onClick={() => duplicate.mutate({ id: t.id, data: {} })}
                          >
                            Duplicate
                          </Button>
                        </>
                      )}
                      {t.listed ? (
                        unlisting?.id === t.id ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <input
                              aria-label="Reason for unlisting"
                              placeholder="Reason (optional)"
                              className={inputClass}
                              maxLength={300}
                              value={unlisting.reason}
                              onChange={(e) => setUnlisting({ id: t.id, reason: e.target.value })}
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={unlist.isPending}
                              onClick={() =>
                                unlist.mutate({
                                  id: t.id,
                                  data: { reason: unlisting.reason.trim() || null },
                                })
                              }
                            >
                              Unlist
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setUnlisting(null)}>
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setUnlisting({ id: t.id, reason: "" })}
                          >
                            Unlist…
                          </Button>
                        )
                      ) : t.unlistedBy === "author" ? null : (
                        <Button
                          size="sm"
                          disabled={list.isPending}
                          onClick={() => list.mutate({ id: t.id })}
                        >
                          List
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <FigmaImportCard looks={looks} onImported={refresh} editHref={editHref} />

        <Card>
          <CardHeader>
            <CardTitle>New template</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate({
                  data: {
                    kind: newKind,
                    name: newName.trim(),
                    lookId: newLook ? Number(newLook) : null,
                    document: placeholderDocument(newKind) as unknown as Record<string, unknown>,
                  },
                });
              }}
            >
              <select
                aria-label="New template's kind"
                className={selectClass}
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
              >
                {TEMPLATE_CARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
              <input
                aria-label="New template's name"
                placeholder="Name"
                className={inputClass}
                maxLength={80}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <select
                aria-label="New template's look"
                className={selectClass}
                value={newLook}
                onChange={(e) => setNewLook(e.target.value)}
              >
                <option value="">No look</option>
                {looks.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={!newName.trim() || create.isPending}>
                Create and edit
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              It starts from the kind&rsquo;s plain layout, unlisted.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Looks</CardTitle>
          </CardHeader>
          <CardContent>
            {looks.length > 0 && (
              <ul className="mb-4 divide-y text-sm" data-testid="library-looks">
                {looks.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-medium">{l.name}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {l.slug} · {ORIGIN_LABEL[l.origin]}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {l.templates} {l.templates === 1 ? "template" : "templates"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                createLook.mutate({ data: { slug: lookSlug.trim(), name: lookName.trim() } });
              }}
            >
              <input
                aria-label="New look's name"
                placeholder="Name"
                className={inputClass}
                maxLength={80}
                value={lookName}
                onChange={(e) => setLookName(e.target.value)}
              />
              <input
                aria-label="New look's slug"
                placeholder="slug-like-this"
                className={inputClass}
                maxLength={60}
                value={lookSlug}
                onChange={(e) => setLookSlug(e.target.value.toLowerCase())}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!lookSlug.trim() || !lookName.trim() || createLook.isPending}
              >
                Add look
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
