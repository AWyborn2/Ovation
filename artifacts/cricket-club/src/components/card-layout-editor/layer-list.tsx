import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { EditorLayer } from "@/lib/share-card";

/** Z-ordered layer list with show/hide and restack controls. */
export function LayerList({
  layers,
  selectedId,
  onSelect,
  onToggleHidden,
  onRestack,
}: {
  layers: EditorLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleHidden: (id: string, hidden: boolean) => void;
  onRestack: (id: string, dir: "up" | "down") => void;
}) {
  const ordered = [...layers].sort((a, b) => b.z - a.z);
  return (
    <div className="space-y-1 rounded border p-2">
      <Label className="text-[11px] text-muted-foreground">Layers (top first)</Label>
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {ordered.map((l) => (
          <div
            key={l.id}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs ${
              l.id === selectedId ? "bg-primary/15" : "hover:bg-muted"
            }`}
          >
            <button
              type="button"
              className="flex-1 truncate text-left"
              onClick={() => onSelect(l.id)}
            >
              {l.label}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onToggleHidden(l.id, !l.hidden)}
              title={l.hidden ? "Show" : "Hide"}
            >
              {l.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onRestack(l.id, "up")}
              title="Bring forward"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onRestack(l.id, "down")}
              title="Send backward"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
