import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Loader2, ScanFace, Trash2 } from "lucide-react";
import {
  useListPlayers,
  getListPlayersQueryKey,
  useSetClubPhotoFocus,
  useSetJuniorLibraryPhotoFocus,
  type ClubPhoto,
  type JuniorLibraryPhoto,
} from "@workspace/api-client-react";
import {
  FRAME_SHAPES,
  focusTransform,
  normaliseFocusBox,
  photoShapeFit,
  type FocusBox,
  type FocusFit,
  type FrameShape,
} from "@workspace/scorecard/photo-focus";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatusPill, type StatusTone } from "@/components/admin-ui";
import { findFaces, personBoxFromFace, unionBox } from "@/lib/face-suggestions";
import { cn } from "@/lib/utils";

/**
 * The photo focus editor (photo focus areas): draw the box that matters on a
 * library photo, see how it crops in tall, square and wide frames, switch a
 * shape off, and mark where each player is. Face suggestions run on the
 * admin's device and are only ever suggestions.
 */

/** Which box the pointer draws: the photo's focus, or one person's area (by key). */
type Target = "focus" | string;

/** The photo as the editor needs it (a senior or a junior library photo). */
type FocusPhoto = {
  url: string;
  width: number;
  height: number;
  focusBox: FocusBox | null;
  offShapes: readonly FrameShape[];
};

/** Someone who can be marked on the photo, keyed by player or participant id. */
type Person = { key: string; name: string; area: FocusBox | null };

/** What a save sends: the box, the shapes switched off and the areas that changed. */
type FocusChange = {
  focusBox: FocusBox | null;
  offShapes: FrameShape[];
  areas: Array<{ key: string; box: FocusBox | null }>;
};

/** A search to add someone not yet on the photo (senior players). */
type PeopleSearch = {
  query: string;
  setQuery: (q: string) => void;
  results: Array<{ key: string; name: string }>;
};

const SHAPE_LABELS: Record<FrameShape, string> = {
  tall: "Tall frames",
  square: "Square frames",
  wide: "Wide frames",
};
const FIT_TONES: Record<FocusFit, StatusTone> = {
  good: "success",
  tight: "attention",
  none: "danger",
};
const FIT_LABELS: Record<FocusFit, string> = {
  good: "Fits",
  tight: "Tight fit",
  none: "Doesn't fit",
};
/** The preview strip: the frames the club's cards use most. */
const PREVIEWS = [
  { label: "4:5", aspect: 4 / 5 },
  { label: "9:16", aspect: 9 / 16 },
  { label: "1:1", aspect: 1 },
  { label: "16:9", aspect: 16 / 9 },
] as const;

const round = (v: number) => Math.round(v * 10000) / 10000;

/** The photo cropped as a card frame of `aspect` crops it (the renderers' CSS). */
function FramePreview({
  photo,
  box,
  aspect,
  label,
}: {
  photo: FocusPhoto;
  box: FocusBox | null;
  aspect: number;
  label: string;
}) {
  const t = box
    ? focusTransform({ box, width: photo.width, height: photo.height }, aspect)
    : { focalX: 0.5, focalY: 0.5, zoom: 1 };
  const fx = `${t.focalX * 100}%`;
  const fy = `${t.focalY * 100}%`;
  return (
    <figure className="space-y-1">
      <div
        className="h-20 overflow-hidden rounded-md border bg-muted"
        style={{ aspectRatio: String(aspect) }}
      >
        <img
          src={photo.url}
          alt=""
          className="block h-full w-full object-cover"
          style={{
            objectPosition: `${fx} ${fy}`,
            transform: `scale(${t.zoom})`,
            transformOrigin: `${fx} ${fy}`,
          }}
        />
      </div>
      <figcaption className="text-center text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

/**
 * The editor itself, for any library photo: the senior and junior dialogs below
 * give it the people who can be marked and save what changed.
 */
function FocusEditorDialog({
  photo,
  people,
  open,
  onOpenChange,
  onSave,
  saving,
  error,
  search,
  shapeSwitches = true,
}: {
  photo: FocusPhoto | null;
  people: readonly Person[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (change: FocusChange) => void;
  saving: boolean;
  error: string | null;
  search?: PeopleSearch;
  /** Whether the automatic picker honours switched-off shapes for this library. */
  shapeSwitches?: boolean;
}) {
  const [focusBox, setFocusBox] = useState<FocusBox | null>(null);
  const [offShapes, setOffShapes] = useState<Set<FrameShape>>(new Set());
  const [areas, setAreas] = useState<Map<string, FocusBox | null>>(new Map());
  const [added, setAdded] = useState<Map<string, string>>(new Map());
  const [target, setTarget] = useState<Target>("focus");
  const [faces, setFaces] = useState<FocusBox[]>([]);
  const [faceState, setFaceState] = useState<"idle" | "busy" | "none" | "error">("idle");

  // A fresh start each time a photo opens.
  useEffect(() => {
    if (!photo || !open) return;
    setFocusBox(photo.focusBox ?? null);
    setOffShapes(new Set(photo.offShapes));
    setAreas(new Map(people.map((p) => [p.key, p.area])));
    setAdded(new Map());
    setTarget("focus");
    setFaces([]);
    setFaceState("idle");
    // Only when a photo opens: `people` is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, open]);

  const names = useMemo(
    () => new Map([...people.map((p) => [p.key, p.name] as const), ...added]),
    [people, added],
  );
  const nameOf = (key: string) => names.get(key) ?? "Player";

  // Drawing: drag on the photo to draw the current box; drag inside it to move it.
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { mode: "draw"; x: number; y: number }
    | { mode: "move"; x: number; y: number; box: FocusBox }
    | null
  >(null);
  const current = target === "focus" ? focusBox : (areas.get(target) ?? null);
  const setCurrent = (box: FocusBox | null) => {
    if (target === "focus") setFocusBox(box);
    else setAreas((prev) => new Map(prev).set(target, box));
  };
  const point = (e: PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    const inside =
      current &&
      p.x >= current.x &&
      p.x <= current.x + current.w &&
      p.y >= current.y &&
      p.y <= current.y + current.h;
    drag.current = inside ? { mode: "move", ...p, box: current } : { mode: "draw", ...p };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    if (d.mode === "draw") {
      const box = normaliseFocusBox({
        x: Math.min(d.x, p.x),
        y: Math.min(d.y, p.y),
        w: Math.abs(p.x - d.x),
        h: Math.abs(p.y - d.y),
      });
      if (box) setCurrent(box);
    } else {
      const x = Math.max(0, Math.min(1 - d.box.w, d.box.x + p.x - d.x));
      const y = Math.max(0, Math.min(1 - d.box.h, d.box.y + p.y - d.y));
      setCurrent({ ...d.box, x: round(x), y: round(y) });
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  const runFaces = async () => {
    if (!photo) return;
    setFaceState("busy");
    try {
      const found = (await findFaces(photo.url)).map(personBoxFromFace);
      setFaces(found);
      setFaceState(found.length ? "idle" : "none");
    } catch {
      setFaceState("error");
    }
  };

  const addPerson = (key: string, name: string) => {
    setAdded((prev) => new Map(prev).set(key, name));
    setAreas((prev) => (prev.has(key) ? prev : new Map(prev).set(key, null)));
    setTarget(key);
    search?.setQuery("");
  };

  const save = () => {
    if (!photo) return;
    const before = new Map(people.flatMap((p) => (p.area ? [[p.key, p.area] as const] : [])));
    const same = (a: FocusBox | null | undefined, b: FocusBox | null | undefined) =>
      JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    // Only areas that changed, so an untouched tag is left as it is.
    const changed = [...areas]
      .filter(([key, box]) => !same(box, before.get(key)) && (box || before.has(key)))
      .map(([key, box]) => ({ key, box }));
    onSave({ focusBox, offShapes: FRAME_SHAPES.filter((s) => offShapes.has(s)), areas: changed });
  };

  if (!photo) return null;
  const fitPhoto = { width: photo.width, height: photo.height, focusBox };
  const boxes: Array<{ key: string; box: FocusBox; label: string; on: boolean }> = [
    ...(focusBox ? [{ key: "focus", box: focusBox, label: "Focus", on: target === "focus" }] : []),
    ...[...areas].flatMap(([id, box]) =>
      box ? [{ key: `p-${id}`, box, label: nameOf(id), on: target === id }] : [],
    ),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Photo focus</DialogTitle>
          <DialogDescription>
            Drag on the photo to mark the part that matters. Every card frame keeps it in view. Mark
            where each player is, and cards about them crop to that.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            <div
              ref={stage}
              role="application"
              aria-label="Photo. Drag to draw the box."
              className="relative touch-none select-none overflow-hidden rounded-lg border bg-muted"
              style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <img
                src={photo.url}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full"
              />
              {faces.map((f, i) => (
                <button
                  key={`face-${i}`}
                  type="button"
                  aria-label={`Use suggested area ${i + 1}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setCurrent(f)}
                  className="absolute rounded border-2 border-dashed border-white/80 hover:bg-white/10"
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.w * 100}%`,
                    height: `${f.h * 100}%`,
                  }}
                />
              ))}
              {boxes.map((b) => (
                <div
                  key={b.key}
                  className={cn(
                    "pointer-events-none absolute rounded border-2",
                    b.on
                      ? "border-primary shadow-[0_0_0_9999px_hsl(0_0%_0%/0.35)]"
                      : "border-white",
                  )}
                  style={{
                    left: `${b.box.x * 100}%`,
                    top: `${b.box.y * 100}%`,
                    width: `${b.box.w * 100}%`,
                    height: `${b.box.h * 100}%`,
                  }}
                >
                  <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-black/70 px-1 text-[10px] text-white">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void runFaces()}
                disabled={faceState === "busy"}
              >
                {faceState === "busy" ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ScanFace className="mr-1 h-4 w-4" aria-hidden />
                )}
                Suggest areas from faces
              </Button>
              {faces.length > 1 && target === "focus" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFocusBox(unionBox(faces))}
                >
                  Focus on everyone
                </Button>
              )}
              {current && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCurrent(null)}>
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                  Clear this box
                </Button>
              )}
              <span className="text-xs text-muted-foreground" role="status">
                {faceState === "none" && "No faces found. Draw the boxes by hand."}
                {faceState === "error" && "Faces couldn't be found here. Draw the boxes by hand."}
                {faces.length > 0 && "Click a dashed box to use it for the box you're editing."}
              </span>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                How {target === "focus" ? "the photo" : nameOf(target)} crops
              </p>
              <div className="flex flex-wrap items-end gap-3">
                {PREVIEWS.map((p) => (
                  <FramePreview
                    key={p.label}
                    photo={photo}
                    box={current}
                    aspect={p.aspect}
                    label={p.label}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <fieldset className="space-y-1">
              <legend className="mb-1 text-sm font-medium">Editing</legend>
              <Button
                type="button"
                size="sm"
                variant={target === "focus" ? "default" : "outline"}
                className="w-full justify-start"
                aria-pressed={target === "focus"}
                onClick={() => setTarget("focus")}
              >
                Whole photo focus
              </Button>
              {[...areas.keys()].map((id) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={target === id ? "default" : "outline"}
                  className="w-full justify-between"
                  aria-pressed={target === id}
                  onClick={() => setTarget(id)}
                >
                  <span className="truncate">{nameOf(id)}</span>
                  <span className="text-[10px] opacity-75">
                    {areas.get(id) ? "Marked" : "Not marked"}
                  </span>
                </Button>
              ))}
              {search && (
                <>
                  <Input
                    value={search.query}
                    onChange={(e) => search.setQuery(e.target.value)}
                    placeholder="Add a player…"
                    aria-label="Find a player to mark"
                    className="mt-1 h-8"
                  />
                  {search.query.trim().length >= 2 &&
                    search.results.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => addPerson(p.key, p.name)}
                        className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                      >
                        {p.name}
                      </button>
                    ))}
                </>
              )}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Frame shapes</legend>
              {FRAME_SHAPES.map((shape) => {
                const on = !offShapes.has(shape);
                const fit = photoShapeFit(fitPhoto, shape);
                return (
                  <label key={shape} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {SHAPE_LABELS[shape]}
                      <StatusPill
                        tone={on ? FIT_TONES[fit] : "neutral"}
                        className="ml-2 h-5 px-2 text-[10px]"
                      >
                        {on ? FIT_LABELS[fit] : "Off"}
                      </StatusPill>
                    </span>
                    {shapeSwitches && (
                      <Switch
                        checked={on}
                        aria-label={`Use in ${SHAPE_LABELS[shape].toLowerCase()}`}
                        onCheckedChange={(v) =>
                          setOffShapes((prev) => {
                            const next = new Set(prev);
                            if (v) next.delete(shape);
                            else next.add(shape);
                            return next;
                          })
                        }
                      />
                    )}
                  </label>
                );
              })}
              <p className="text-xs text-muted-foreground">
                {shapeSwitches
                  ? "Automatic posts never put this photo in a shape that's off."
                  : "How well the focus fits each shape of card frame."}
              </p>
            </fieldset>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            Save focus
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The senior library's focus editor: players by name, and a search to mark someone new. */
export function PhotoFocusDialog({
  photo,
  open,
  onOpenChange,
  onSaved,
}: {
  photo: ClubPhoto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (photo: ClubPhoto) => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open, photo]);
  // Names for the players on the photo, and a search to add one.
  const rosterQ = useListPlayers(
    { sortBy: "name", limit: 500 },
    { query: { queryKey: getListPlayersQueryKey({ sortBy: "name", limit: 500 }), enabled: open } },
  );
  const searchQ = useListPlayers(
    { search: query, limit: 6 },
    {
      query: {
        queryKey: getListPlayersQueryKey({ search: query, limit: 6 }),
        enabled: open && query.trim().length >= 2,
      },
    },
  );
  const people = useMemo<Person[]>(() => {
    if (!photo) return [];
    const names = new Map(
      (rosterQ.data?.players ?? []).map((p) => [p.id, `${p.givenName} ${p.surname}`]),
    );
    const areas = new Map((photo.playerAreas ?? []).map((a) => [a.playerId, a.box]));
    return photo.playerIds.map((id) => ({
      key: String(id),
      name: names.get(id) ?? `Player ${id}`,
      area: areas.get(id) ?? null,
    }));
  }, [photo, rosterQ.data]);
  const saveM = useSetClubPhotoFocus({
    mutation: {
      onSuccess: (saved) => {
        onSaved(saved as ClubPhoto);
        onOpenChange(false);
      },
      onError: () =>
        setError("The focus couldn't be saved. Only senior players can be marked on a photo."),
    },
  });
  return (
    <FocusEditorDialog
      photo={
        photo
          ? { ...photo, focusBox: photo.focusBox ?? null, offShapes: photo.offShapes ?? [] }
          : null
      }
      people={people}
      open={open}
      onOpenChange={onOpenChange}
      saving={saveM.isPending}
      error={error}
      search={{
        query,
        setQuery,
        results: (searchQ.data?.players ?? []).map((p) => ({
          key: String(p.id),
          name: `${p.givenName} ${p.surname}`,
        })),
      }}
      onSave={(change) => {
        if (!photo) return;
        setError(null);
        saveM.mutate({
          photoId: photo.id,
          data: {
            focusBox: change.focusBox,
            offShapes: change.offShapes,
            playerAreas: change.areas.map((a) => ({ playerId: Number(a.key), box: a.box })),
          },
        });
      }}
    />
  );
}

/**
 * The junior library's focus editor (juniors parity): the children tagged on the
 * photo, through the junior routes only. Marking someone new means tagging them
 * first, which stays on the library's tag panel (a consent question).
 */
export function JuniorPhotoFocusDialog({
  photo,
  open,
  onOpenChange,
  onSaved,
}: {
  photo: JuniorLibraryPhoto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (photo: JuniorLibraryPhoto) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open, photo]);
  const people = useMemo<Person[]>(() => {
    if (!photo) return [];
    const areas = new Map(
      (photo.participantAreas ?? []).map((a) => [a.participantId.toLowerCase(), a.box]),
    );
    return photo.participants.map((c) => ({
      key: c.participantId,
      name: c.displayName,
      area: areas.get(c.participantId.toLowerCase()) ?? null,
    }));
  }, [photo]);
  const saveM = useSetJuniorLibraryPhotoFocus({
    mutation: {
      onSuccess: (saved) => {
        onSaved(saved as JuniorLibraryPhoto);
        onOpenChange(false);
      },
      onError: () => setError("The focus couldn't be saved. Please try again."),
    },
  });
  // A junior photo's size is unknown only for very old uploads; without it the
  // crop can't be worked out, so the editor isn't offered (see the library page).
  const sized =
    photo && photo.width && photo.height
      ? {
          url: photo.url,
          width: photo.width,
          height: photo.height,
          focusBox: photo.focusBox ?? null,
          offShapes: photo.offShapes ?? [],
        }
      : null;
  return (
    <FocusEditorDialog
      photo={sized}
      people={people}
      // Junior cards don't pick photos by frame shape yet, so there's nothing to switch off.
      shapeSwitches={false}
      open={open && sized !== null}
      onOpenChange={onOpenChange}
      saving={saveM.isPending}
      error={error}
      onSave={(change) => {
        if (!photo) return;
        setError(null);
        saveM.mutate({
          photoId: photo.id,
          data: {
            focusBox: change.focusBox,
            offShapes: change.offShapes,
            participantAreas: change.areas.map((a) => ({ participantId: a.key, box: a.box })),
          },
        });
      }}
    />
  );
}
