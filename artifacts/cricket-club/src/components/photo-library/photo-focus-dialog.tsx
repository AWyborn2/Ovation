import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Loader2, ScanFace, Trash2 } from "lucide-react";
import {
  useListPlayers,
  getListPlayersQueryKey,
  useSetClubPhotoFocus,
  type ClubPhoto,
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

/** Which box the pointer draws: the photo's focus, or one player's area. */
type Target = "focus" | number;

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
  photo: ClubPhoto;
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
  const [focusBox, setFocusBox] = useState<FocusBox | null>(null);
  const [offShapes, setOffShapes] = useState<Set<FrameShape>>(new Set());
  const [areas, setAreas] = useState<Map<number, FocusBox | null>>(new Map());
  const [target, setTarget] = useState<Target>("focus");
  const [faces, setFaces] = useState<FocusBox[]>([]);
  const [faceState, setFaceState] = useState<"idle" | "busy" | "none" | "error">("idle");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A fresh start each time a photo opens.
  useEffect(() => {
    if (!photo || !open) return;
    setFocusBox(photo.focusBox ?? null);
    setOffShapes(new Set(photo.offShapes ?? []));
    const next = new Map<number, FocusBox | null>(photo.playerIds.map((id) => [id, null]));
    for (const a of photo.playerAreas ?? []) next.set(a.playerId, a.box);
    setAreas(next);
    setTarget("focus");
    setFaces([]);
    setFaceState("idle");
    setSearch("");
    setError(null);
  }, [photo, open]);

  // Names for the players on the photo, and a search to add one.
  const rosterQ = useListPlayers(
    { sortBy: "name", limit: 500 },
    { query: { queryKey: getListPlayersQueryKey({ sortBy: "name", limit: 500 }), enabled: open } },
  );
  const names = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of rosterQ.data?.players ?? []) m.set(p.id, `${p.givenName} ${p.surname}`);
    return m;
  }, [rosterQ.data]);
  const searchQ = useListPlayers(
    { search, limit: 6 },
    {
      query: {
        queryKey: getListPlayersQueryKey({ search, limit: 6 }),
        enabled: open && search.trim().length >= 2,
      },
    },
  );
  const nameOf = (id: number) => names.get(id) ?? `Player ${id}`;

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

  const addPlayer = (id: number) => {
    setAreas((prev) => (prev.has(id) ? prev : new Map(prev).set(id, null)));
    setTarget(id);
    setSearch("");
  };

  const save = () => {
    if (!photo) return;
    setError(null);
    const before = new Map((photo.playerAreas ?? []).map((a) => [a.playerId, a.box]));
    const same = (a: FocusBox | null | undefined, b: FocusBox | null | undefined) =>
      JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    // Only areas that changed, so an untouched tag is left as it is.
    const playerAreas = [...areas]
      .filter(([id, box]) => !same(box, before.get(id)) && (box || before.has(id)))
      .map(([playerId, box]) => ({ playerId, box }));
    saveM.mutate({
      photoId: photo.id,
      data: { focusBox, offShapes: FRAME_SHAPES.filter((s) => offShapes.has(s)), playerAreas },
    });
  };

  if (!photo) return null;
  const fitPhoto = { width: photo.width, height: photo.height, focusBox };
  const boxes: Array<{ key: string; box: FocusBox; label: string; on: boolean }> = [
    ...(focusBox ? [{ key: "focus", box: focusBox, label: "Focus", on: target === "focus" }] : []),
    ...[...areas].flatMap(([id, box]) =>
      box ? [{ key: `p${id}`, box, label: nameOf(id), on: target === id }] : [],
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
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Add a player…"
                aria-label="Find a player to mark"
                className="mt-1 h-8"
              />
              {search.trim().length >= 2 &&
                (searchQ.data?.players ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addPlayer(p.id)}
                    className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  >
                    {p.givenName} {p.surname}
                  </button>
                ))}
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
                  </label>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Automatic posts never put this photo in a shape that's off.
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
          <Button type="button" onClick={save} disabled={saveM.isPending}>
            Save focus
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
