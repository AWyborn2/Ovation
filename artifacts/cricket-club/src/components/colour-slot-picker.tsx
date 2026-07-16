import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { lookupPantone } from "@/lib/pantone";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Parse a valid "#rrggbb" hex string into {r, g, b} (0–255 each), or null. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!HEX_RE.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Build a "#rrggbb" hex string from r, g, b components (0–255 each). */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

interface Props {
  label: string;
  /** Optional helper text shown beneath the label, e.g. "Buttons, nav highlights". */
  description?: string;
  value: string | null;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

/**
 * A colour input that lets the user set a colour via any of:
 *   - A native `<input type="color">` swatch
 *   - A `#rrggbb` hex text field
 *   - Individual R / G / B number inputs (0–255)
 *   - A Pantone code lookup (e.g. "PANTONE 485 C" or "485 C")
 *
 * All inputs stay independent and always usable. Changing any one syncs the
 * rest. `onChange` fires with the current valid hex whenever any input commits
 * a parseable value.
 */
export function ColourSlotPicker({ label, description, value, onChange, disabled }: Props) {
  const safeHex = value && HEX_RE.test(value) ? value : "#000000";
  const rgb = hexToRgb(safeHex) ?? { r: 0, g: 0, b: 0 };

  const [hexText, setHexText] = useState(value ?? "");
  const [pantoneCode, setPantoneCode] = useState("");
  const [pantoneStatus, setPantoneStatus] = useState<"idle" | "found" | "notfound">("idle");

  const syncFromHex = (raw: string) => {
    setHexText(raw);
    if (HEX_RE.test(raw)) {
      onChange(raw);
    }
  };

  const handleRgbChange = (channel: "r" | "g" | "b", raw: string) => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return;
    const next = { ...rgb, [channel]: Math.max(0, Math.min(255, n)) };
    const hex = rgbToHex(next.r, next.g, next.b);
    setHexText(hex);
    onChange(hex);
  };

  const handlePantoneLookup = () => {
    if (!pantoneCode.trim()) return;
    const found = lookupPantone(pantoneCode);
    if (found) {
      setPantoneStatus("found");
      setHexText(found);
      onChange(found);
    } else {
      setPantoneStatus("notfound");
    }
  };

  const handlePantoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePantoneLookup();
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safeHex}
          onChange={(e) => syncFromHex(e.target.value)}
          disabled={disabled}
          aria-label={`${label} colour swatch`}
          className="h-9 w-9 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5"
        />
        <div className="flex-1">
          <Label className="sr-only" htmlFor={`hex-${label}`}>
            Hex
          </Label>
          <Input
            id={`hex-${label}`}
            value={hexText}
            onChange={(e) => syncFromHex(e.target.value)}
            placeholder="#1A3350"
            disabled={disabled}
            className="font-mono"
            aria-label={`${label} hex value`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(["r", "g", "b"] as const).map((ch) => (
          <div key={ch} className="space-y-0.5">
            <Label
              htmlFor={`${label}-${ch}`}
              className="text-[10px] font-medium text-muted-foreground uppercase"
            >
              {ch.toUpperCase()}
            </Label>
            <Input
              id={`${label}-${ch}`}
              type="number"
              min={0}
              max={255}
              value={rgb[ch]}
              onChange={(e) => handleRgbChange(ch, e.target.value)}
              disabled={disabled}
              className="h-8 px-2 font-mono text-sm"
              aria-label={`${label} ${ch.toUpperCase()} channel`}
            />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] font-medium text-muted-foreground uppercase">
          Pantone code
        </Label>
        <div className="flex gap-1.5">
          <Input
            value={pantoneCode}
            onChange={(e) => {
              setPantoneCode(e.target.value);
              setPantoneStatus("idle");
            }}
            onKeyDown={handlePantoneKeyDown}
            placeholder="e.g. 485 C"
            disabled={disabled}
            className="font-mono text-sm"
            aria-label={`${label} Pantone code`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePantoneLookup}
            disabled={disabled || !pantoneCode.trim()}
          >
            Look up
          </Button>
        </div>
        {pantoneStatus === "notfound" && (
          <p className="text-xs text-destructive">Pantone code not found.</p>
        )}
        {pantoneStatus === "found" && (
          <p className="text-xs text-green-600 dark:text-green-500">
            Matched — hex updated.
          </p>
        )}
      </div>
    </div>
  );
}
