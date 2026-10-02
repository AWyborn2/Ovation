import type { CardSetOptions } from "@/lib/card-sets/plan";

/**
 * A balanced set's options in the Studio editor (plan 2026-10-01-001): the
 * cover card (auto / on / off) and whether men's, women's and other grades
 * prefer their own cards. The split itself is always even.
 */
export function SetOptionsBar({
  options,
  onChange,
  slideCount,
}: {
  options: CardSetOptions;
  onChange: (next: CardSetOptions) => void;
  slideCount: number;
}) {
  const cover = options.cover === undefined ? "auto" : options.cover ? "on" : "off";
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--ed-ink2)]">
      <span className="font-semibold">
        {slideCount > 1 ? `Posts as ${slideCount} slides` : "Posts as one card"}
      </span>
      <label className="flex items-center gap-2">
        Cover card
        <select
          className="rounded border border-white/15 bg-transparent px-2 py-1"
          value={cover}
          onChange={(e) =>
            onChange({
              cover: e.target.value === "auto" ? undefined : e.target.value === "on",
            })
          }
        >
          <option value="auto">Automatic</option>
          <option value="on">Always</option>
          <option value="off">Never</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={(options.grouping ?? "auto") === "auto"}
          onChange={(e) => onChange({ grouping: e.target.checked ? "auto" : "none" })}
        />
        Keep men&apos;s and women&apos;s grades on their own cards when it splits evenly
      </label>
    </div>
  );
}
