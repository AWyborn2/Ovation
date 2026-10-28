import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  getGetClubGenerateSettingsQueryKey,
  getGetTemplateDesignerQueryKey,
  useGetClubGenerateSettings,
  useGetTemplateDesigner,
  useSetClubGenerateSettings,
  useStartTemplateGeneration,
  type TemplateGeneration,
} from "@workspace/api-client-react";
import { TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StatusPill, type StatusPillTone } from "@/components/ui/stat-badge";
import { kindLabel } from "@/lib/social-studio";
import { editHref } from "./library";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const MAX_BRIEF = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** How often the list refreshes while a design is being made. */
const POLL_MS = 5000;
/** The quality bar (ADR-011 §8): first-try fits over the first 50 designs. */
const QUALITY_TARGET = 0.7;

export const dollars = (usd: number | null | undefined) =>
  usd === null || usd === undefined ? "—" : `US$${usd.toFixed(2)}`;

const STATUS: Record<TemplateGeneration["status"], { label: string; tone: StatusPillTone }> = {
  queued: { label: "Queued", tone: "pilot" },
  running: { label: "Designing", tone: "pilot" },
  done: { label: "Done", tone: "live" },
  failed: { label: "Failed", tone: "danger" },
};

const OUTCOME: Record<string, string> = {
  pass: "Fits",
  warnings: "Saved with layout warnings",
  invalid: "No valid design",
  provider_error: "Provider error",
  refused: "Declined",
};

const errorOf = (err: unknown, fallback: string): string => {
  const data = (err as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : fallback;
};

const busy = (g: TemplateGeneration) => g.status === "queued" || g.status === "running";

/**
 * Club Generate (ADR-012 R2-D): Ovation's switch, with the quality bar it
 * depends on. Clubs see Generate only when both are met and the key is set.
 */
function ClubGenerateCard() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const q = useGetClubGenerateSettings({
    query: { queryKey: getGetClubGenerateSettingsQueryKey() },
  });
  const save = useSetClubGenerateSettings({
    mutation: {
      onSuccess: (data) => {
        setError(null);
        qc.setQueryData(getGetClubGenerateSettingsQueryKey(), data);
      },
      onError: (err) => setError(errorOf(err, "Couldn't save the setting.")),
    },
  });
  const s = q.data;
  const pct =
    s && s.quality.counted > 0
      ? Math.round((s.quality.firstTryFit / s.quality.counted) * 100)
      : null;
  return (
    <Card data-testid="club-generate">
      <CardHeader>
        <CardTitle>Generate for clubs</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {q.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : q.isError || !s ? (
          <p className="text-destructive">Couldn&rsquo;t load the setting.</p>
        ) : (
          <>
            <label className="flex items-center gap-3 font-medium">
              <Switch
                checked={s.enabled}
                disabled={save.isPending}
                onCheckedChange={(enabled) => save.mutate({ data: { enabled } })}
                aria-label="Offer Generate to clubs"
              />
              Offer Generate to clubs
            </label>
            <dl className="grid gap-1 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Quality bar</dt>
                <dd>
                  {pct === null ? "No designs counted yet" : `${pct}% first-try fit`} (
                  {s.quality.counted} of 50 counted, target {Math.round(QUALITY_TARGET * 100)}%){" "}
                  {s.barMet ? "· met" : "· not met"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cost per design</dt>
                <dd>{dollars(s.quality.meanCostUsd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Clubs see Generate</dt>
                <dd data-testid="club-generate-available">{s.available ? "Yes" : "No"}</dd>
              </div>
            </dl>
            {!s.available ? (
              <p className="text-xs text-muted-foreground">
                {!s.configured
                  ? "Needs ANTHROPIC_API_KEY on this server."
                  : !s.barMet
                    ? "Clubs see it once 50 designs are counted and at least 70% fitted first time."
                    : "Switched off."}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Console → AI designer (ADR-011 L7-B, T7.11, T7.13): a brief, a reference
 * image or both become an unlisted console template, made by Claude and
 * checked by the validator and the layout check (the backend is #438's
 * `template-ai`). Only the brief, the uploaded image and the card kind's
 * fields and invented sample are sent; never a club's data.
 */
export default function AiDesignerPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<string>(TEMPLATE_CARD_KINDS[0]);
  const [brief, setBrief] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const designerQ = useGetTemplateDesigner({
    query: {
      queryKey: getGetTemplateDesignerQueryKey(),
      refetchInterval: (q) => ((q.state.data?.generations ?? []).some(busy) ? POLL_MS : false),
    },
  });
  const startGen = useStartTemplateGeneration({
    mutation: {
      onSuccess: () => {
        setError(null);
        setBrief("");
        setImage(null);
        if (fileRef.current) fileRef.current.value = "";
        void qc.invalidateQueries({ queryKey: getGetTemplateDesignerQueryKey() });
      },
      onError: (err) => setError(errorOf(err, "Couldn't start the design.")),
    },
  });

  const pickImage = (file: File | null) => {
    setError(null);
    if (file && !/^image\/(png|jpeg)$/.test(file.type)) {
      setError("The reference image must be a PNG or a JPEG.");
      setImage(null);
      return;
    }
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("The image is larger than 5 MB.");
      setImage(null);
      return;
    }
    setImage(file);
  };

  const designer = designerQ.data;
  const quality = designer?.quality;
  const generations = designer?.generations ?? [];
  const configured = designer?.configured !== false;
  const canStart =
    configured && (brief.trim().length > 0 || image !== null) && brief.length <= MAX_BRIEF;

  return (
    <div>
      <h1 className="mb-2 text-[clamp(38px,4.6vw,64px)] leading-none">AI designer</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Describe a design, upload a reference image, or both. Claude designs every page of the card
        at all four sizes; the validator and the layout check send its problems back for another
        try. The result is an unlisted template in the{" "}
        <Link href="/platform-admin/library" className="underline">
          template library
        </Link>
        , ready to polish and list. A design takes a few minutes.
      </p>
      {!configured ? (
        <p role="status" className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
          The AI designer isn&rsquo;t set up on this server: it needs ANTHROPIC_API_KEY.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6">
        <ClubGenerateCard />
        <Card>
          <CardHeader>
            <CardTitle>New design</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                startGen.mutate({
                  data: {
                    kind,
                    ...(brief.trim() ? { brief: brief.trim() } : {}),
                    ...(image ? { image } : {}),
                  },
                });
              }}
            >
              <label className="grid gap-1 text-sm font-medium">
                Card kind
                <select
                  className={selectClass}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {TEMPLATE_CARD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Brief
                <textarea
                  className="min-h-[96px] rounded-md border border-input bg-background p-2 text-sm"
                  maxLength={MAX_BRIEF}
                  placeholder="Gold foil numbers on deep navy, a diagonal band behind the name…"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
                <span className="text-xs font-normal text-muted-foreground">
                  {brief.length} / {MAX_BRIEF}
                </span>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Reference image (PNG or JPEG, up to 5 MB)
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="text-sm"
                  onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="rounded-md border border-border bg-muted/40 p-3 text-xs" role="note">
                What is sent to Claude (Anthropic): your brief, the image you upload here
                (downscaled, its metadata removed), the fields this card kind can show and an
                invented sample of them. No club&rsquo;s name, colours, players, photos or results
                are sent, and photos from a club&rsquo;s library can&rsquo;t be chosen.
              </p>
              <div>
                <Button type="submit" size="sm" disabled={!canStart || startGen.isPending}>
                  {startGen.isPending ? "Starting…" : "Design it"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Designs</CardTitle>
          </CardHeader>
          <CardContent>
            {quality ? (
              <dl className="mb-4 grid gap-1 text-sm sm:grid-cols-2" data-testid="designer-figures">
                <div>
                  <dt className="text-xs text-muted-foreground">First-try fit</dt>
                  <dd>
                    {quality.counted === 0
                      ? "No designs finished yet"
                      : `${Math.round((quality.firstTryFit / quality.counted) * 100)}% (${quality.firstTryFit} of ${quality.counted})`}{" "}
                    <span className="text-xs text-muted-foreground">
                      · target {Math.round(QUALITY_TARGET * 100)}% over the first 50
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cost per design</dt>
                  <dd>{dollars(quality.meanCostUsd)}</dd>
                </div>
              </dl>
            ) : null}
            {designerQ.isLoading ? (
              <div className="flex items-center py-4 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : designerQ.isError ? (
              <p className="text-sm text-destructive">Couldn&rsquo;t load the designs.</p>
            ) : generations.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No designs yet.</p>
            ) : (
              <ul className="divide-y text-sm" data-testid="ai-generations">
                {generations.map((g) => {
                  const s = STATUS[g.status];
                  return (
                    <li
                      key={g.id}
                      className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{kindLabel(g.kind)}</span>
                          <StatusPill tone={s.tone}>{s.label}</StatusPill>
                          {g.outcome ? (
                            <span className="text-xs text-muted-foreground">
                              {OUTCOME[g.outcome] ?? g.outcome}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {g.attempts} {g.attempts === 1 ? "try" : "tries"} · {dollars(g.costUsd)} ·{" "}
                          {new Date(g.createdAt).toLocaleString()}
                        </p>
                        {g.errors.length > 0 && !g.result ? (
                          <p className="mt-1 text-xs text-destructive">{g.errors[0]}</p>
                        ) : null}
                      </div>
                      {g.result ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={editHref(g.result.libraryTemplateId)}>Open the template</Link>
                        </Button>
                      ) : busy(g) ? (
                        <Loader2
                          className="h-4 w-4 animate-spin text-muted-foreground"
                          aria-label="Designing"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
