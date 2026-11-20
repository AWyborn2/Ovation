/**
 * Change photo (Nov 2026): one slide's photo, or a single card's, from the
 * club's library. Three ways to pick, and a way back:
 *
 * - From library: a photo grid; the pick goes on this slide only.
 * - Random: another photo from the pool the automatic pick draws from (for a
 *   Team List, the selected side's tagged photos), never the one on show.
 * - Focused only: the grid of photos already framed for the slide (a focus
 *   box, or a tag box for one of its players).
 * - Back to automatic photo: the slide draws its automatic photo again.
 *
 * A junior slide or card offers only the club's approved junior stock (the
 * PhotosPanel rule, ADR-007); the server refuses anything else on save.
 * The host stores the choice: a set draft in its design (`arrangement.ownPhotos`,
 * every size at once), a single card as its own photo.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Crosshair, Image as ImageIcon, Shuffle, Undo2 } from "lucide-react";
import {
  getGetDraftPhotoPoolQueryKey,
  getListClubPhotosQueryKey,
  useGetDraftPhotoPool,
  useListClubPhotos,
  type ClubPhoto,
} from "@workspace/api-client-react";
import {
  allowedSlidePhotos,
  focusedSlidePhotos,
  randomSlidePhoto,
  slidePhotoChoice,
  slidePhotoFor,
  type SlidePhoto,
} from "@workspace/scorecard/kind-templates";
import {
  DockPopover as Popover,
  DockPopoverContent as PopoverContent,
  DockPopoverTrigger as PopoverTrigger,
} from "./dock";
import { cn } from "@/lib/utils";
import type { EditorActionsContext } from "@/pages/admin-template-editor";
import type { SetShareContext } from "./export/share-panel";
import { isJuniorRule, photoRuleFor } from "./junior-photos";
import { withSlidePhotoChoice } from "./set-doc";

/** Where the club marks a photo's focus box. */
export const PHOTO_FOCUS_HREF = "/admin/social/photos";

type View = "menu" | "library" | "focused";

const row =
  "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold hover:bg-[var(--ed-card)] disabled:opacity-40 disabled:hover:bg-transparent";

export function ChangePhotoMenu({
  draftId,
  slideKey,
  junior,
  currentUrl,
  own,
  onPick,
  onAuto,
  lockedReason,
  random = Math.random,
}: {
  draftId: number;
  /** A set draft's slide; null for a single card's own photo. */
  slideKey: string | null;
  /** The editor's own rule says junior (a junior slide, card or set page). */
  junior: boolean;
  /** The photo the slide shows now. */
  currentUrl: string | null;
  /** Whether the slide has a photo of its own (else it is automatic). */
  own: boolean;
  onPick: (choice: SlidePhoto) => void | Promise<void>;
  onAuto: () => void | Promise<void>;
  /** Why the photo can't be changed here (a junior card's is the server's). */
  lockedReason?: string;
  /** Injectable for tests. */
  random?: () => number;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const params = slideKey ? { slide: slideKey } : undefined;
  const poolQ = useGetDraftPhotoPool(draftId, params, {
    query: { queryKey: getGetDraftPhotoPoolQueryKey(draftId, params), enabled: open },
  });
  const photosQ = useListClubPhotos(undefined, {
    query: { queryKey: getListClubPhotosQueryKey(), enabled: open },
  });
  const photos = photosQ.data ?? [];
  // Junior if either side says so (fails closed).
  const juniorOnly = junior || poolQ.data?.junior === true;
  const playerIds = poolQ.data?.playerIds ?? [];
  const library = allowedSlidePhotos(photos, juniorOnly);
  const focused = focusedSlidePhotos(photos, juniorOnly, playerIds);
  const current = photos.find((p) => p.url === currentUrl || p.thumbUrl === currentUrl) ?? null;

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } catch (err) {
      const why = (err as { data?: { error?: unknown } } | null)?.data?.error;
      setNote(typeof why === "string" ? why : "Couldn't change the photo. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const pick = (photo: ClubPhoto) =>
    run(async () => {
      await onPick(slidePhotoChoice(photo, playerIds));
      setOpen(false);
    });
  const drawRandom = () => {
    const next = randomSlidePhoto(photos, {
      poolIds: poolQ.data?.photoIds ?? [],
      junior: juniorOnly,
      current: { photoId: current?.id ?? null, url: currentUrl },
      random,
    });
    if (!next) {
      setNote(
        juniorOnly
          ? "There's no other approved junior stock image to draw. Mark more as junior stock in Photos."
          : "There's no other photo in this slide's automatic pool. Pick one from the library instead.",
      );
      return;
    }
    // The menu stays open: pressing Random again draws another.
    void run(() => onPick(slidePhotoChoice(next, playerIds)));
  };

  const loading = poolQ.isLoading || photosQ.isLoading;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setView("menu");
          setNote(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-2 text-xs font-semibold text-[var(--ed-ink)] hover:bg-[var(--ed-card)]"
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Change photo
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="studio-editor w-80 space-y-2">
        {lockedReason ? (
          <p className="text-sm text-[var(--ed-ink2)]">{lockedReason}</p>
        ) : view === "menu" ? (
          <>
            <p className="text-sm font-semibold">Change photo</p>
            <p className="text-xs text-[var(--ed-ink2)]">
              {slideKey
                ? "For this slide only, at every size. Other slides keep their photos."
                : "For this card, at every size."}
              {juniorOnly ? " Junior: only the club's approved junior stock images." : ""}
            </p>
            <button type="button" className={row} onClick={() => setView("library")}>
              <ImageIcon className="h-4 w-4" aria-hidden /> From library
            </button>
            <button type="button" className={row} disabled={busy || loading} onClick={drawRandom}>
              <Shuffle className="h-4 w-4" aria-hidden /> Random
            </button>
            <button type="button" className={row} onClick={() => setView("focused")}>
              <Crosshair className="h-4 w-4" aria-hidden /> Focused only
            </button>
            {own && (
              <button
                type="button"
                className={row}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onAuto();
                    setOpen(false);
                  })
                }
              >
                <Undo2 className="h-4 w-4" aria-hidden /> Back to automatic photo
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-[var(--ed-ink2)]"
              aria-label="Back to the Change photo menu"
              onClick={() => setView("menu")}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Change photo
            </button>
            <PhotoGrid
              photos={view === "focused" ? focused : library}
              loading={loading}
              currentId={current?.id ?? null}
              busy={busy}
              onPick={(p) => void pick(p)}
              empty={
                view === "focused" ? (
                  <p className="text-sm text-[var(--ed-ink2)]" data-testid="focused-empty">
                    No {juniorOnly ? "approved junior stock image" : "photo"} has a focus box yet
                    {juniorOnly ? "" : ", or a tag box for this slide's players"}. Mark one in{" "}
                    <Link href={PHOTO_FOCUS_HREF} className="font-semibold underline">
                      Photos → Photo focus
                    </Link>
                    .
                  </p>
                ) : (
                  <p className="text-sm text-[var(--ed-ink2)]">
                    {juniorOnly
                      ? "No approved junior stock images yet. Mark some as junior stock in Photos."
                      : "No photos in the library yet. Add some in Photos."}
                  </p>
                )
              }
            />
          </>
        )}
        {note && (
          <p role="alert" className="text-xs text-[var(--ed-ink2)]">
            {note}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PhotoGrid({
  photos,
  loading,
  currentId,
  busy,
  onPick,
  empty,
}: {
  photos: ClubPhoto[];
  loading: boolean;
  currentId: number | null;
  busy: boolean;
  onPick: (photo: ClubPhoto) => void;
  empty: React.ReactNode;
}) {
  if (loading) return <p className="text-sm text-[var(--ed-ink2)]">Loading the photo library…</p>;
  if (!photos.length) return <>{empty}</>;
  return (
    <ul className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto">
      {photos.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            disabled={busy}
            aria-pressed={p.id === currentId}
            aria-label={`Use library photo ${p.id}`}
            onClick={() => onPick(p)}
            className={cn(
              "block w-full overflow-hidden rounded-md border",
              p.id === currentId ? "border-[var(--ed-accent)]" : "border-transparent",
            )}
          >
            <img src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Change photo for the slide on the canvas in the set editor: shown when the
 * slide has a photo (its automatic one, or its own). The choice is an edit to
 * the set's design, through history like any other, so Undo takes it back and
 * Save stores it (`arrangement.ownPhotos`).
 */
export function SlidePhotoButton({
  draftId,
  set,
  design,
}: {
  draftId: number;
  set: SetShareContext;
  design: NonNullable<EditorActionsContext["setDesign"]>;
}) {
  const slide = set.slides.find((s) => s.key === set.current) ?? set.slides[0];
  if (!slide) return null;
  const own = slidePhotoFor(design.doc.setDesign ?? {}, slide.key);
  if (!own && !slide.data.photoUrl) return null;
  const rule = photoRuleFor({ slide, slides: set.slides });
  return (
    <ChangePhotoMenu
      draftId={draftId}
      slideKey={slide.key}
      junior={isJuniorRule(rule)}
      currentUrl={slide.data.photoUrl ?? null}
      own={!!own}
      onPick={(choice) =>
        design.edit((doc) => withSlidePhotoChoice(doc, slide.key, choice), slide.key)
      }
      onAuto={() => design.edit((doc) => withSlidePhotoChoice(doc, slide.key, null), slide.key)}
    />
  );
}
