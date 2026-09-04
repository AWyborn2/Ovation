import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, X } from "lucide-react";
import {
  useListCardEffectPresets,
  useCreateCardEffectPreset,
  useDeleteCardEffectPreset,
  getListCardEffectPresetsQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  BUILTIN_EFFECT_PRESETS,
  hasLayerEffects,
  type EffectPreset,
  type LayerEffects,
} from "@/lib/share-card";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { useConfirm } from "@/components/confirm-dialog";

// Reusable effect presets: apply a built-in or saved bundle to the current
// layer in one click, save the current effects as a new named preset, or delete
// a saved one. Built-ins ship with the app; saved presets persist server-side.
export function EffectPresets({
  current,
  onApply,
}: {
  current: LayerEffects;
  onApply: (effects: LayerEffects) => void;
}) {
  const qc = useQueryClient();
  const { data: saved = [] } = useListCardEffectPresets();
  const createPreset = useCreateCardEffectPreset();
  const deletePreset = useDeleteCardEffectPreset();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const presets: EffectPreset[] = [
    ...BUILTIN_EFFECT_PRESETS,
    ...saved.map((p) => ({ id: p.id, name: p.name, effects: p.effects as LayerEffects })),
  ];

  const invalidate = () => qc.invalidateQueries({ queryKey: getListCardEffectPresetsQueryKey() });

  const apply = (id: string) => {
    const p = presets.find((x) => String(x.id) === id);
    if (p) onApply(p.effects);
  };

  const saveCurrent = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createPreset.mutateAsync({ data: { name: trimmed, effects: current } });
      await invalidate();
      setName("");
      setSaving(false);
    } catch (err) {
      handleAdminMutationError(err);
    }
  };

  const removePreset = async (p: EffectPreset) => {
    const ok = await confirm({
      title: "Delete preset",
      description: `Delete the "${p.name}" effect preset? This can't be undone.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePreset.mutateAsync({ id: p.id });
      await invalidate();
    } catch (err) {
      handleAdminMutationError(err);
    }
  };

  return (
    <div className="space-y-1 rounded border bg-muted/30 p-2">
      <div className="flex items-center gap-1">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) apply(e.target.value);
            e.target.value = "";
          }}
          className="h-7 flex-1 rounded border bg-card px-1 text-xs"
        >
          <option value="">Apply preset…</option>
          <optgroup label="Built-in">
            {BUILTIN_EFFECT_PRESETS.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {saved.length > 0 && (
            <optgroup label="Saved">
              {saved.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {!saving && (
          <button
            type="button"
            disabled={!hasLayerEffects(current)}
            onClick={() => setSaving(true)}
            title="Save current effects as a preset"
            className="flex items-center gap-1 rounded border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            Save
          </button>
        )}
      </div>

      {saving && (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveCurrent();
              } else if (e.key === "Escape") {
                setSaving(false);
                setName("");
              }
            }}
            placeholder="Preset name"
            className="h-7 flex-1 text-xs"
          />
          <button
            type="button"
            disabled={!name.trim() || createPreset.isPending}
            onClick={() => void saveCurrent()}
            className="rounded border px-2 py-1 text-[10px] text-primary disabled:opacity-40"
          >
            {createPreset.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSaving(false);
              setName("");
            }}
            className="rounded border px-2 py-1 text-[10px] text-muted-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {saved.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[10px]"
            >
              {p.name}
              <button
                type="button"
                onClick={() =>
                  void removePreset({ id: p.id, name: p.name, effects: p.effects as LayerEffects })
                }
                title="Delete preset"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
