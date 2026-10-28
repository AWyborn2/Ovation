/**
 * Studio → Templates → Your templates → Generate (ADR-012 R2-D): a card kind,
 * a brief and an optional reference image become a private club template made
 * by Claude. The button is hidden unless Ovation has switched Generate on and
 * the designer met its quality bar. The dialog says what is sent and how many
 * designs are left this month, follows the design while it is made, and opens
 * the new template when it is saved.
 */
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import {
  getGetClubTemplateGenerationQueryKey,
  getListClubTemplateGenerationsQueryKey,
  getListClubTemplatesQueryKey,
  startClubTemplateGeneration,
  useGetClubTemplateGeneration,
  useListClubTemplateGenerations,
  type ClubTemplateGeneration,
} from "@workspace/api-client-react";
import { TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { templateKindLabel } from "./previews";

export const MAX_BRIEF = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** How often a design being made is checked. */
export const POLL_MS = 4000;

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const busy = (g: ClubTemplateGeneration | undefined) =>
  g?.status === "queued" || g?.status === "running";

/** Why a finished design wasn't saved, in the club's words. */
export function failureMessage(g: ClubTemplateGeneration): string {
  if (g.outcome === "refused") return "Claude declined that brief. Try describing it differently.";
  if (g.outcome === "provider_error")
    return "The designer couldn't be reached. This one doesn't count; try again.";
  return g.errors[0]
    ? `No design fitted the card: ${g.errors[0]}`
    : "No design fitted the card. Try a different brief.";
}

const remainingLabel = (remaining: number, limit: number) =>
  `${remaining} of ${limit} AI designs left this month`;

function GenerateForm({
  remaining,
  limit,
  onStarted,
}: {
  remaining: number;
  limit: number;
  onStarted: (g: ClubTemplateGeneration) => void;
}) {
  const [kind, setKind] = useState<string>(TEMPLATE_CARD_KINDS[0]);
  const [brief, setBrief] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = (file: File | null) => {
    setError(null);
    if (file && !/^image\/(png|jpeg)$/.test(file.type)) {
      setError("The reference image must be a PNG or a JPEG.");
      setImage(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("The image is larger than 5 MB.");
      setImage(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setImage(file);
  };

  const canStart =
    remaining > 0 && (brief.trim().length > 0 || image !== null) && brief.length <= MAX_BRIEF;

  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setStarting(true);
        setError(null);
        try {
          const g = await startClubTemplateGeneration({
            kind,
            ...(brief.trim() ? { brief: brief.trim() } : {}),
            ...(image ? { image } : {}),
          });
          onStarted(g);
        } catch (err) {
          const data = (err as { data?: { error?: unknown } } | null)?.data;
          setError(
            typeof data?.error === "string"
              ? data.error
              : (handleAdminMutationError(err) ?? "Couldn't start the design. Try again."),
          );
        } finally {
          setStarting(false);
        }
      }}
    >
      <label className="grid gap-1 text-sm font-medium">
        Card kind
        <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value)}>
          {TEMPLATE_CARD_KINDS.map((k) => (
            <option key={k} value={k}>
              {templateKindLabel(k)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Brief
        <textarea
          className="min-h-[96px] rounded-md border border-input bg-background p-2 text-sm"
          maxLength={MAX_BRIEF}
          placeholder="Gold numbers on deep navy, a diagonal band behind the name…"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <span className="text-xs font-normal text-muted-foreground">
          {brief.length} / {MAX_BRIEF}
        </span>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Reference image (optional; PNG or JPEG, up to 5 MB)
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="text-sm"
          onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
        />
      </label>
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs" role="note">
        What is sent to Claude (Anthropic): your brief, the image you upload here (downscaled, its
        metadata removed, not kept) and invented sample data for this card. Your players, photos,
        results and club details are not sent, and photos from your library can&rsquo;t be used.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" data-testid="generate-remaining">
          {remainingLabel(remaining, limit)}
        </span>
        <Button type="submit" size="sm" disabled={!canStart || starting}>
          {starting ? "Starting…" : "Design it"}
        </Button>
      </div>
    </form>
  );
}

/** Follows one design until it is saved (then opens it) or fails. */
function GenerationProgress({ id, onAgain }: { id: number; onAgain: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const q = useGetClubTemplateGeneration(id, {
    query: {
      queryKey: getGetClubTemplateGenerationQueryKey(id),
      refetchInterval: (query) => (busy(query.state.data) || !query.state.data ? POLL_MS : false),
    },
  });
  const g = q.data;
  const copyId = g?.result?.copyId;
  const [opened, setOpened] = useState(false);
  if (copyId !== undefined && !opened) {
    setOpened(true);
    void qc.invalidateQueries({ queryKey: getListClubTemplatesQueryKey() });
    void qc.invalidateQueries({ queryKey: getListClubTemplateGenerationsQueryKey() });
    navigate(`/admin/social/template/${copyId}`);
  }
  if (!g || busy(g) || copyId !== undefined) {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {copyId !== undefined
          ? "Opening your new template…"
          : "Designing… this takes a few minutes. You can close this and come back."}
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <p role="alert" className="text-sm text-destructive">
        {failureMessage(g)}
      </p>
      <div>
        <Button size="sm" variant="outline" onClick={onAgain}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/** The Generate button and its dialog; nothing when Generate isn't offered. */
export function GenerateButton() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const q = useListClubTemplateGenerations({
    query: { queryKey: getListClubTemplateGenerationsQueryKey() },
  });
  const list = q.data;
  if (!list?.available) return null;
  // A design still being made when the dialog opens is followed again.
  const inFlight = list.generations.find((g) => busy(g));
  const followId = activeId ?? inFlight?.id ?? null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void q.refetch();
          setOpen(true);
        }}
      >
        <Sparkles className="mr-1 h-4 w-4" aria-hidden />
        Generate
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setActiveId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate a design</DialogTitle>
            <DialogDescription>
              Describe a card, upload a reference image, or both. Claude designs it in your
              club&rsquo;s template format and saves it to Your templates, where you can edit it.
            </DialogDescription>
          </DialogHeader>
          {followId !== null ? (
            <GenerationProgress
              id={followId}
              onAgain={async () => {
                setActiveId(null);
                await qc.invalidateQueries({ queryKey: getListClubTemplateGenerationsQueryKey() });
              }}
            />
          ) : (
            <GenerateForm
              remaining={list.remaining}
              limit={list.limit}
              onStarted={(g) => {
                setActiveId(g.id);
                void qc.invalidateQueries({ queryKey: getListClubTemplateGenerationsQueryKey() });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
