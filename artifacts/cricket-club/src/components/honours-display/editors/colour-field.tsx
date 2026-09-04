import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** A colour swatch + hex text input pair. Empty value = inherit. */
export function ColourField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded border bg-transparent p-0.5"
          data-testid={testId ? `${testId}-swatch` : undefined}
        />
        <Input
          value={value}
          placeholder="inherit"
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
          data-testid={testId}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onChange("")}
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </label>
  );
}
