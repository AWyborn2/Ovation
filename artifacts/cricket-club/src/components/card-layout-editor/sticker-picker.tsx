import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  STICKER_ASSETS,
  STICKER_CATEGORIES,
  searchStickers,
  renderStickerThumb,
  type StickerAsset,
  type StickerCategory,
} from "@/lib/sticker-library";

/** Searchable built-in sticker library; click to add or drag onto the canvas. */
export function StickerPicker({ onPick }: { onPick: (asset: StickerAsset) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<StickerCategory | "all">("all");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries: Array<[string, string]> = [];
      for (const a of STICKER_ASSETS) {
        try {
          const url = await renderStickerThumb(a, "#FBAC27", 88);
          if (url) entries.push([a.id, url]);
        } catch {
          /* skip thumbs that fail to render */
        }
        if (cancelled) return;
      }
      if (!cancelled) setThumbs(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = searchStickers(cat, q);

  return (
    <div className="space-y-2 rounded border p-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search stickers…"
        className="h-8 text-xs"
      />
      <div className="flex flex-wrap gap-1">
        {[{ id: "all", label: "All" }, ...STICKER_CATEGORIES].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id as StickerCategory | "all")}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              cat === c.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto">
        {list.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.name}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-sticker", a.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onPick(a)}
            className="flex aspect-square items-center justify-center rounded border bg-card p-1 hover:border-primary"
          >
            {thumbs[a.id] ? (
              <img
                src={thumbs[a.id]}
                alt={a.name}
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </button>
        ))}
        {list.length === 0 && (
          <p className="col-span-3 py-4 text-center text-[11px] text-muted-foreground">
            No stickers found
          </p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">Click to add, or drag onto the card.</p>
    </div>
  );
}
