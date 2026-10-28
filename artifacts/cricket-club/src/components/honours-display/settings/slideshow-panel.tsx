import { Trash2 } from "lucide-react";
import type { KioskPhotoSlideshow } from "@workspace/api-client-react";
import { PHOTO_TYPES, PHOTO_TYPE_LABELS } from "@workspace/scorecard";
import { Button } from "@/components/ui/button";
import type { HonoursDisplayForm } from "../use-honours-display-settings";
import { FoldersField, PickedPhotosField } from "./slideshow-photo-picker";

const LIBRARY_LABEL: Record<KioskPhotoSlideshow["library"], string> = {
  senior: "Club photo library",
  junior: "Junior photo library",
  both: "Both libraries",
};

const SOURCE_LABEL: Record<KioskPhotoSlideshow["source"], string> = {
  all: "All photos",
  recent: "Recent photos",
  season: "This season",
  types: "Photo types",
  grades: "Grades",
  folders: "Library folders",
  picked: "Hand-picked photos",
};

const INTERLUDE_EVERY = [1, 2, 3, 4, 5, 6, 8, 10];

const PER_PASS = [5, 10, 15, 20, 30];
const SECONDS = [4, 6, 8, 10, 15];

/**
 * Settings for one photo slideshow in the rotation (honours kiosk redesign D2).
 * The server picks the photos from the chosen library; junior photos only
 * appear when every child tagged in them may be shown.
 */
export function SlideshowPanel({
  form,
  slideshow,
}: {
  form: HonoursDisplayForm;
  slideshow: KioskPhotoSlideshow;
}) {
  const s = slideshow;
  const patch = (p: Partial<KioskPhotoSlideshow>) => form.patchSlideshow(s.id, p);
  const id = (field: string) => `slideshow-${s.id}-${field}`;
  const count = form.slideshowPhotoCount.get(s.id);
  const types = s.types ?? [];

  return (
    <div className="space-y-3">
      <Field label="Name" htmlFor={id("name")}>
        <input
          id={id("name")}
          className="w-full rounded border bg-card px-2 py-1.5 text-sm"
          value={s.name}
          maxLength={80}
          onChange={(e) => patch({ name: e.target.value })}
          data-testid={id("name")}
        />
      </Field>
      {s.source !== "picked" && (
        <Field label="Photos from" htmlFor={id("library")}>
          <Select
            id={id("library")}
            value={s.library}
            options={LIBRARY_LABEL}
            onChange={(library) => patch({ library })}
          />
        </Field>
      )}
      {(s.library !== "senior" || s.source === "picked") && (
        <p className="text-[11px] text-muted-foreground">
          A junior photo only shows when every child tagged in it may be shown, and it stops showing
          as soon as a family withdraws.
        </p>
      )}
      <Field label="Which photos" htmlFor={id("source")}>
        <Select
          id={id("source")}
          value={s.source}
          options={SOURCE_LABEL}
          onChange={(source) =>
            patch({
              source,
              // Manual order only means something for picked photos.
              ...(source !== "picked" && s.order === "manual" ? { order: "random" } : {}),
            })
          }
        />
      </Field>
      {s.source === "picked" && (
        <PickedPhotosField
          idPrefix={id("pick")}
          picked={s.picked ?? []}
          onChange={(picked) => patch({ picked })}
        />
      )}
      {s.source === "folders" && (
        <FoldersField
          idPrefix={id("folders")}
          folders={s.folders ?? []}
          onChange={(folders) => patch({ folders })}
        />
      )}
      {s.source === "recent" && (
        <Field label="Taken in the last (days)" htmlFor={id("days")}>
          <input
            id={id("days")}
            type="number"
            min={1}
            max={365}
            className="w-full rounded border bg-card px-2 py-1.5 text-sm"
            value={s.recentDays ?? 30}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              patch({ recentDays: Number.isNaN(n) ? null : Math.min(365, Math.max(1, n)) });
            }}
            data-testid={id("days")}
          />
        </Field>
      )}
      {s.source === "types" && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-muted-foreground">Photo types</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {PHOTO_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={types.includes(t)}
                  onChange={(e) =>
                    patch({
                      types: e.target.checked ? [...types, t] : types.filter((x) => x !== t),
                    })
                  }
                  data-testid={id(`type-${t}`)}
                />
                {PHOTO_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {s.source === "grades" && (
        <Field label="Grades (comma separated)" htmlFor={id("grades")}>
          <input
            id={id("grades")}
            className="w-full rounded border bg-card px-2 py-1.5 text-sm"
            placeholder="A Grade, B Grade"
            defaultValue={(s.grades ?? []).join(", ")}
            onBlur={(e) =>
              patch({
                grades: e.target.value
                  .split(",")
                  .map((g) => g.trim())
                  .filter(Boolean),
              })
            }
            data-testid={id("grades")}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Order" htmlFor={id("order")}>
          <Select
            id={id("order")}
            value={s.order}
            options={
              s.source === "picked"
                ? { manual: "As picked", random: "Random", newest: "Newest first" }
                : { random: "Random", newest: "Newest first" }
            }
            onChange={(order) => patch({ order })}
          />
        </Field>
        <Field label="Photos each time" htmlFor={id("per")}>
          <select
            id={id("per")}
            className="w-full rounded border bg-card px-2 py-1.5 text-sm"
            value={s.perPass}
            onChange={(e) => patch({ perPass: Number(e.target.value) })}
            data-testid={id("per")}
          >
            {[...new Set([...PER_PASS, s.perPass])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Seconds per photo" htmlFor={id("secs")}>
          <select
            id={id("secs")}
            className="w-full rounded border bg-card px-2 py-1.5 text-sm"
            value={s.secondsPerPhoto}
            onChange={(e) => patch({ secondsPerPhoto: Number(e.target.value) })}
            data-testid={id("secs")}
          >
            {[...new Set([...SECONDS, s.secondsPerPhoto])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={s.captions}
            onChange={(e) => patch({ captions: e.target.checked })}
            data-testid={id("captions")}
          />
          Grade and season captions
        </label>
        <Field label="Framing" htmlFor={id("frame")}>
          <Select
            id={id("frame")}
            value={s.frame ?? "auto"}
            options={{
              auto: "Smart: fill when nothing important is cut",
              fill: "Always fill the screen",
              whole: "Always the whole photo",
            }}
            onChange={(frame) => patch({ frame })}
          />
          {(s.frame ?? "auto") !== "whole" ? (
            <p className="text-[11px] text-muted-foreground">
              Crops aim at each photo’s focus area (set it in the photo library).
            </p>
          ) : null}
        </Field>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
          <input
            type="checkbox"
            checked={s.crossfade !== false}
            onChange={(e) => patch({ crossfade: e.target.checked })}
            data-testid={id("crossfade")}
          />
          Cross-fade between photos
        </label>
      </div>
      <Field label="Photo interludes" htmlFor={id("interlude")}>
        <select
          id={id("interlude")}
          className="w-full rounded border bg-card px-2 py-1.5 text-sm"
          value={s.interludeEvery ?? ""}
          onChange={(e) =>
            patch({ interludeEvery: e.target.value ? Number(e.target.value) : null })
          }
          data-testid={id("interlude")}
        >
          <option value="">Off</option>
          {INTERLUDE_EVERY.map((n) => (
            <option key={n} value={n}>
              One photo after {n === 1 ? "every board" : `every ${n} boards`}
            </option>
          ))}
        </select>
      </Field>
      {s.interludeEvery ? (
        <p className="text-[11px] text-muted-foreground">
          Between boards the TV also shows one photo from this slideshow, even when the slideshow
          itself isn’t in the rotation.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-[11px] text-muted-foreground" data-testid={id("count")}>
          {count == null
            ? "Save to load this slideshow's photos."
            : count
              ? `${count} photo${count === 1 ? "" : "s"} match. Changes to the filter apply once saved.`
              : "No photos match yet, so the TV skips this slideshow."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => form.removeSlideshow(s.id)}
          data-testid={id("delete")}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete slideshow
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: Partial<Record<T, string>>;
  onChange: (v: T) => void;
}) {
  return (
    <select
      id={id}
      className="w-full rounded border bg-card px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      data-testid={id}
    >
      {(Object.keys(options) as T[]).map((k) => (
        <option key={k} value={k}>
          {options[k]}
        </option>
      ))}
    </select>
  );
}
