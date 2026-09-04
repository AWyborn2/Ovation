import { useState } from "react";
import { Upload } from "lucide-react";
import type { HonourBackground } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Input } from "@/components/ui/input";
import { TEXTURES } from "../theme";

/**
 * Background source picker — none / image URL (with upload) / built-in texture.
 * Emits a HonourBackground (or null to clear).
 */
export function BackgroundPicker({
  value,
  onChange,
  testId,
}: {
  value?: HonourBackground | null;
  onChange: (bg: HonourBackground | null) => void;
  testId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const upload = useUpload({ onError: (e) => setError(e.message) });
  const kind = value?.kind ?? "none";

  const handleFile = async (file: File) => {
    setError(null);
    const r = await upload.uploadFile(file);
    if (r) onChange({ kind: "url", value: `/api/storage${r.objectPath}` });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Background</span>
        <select
          className="px-2 py-1 rounded border bg-background text-sm"
          value={kind}
          onChange={(e) => {
            const k = e.target.value;
            if (k === "none") onChange(null);
            else if (k === "texture")
              onChange({ kind: "texture", value: TEXTURES[0]!.id });
            else onChange({ kind: "url", value: value?.kind === "url" ? value.value : "" });
          }}
          data-testid={testId}
        >
          <option value="none">None</option>
          <option value="url">Image</option>
          <option value="texture">Texture</option>
        </select>
      </div>

      {kind === "url" && (
        <div className="space-y-2">
          <Input
            value={value?.value ?? ""}
            placeholder="https://… or upload below"
            onChange={(e) => onChange({ kind: "url", value: e.target.value })}
            className="text-xs"
            data-testid={testId ? `${testId}-url` : undefined}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs inline-flex items-center gap-1.5 cursor-pointer text-primary">
              <Upload className="h-3.5 w-3.5" />
              {upload.isUploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                disabled={upload.isUploading}
                onChange={(e) =>
                  e.target.files?.[0] && handleFile(e.target.files[0])
                }
                data-testid={testId ? `${testId}-file` : undefined}
              />
            </label>
            {value?.value && (
              <img
                src={value.value}
                alt="bg preview"
                className="h-8 w-12 object-cover rounded border"
              />
            )}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {kind === "texture" && (
        <div className="flex flex-wrap gap-2">
          {TEXTURES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ kind: "texture", value: t.id })}
              className={`h-10 w-14 rounded border text-[10px] grid place-items-end p-0.5 ${
                value?.value === t.id ? "ring-2 ring-primary" : ""
              }`}
              style={{ background: t.css, backgroundColor: "#e5e5e5" }}
              title={t.label}
              data-testid={testId ? `${testId}-tex-${t.id}` : undefined}
            >
              <span className="bg-background/70 px-1 rounded">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
