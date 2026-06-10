import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import {
  useListCardTemplates,
  useCreateCardTemplate,
  useUpdateCardTemplate,
  useDeleteCardTemplate,
  getListCardTemplatesQueryKey,
  type CardTemplate,
  type CardTemplateSlot,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Upload,
  Loader2,
  Plus,
  Type,
  ImageIcon,
  Pencil,
  X,
} from "lucide-react";
import type { CardKind, MotionPreset } from "@/lib/share-card";
import { fieldsForKinds, fieldLabel } from "@/lib/card-template";
import { CardKindPicker } from "@/components/card-kind-picker";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type BackgroundKind = "image" | "gif" | "video";

// Default loop length for an animated background when we can't read one (e.g.
// GIFs, whose duration isn't exposed to the browser the way <video> is).
const DEFAULT_ANIM_MS = 4000;

type DraftTemplate = {
  id?: number;
  name: string;
  cardKinds: string[];
  backgroundImageUrl: string;
  bgWidth: number;
  bgHeight: number;
  backgroundKind: BackgroundKind;
  backgroundDurationMs: number | null;
  motionPreset: MotionPreset;
  slots: CardTemplateSlot[];
  isActive: boolean;
  isDefault: boolean;
  displayOrder: number;
};

const blankDraft = (displayOrder: number): DraftTemplate => ({
  name: "",
  cardKinds: [],
  backgroundImageUrl: "",
  bgWidth: 0,
  bgHeight: 0,
  backgroundKind: "image",
  backgroundDurationMs: null,
  motionPreset: "none",
  slots: [],
  isActive: true,
  isDefault: false,
  displayOrder,
});

const toDraft = (t: CardTemplate): DraftTemplate => ({
  id: t.id,
  name: t.name,
  cardKinds: t.cardKinds,
  backgroundImageUrl: t.backgroundImageUrl,
  bgWidth: t.bgWidth,
  bgHeight: t.bgHeight,
  backgroundKind: (t.backgroundKind as BackgroundKind | undefined) ?? "image",
  backgroundDurationMs: t.backgroundDurationMs ?? null,
  motionPreset: (t.motionPreset as MotionPreset | undefined) ?? "none",
  slots: t.slots,
  isActive: t.isActive,
  isDefault: t.isDefault,
  displayOrder: t.displayOrder,
});

export function TemplatesCard() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const templatesQ = useListCardTemplates();
  const templates = templatesQ.data ?? [];
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListCardTemplatesQueryKey() });

  const update = useUpdateCardTemplate({ mutation: { onSuccess: invalidate } });
  const remove = useDeleteCardTemplate({ mutation: { onSuccess: invalidate } });

  const [editing, setEditing] = useState<DraftTemplate | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Custom tile templates</CardTitle>
        {!editing && (
          <Button
            size="sm"
            onClick={() => setEditing(blankDraft(templates.length))}
          >
            <Plus className="h-4 w-4 mr-1" /> New template
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Upload a flattened design from Canva or Figma, then drop labelled slots
          on top and bind each to a data field. Templates show up in the share
          dialog for the card types you choose; otherwise the built-in design is
          used.
        </p>

        {editing ? (
          <TemplateEditor
            draft={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              invalidate();
              setEditing(null);
            }}
          />
        ) : templatesQ.isError ? (
          <QueryError onRetry={() => templatesQ.refetch()} />
        ) : templatesQ.isLoading ? (
          <ListSkeleton />
        ) : templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            message="Create a template to customise your share-card designs."
          />
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border rounded p-2">
                {t.backgroundKind === "video" ? (
                  <video
                    src={t.backgroundImageUrl}
                    className="h-12 w-12 object-cover rounded bg-muted"
                    muted
                    loop
                    playsInline
                  />
                ) : (
                  <img
                    src={t.backgroundImageUrl}
                    alt={t.name}
                    className="h-12 w-12 object-cover rounded bg-muted"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {t.name}
                    {t.isDefault && (
                      <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                    {!t.isActive && (
                      <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.slots.length} slot{t.slots.length === 1 ? "" : "s"} •{" "}
                    {t.cardKinds.length === 0 ? "all cards" : t.cardKinds.join(", ")}
                  </div>
                </div>
                {!t.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => update.mutate({ id: t.id, data: { isDefault: true } })}
                    disabled={update.isPending}
                  >
                    Set default
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => setEditing(toDraft(t))}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete template",
                        description: `Delete template "${t.name}"?`,
                        confirmText: "Delete",
                        destructive: true,
                      })
                    )
                      remove.mutate({ id: t.id });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemplateEditor({
  draft: initialDraft,
  onClose,
  onSaved,
}: {
  draft: DraftTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DraftTemplate>(initialDraft);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const fileId = useId();

  const create = useCreateCardTemplate({
    mutation: { onSuccess: onSaved, onError: (e) => setError(handleAdminMutationError(e)) },
  });
  const update = useUpdateCardTemplate({
    mutation: { onSuccess: onSaved, onError: (e) => setError(handleAdminMutationError(e)) },
  });
  const bgUpload = useUpload({ onError: (e) => setError(e.message) });

  const kinds = draft.cardKinds as CardKind[];
  const fields = fieldsForKinds(kinds);
  const textFields = fields.filter((f) => f.type === "text");

  const setSlot = (id: string, patch: Partial<CardTemplateSlot>) =>
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const handleBg = async (file: File) => {
    setError(null);
    const isVideo = file.type.startsWith("video/");
    const isGif = file.type === "image/gif";
    const kind: BackgroundKind = isVideo ? "video" : isGif ? "gif" : "image";
    // Capture the natural dimensions (so slot fractions map back to the design)
    // and, for video, the loop duration.
    const meta = isVideo
      ? await new Promise<{ w: number; h: number; durationMs: number } | null>((resolve) => {
          const v = document.createElement("video");
          v.preload = "metadata";
          v.muted = true;
          v.onloadedmetadata = () =>
            resolve({
              w: v.videoWidth,
              h: v.videoHeight,
              durationMs: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : DEFAULT_ANIM_MS,
            });
          v.onerror = () => resolve(null);
          v.src = URL.createObjectURL(file);
        })
      : await new Promise<{ w: number; h: number; durationMs: number | null } | null>((resolve) => {
          const img = new Image();
          img.onload = () =>
            resolve({ w: img.naturalWidth, h: img.naturalHeight, durationMs: isGif ? DEFAULT_ANIM_MS : null });
          img.onerror = () => resolve(null);
          img.src = URL.createObjectURL(file);
        });
    if (!meta) {
      setError(isVideo ? "Could not read video metadata." : "Could not read image dimensions.");
      return;
    }
    const r = await bgUpload.uploadFile(file);
    if (r) {
      setDraft((d) => ({
        ...d,
        backgroundImageUrl: `/api/storage${r.objectPath}`,
        bgWidth: meta.w,
        bgHeight: meta.h,
        backgroundKind: kind,
        backgroundDurationMs: meta.durationMs,
      }));
    }
  };

  const addSlot = (type: "text" | "photo") => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const slot: CardTemplateSlot =
      type === "text"
        ? {
            id,
            type: "text",
            field: textFields[0]?.key ?? "playerName",
            x: 0.1,
            y: 0.1,
            w: 0.5,
            h: 0.1,
            fontSize: 0.06,
            color: "#FFFFFF",
            fontWeight: 700,
            align: "left",
            fontFamily: "sans",
            uppercase: false,
          }
        : {
            id,
            type: "photo",
            field: "photo",
            x: 0.1,
            y: 0.3,
            w: 0.4,
            h: 0.4,
            photoFit: "cover",
            shape: "rect",
          };
    setDraft((d) => ({ ...d, slots: [...d.slots, slot] }));
    setSelectedSlotId(id);
  };

  const removeSlot = (id: string) => {
    setDraft((d) => ({ ...d, slots: d.slots.filter((s) => s.id !== id) }));
    if (selectedSlotId === id) setSelectedSlotId(null);
  };

  const save = () => {
    setError(null);
    if (!draft.name.trim()) return setError("Template name required.");
    if (bgUpload.isUploading) return setError("Background is still uploading.");
    if (!draft.backgroundImageUrl) return setError("Background image required.");
    const body = {
      name: draft.name.trim(),
      cardKinds: draft.cardKinds,
      backgroundImageUrl: draft.backgroundImageUrl,
      bgWidth: draft.bgWidth,
      bgHeight: draft.bgHeight,
      backgroundKind: draft.backgroundKind,
      backgroundDurationMs: draft.backgroundDurationMs,
      motionPreset: draft.motionPreset,
      slots: draft.slots,
      isActive: draft.isActive,
      isDefault: draft.isDefault,
      displayOrder: draft.displayOrder,
    };
    if (draft.id != null) {
      update.mutate({ id: draft.id, data: body });
    } else {
      create.mutate({ data: body });
    }
  };

  const selectedSlot = draft.slots.find((s) => s.id === selectedSlotId) ?? null;
  const pending = create.isPending || update.isPending;

  return (
    <div className="space-y-4 border rounded-md p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          {draft.id != null ? "Edit template" : "New template"}
        </h3>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${fileId}-name`}>Template name</Label>
          <Input
            id={`${fileId}-name`}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Finals Hero"
          />
        </div>
        <div className="space-y-1">
          <Label>Background design (PNG / JPG / GIF / MP4)</Label>
          <div className="flex items-center gap-2">
            <input
              ref={bgRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              onChange={(e) => e.target.files?.[0] && handleBg(e.target.files[0])}
              disabled={bgUpload.isUploading}
              className="text-xs"
            />
            {bgUpload.isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {!bgUpload.isUploading && draft.backgroundImageUrl && (
              <Upload className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Still images up to 10MB. Animated GIF/MP4/WebM up to 50MB — keep clips
            short (≈4s) and looping. MP4 (H.264) plays most widely.
            {draft.backgroundKind !== "image" && (
              <>
                {" "}
                Detected {draft.backgroundKind.toUpperCase()}
                {draft.backgroundDurationMs
                  ? ` • ${(draft.backgroundDurationMs / 1000).toFixed(1)}s loop`
                  : ""}
                .
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${fileId}-motion`}>Motion preset</Label>
          <select
            id={`${fileId}-motion`}
            value={draft.motionPreset}
            onChange={(e) => setDraft((d) => ({ ...d, motionPreset: e.target.value as MotionPreset }))}
            className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
          >
            <option value="none">None (static slots)</option>
            <option value="fadeIn">Fade in</option>
            <option value="slideUp">Slide up</option>
            <option value="countUp">Count up numbers</option>
          </select>
          <p className="text-[11px] text-muted-foreground">
            Applies an entrance animation to the bound slots. Works on top of a
            still or animated background. Clubs can still override this per share.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Applies to card types</Label>
        <CardKindPicker
          value={draft.cardKinds}
          onChange={(next) => setDraft((d) => ({ ...d, cardKinds: next }))}
        />
      </div>

      {draft.backgroundImageUrl ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
          <SlotCanvas
            draft={draft}
            selectedSlotId={selectedSlotId}
            onSelectSlot={setSelectedSlotId}
            onChangeSlot={setSlot}
          />
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => addSlot("text")}>
                <Type className="h-3.5 w-3.5 mr-1" /> Text
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => addSlot("photo")}>
                <ImageIcon className="h-3.5 w-3.5 mr-1" /> Photo
              </Button>
            </div>

            {selectedSlot ? (
              <SlotInspector
                slot={selectedSlot}
                textFields={textFields}
                onChange={(patch) => setSlot(selectedSlot.id, patch)}
                onRemove={() => removeSlot(selectedSlot.id)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Select a slot to edit it, or add one above. Drag a slot to move it;
                drag its corner handle to resize.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Upload a background design to start placing slots.</p>
      )}

      <div className="flex items-center justify-between border-t pt-3">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={draft.isActive}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={draft.isDefault}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, isDefault: v }))}
            />
            Default
          </label>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || bgUpload.isUploading}>
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save template
          </Button>
        </div>
      </div>
    </div>
  );
}

function SlotCanvas({
  draft,
  selectedSlotId,
  onSelectSlot,
  onChangeSlot,
}: {
  draft: DraftTemplate;
  selectedSlotId: string | null;
  onSelectSlot: (id: string | null) => void;
  onChangeSlot: (id: string, patch: Partial<CardTemplateSlot>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef<
    | {
        mode: "move" | "resize";
        px: number;
        py: number;
        x: number;
        y: number;
        w: number;
        h: number;
      }
    | null
  >(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setBox({ w: el.clientWidth, h: el.clientHeight }),
    );
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const aspect = draft.bgWidth && draft.bgHeight ? draft.bgWidth / draft.bgHeight : 1;

  const onPointerDown = (
    e: React.PointerEvent,
    slot: CardTemplateSlot,
    mode: "move" | "resize",
  ) => {
    e.stopPropagation();
    onSelectSlot(slot.id);
    drag.current = {
      mode,
      px: e.clientX,
      py: e.clientY,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent, slot: CardTemplateSlot) => {
    const d = drag.current;
    if (!d || box.w === 0 || box.h === 0) return;
    const dx = (e.clientX - d.px) / box.w;
    const dy = (e.clientY - d.py) / box.h;
    if (d.mode === "move") {
      onChangeSlot(slot.id, {
        x: clamp(d.x + dx, 0, 1 - d.w),
        y: clamp(d.y + dy, 0, 1 - d.h),
      });
    } else {
      onChangeSlot(slot.id, {
        w: clamp(d.w + dx, 0.03, 1 - d.x),
        h: clamp(d.h + dy, 0.03, 1 - d.y),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-md border bg-muted select-none touch-none"
      style={{ aspectRatio: `${aspect}`, maxHeight: 460 }}
      onPointerDown={() => onSelectSlot(null)}
    >
      {draft.backgroundKind === "video" ? (
        <video
          src={draft.backgroundImageUrl}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        <img
          src={draft.backgroundImageUrl}
          alt="Template background"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
      )}
      {draft.slots.map((slot) => {
        const selected = slot.id === selectedSlotId;
        return (
          <div
            key={slot.id}
            className={`absolute border-2 ${
              selected ? "border-primary bg-primary/10" : "border-white/70 bg-black/20"
            }`}
            style={{
              left: `${slot.x * 100}%`,
              top: `${slot.y * 100}%`,
              width: `${slot.w * 100}%`,
              height: `${slot.h * 100}%`,
              cursor: "move",
            }}
            onPointerDown={(e) => onPointerDown(e, slot, "move")}
            onPointerMove={(e) => onPointerMove(e, slot)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span className="absolute -top-4 left-0 text-[10px] font-medium text-white bg-black/60 px-1 rounded-sm whitespace-nowrap">
              {slot.type === "photo" ? "Photo" : fieldLabel(slot.field)}
            </span>
            <div
              className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm bg-primary border border-white"
              style={{ cursor: "nwse-resize" }}
              onPointerDown={(e) => onPointerDown(e, slot, "resize")}
              onPointerMove={(e) => onPointerMove(e, slot)}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
        );
      })}
    </div>
  );
}

function SlotInspector({
  slot,
  textFields,
  onChange,
  onRemove,
}: {
  slot: CardTemplateSlot;
  textFields: { key: string; label: string }[];
  onChange: (patch: Partial<CardTemplateSlot>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded border p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {slot.type === "photo" ? "Photo slot" : "Text slot"}
        </span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {slot.type === "text" ? (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Data field</Label>
            <select
              value={slot.field}
              onChange={(e) => onChange({ field: e.target.value })}
              className="w-full px-2 py-1 rounded border bg-card text-sm"
            >
              {textFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Font size (%)</Label>
              <Input
                type="number"
                min={1}
                max={40}
                value={Math.round((slot.fontSize ?? 0.05) * 100)}
                onChange={(e) =>
                  onChange({ fontSize: clamp(Number(e.target.value) / 100, 0.01, 0.5) })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Colour</Label>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={slot.color ?? "#FFFFFF"}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="h-9 w-10 rounded border bg-transparent p-0.5"
                />
                <Input
                  value={slot.color ?? "#FFFFFF"}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Weight</Label>
              <select
                value={slot.fontWeight ?? 700}
                onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
                className="w-full px-2 py-1 rounded border bg-card text-sm"
              >
                {[400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Font</Label>
              <select
                value={slot.fontFamily ?? "sans"}
                onChange={(e) => onChange({ fontFamily: e.target.value as "sans" | "serif" })}
                className="w-full px-2 py-1 rounded border bg-card text-sm"
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Align</Label>
              <select
                value={slot.align ?? "left"}
                onChange={(e) =>
                  onChange({ align: e.target.value as "left" | "center" | "right" })
                }
                className="w-full px-2 py-1 rounded border bg-card text-sm"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs pt-5">
              <Switch
                checked={slot.uppercase ?? false}
                onCheckedChange={(v) => onChange({ uppercase: v })}
              />
              Uppercase
            </label>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Bound to the card's player photo (or the photo chosen in the share
            dialog).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Shape</Label>
              <select
                value={slot.shape ?? "rect"}
                onChange={(e) => onChange({ shape: e.target.value as "rect" | "circle" })}
                className="w-full px-2 py-1 rounded border bg-card text-sm"
              >
                <option value="rect">Rectangle</option>
                <option value="circle">Circle</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fit</Label>
              <select
                value={slot.photoFit ?? "cover"}
                onChange={(e) => onChange({ photoFit: e.target.value as "cover" | "contain" })}
                className="w-full px-2 py-1 rounded border bg-card text-sm"
                disabled={slot.shape === "circle"}
              >
                <option value="cover">Cover (fill)</option>
                <option value="contain">Contain (fit)</option>
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
