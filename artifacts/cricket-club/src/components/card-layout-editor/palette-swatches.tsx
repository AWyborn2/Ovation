import { useEffect, useState } from "react";
import { normaliseHex } from "./utils";

// Brand palette — quick on-brand colour presets (senior gold + junior brown
// chrome). Admins aren't limited to these: PaletteSwatches also exposes a colour
// picker and a hex-code field so any colour can be entered.
const PALETTE: { value: string; label: string }[] = [
  { value: "#FBAC27", label: "Gold" },
  { value: "#F5F2E8", label: "Cream" },
  { value: "#42342B", label: "Brown" },
  { value: "#FFFFFF", label: "White" },
  { value: "#1A1A1A", label: "Black" },
];

export function PaletteSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [hex, setHex] = useState(value || "");
  useEffect(() => setHex(value || ""), [value]);
  const commit = (raw: string) => {
    const n = normaliseHex(raw);
    if (n) onChange(n);
    else setHex(value || "");
  };
  const wellValue = normaliseHex(value || "") ?? "#FBAC27";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PALETTE.map((c) => {
        const active = (value || "").toUpperCase() === c.value.toUpperCase();
        return (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(c.value)}
            className={`h-6 w-6 rounded border ${active ? "ring-2 ring-ring ring-offset-1" : ""}`}
            style={{ backgroundColor: c.value }}
          />
        );
      })}
      <input
        type="color"
        aria-label="Pick any colour"
        title="Pick any colour"
        value={wellValue}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-6 w-6 cursor-pointer rounded border bg-transparent p-0"
      />
      <input
        type="text"
        aria-label="Hex colour code"
        value={hex}
        onChange={(e) => setHex(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
        }}
        placeholder="#RRGGBB"
        spellCheck={false}
        className="h-6 w-[68px] rounded border bg-card px-1 text-[11px] uppercase"
      />
    </div>
  );
}
