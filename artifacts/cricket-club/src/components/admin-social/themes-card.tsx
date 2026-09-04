import { useRef, useState } from "react";
import {
  useCreateCardTheme,
  useUpdateCardTheme,
  useDeleteCardTheme,
  type CardTheme,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

const DEFAULT_THEME_COLORS = {
  bgDark: "#322F3D",
  bgPanel: "#3F3C4C",
  accent: "#FBD039",
  textLight: "#F5F2E8",
};

export function ThemesCard({
  themes,
  onChanged,
}: {
  themes: CardTheme[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateCardTheme({ mutation: { onSuccess: onChanged } });
  const update = useUpdateCardTheme({ mutation: { onSuccess: onChanged } });
  const remove = useDeleteCardTheme({ mutation: { onSuccess: onChanged } });

  const [name, setName] = useState("");
  const [colors, setColors] = useState({ ...DEFAULT_THEME_COLORS });
  const [bgImageUrl, setBgImageUrl] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const bgUpload = useUpload({ onError: (e) => setError(e.message) });
  const logoUpload = useUpload({ onError: (e) => setError(e.message) });

  const handleBg = async (file: File) => {
    setError(null);
    const r = await bgUpload.uploadFile(file);
    if (r) setBgImageUrl(`/api/storage${r.objectPath}`);
  };
  const handleLogo = async (file: File) => {
    setError(null);
    const r = await logoUpload.uploadFile(file);
    if (r) setLogoUrl(`/api/storage${r.objectPath}`);
  };

  const reset = () => {
    setName("");
    setColors({ ...DEFAULT_THEME_COLORS });
    setBgImageUrl("");
    setLogoUrl("");
    if (bgRef.current) bgRef.current.value = "";
    if (logoRef.current) logoRef.current.value = "";
  };

  const add = () => {
    setError(null);
    if (!name.trim()) return setError("Theme name required.");
    if (bgUpload.isUploading || logoUpload.isUploading) return setError("Image is still uploading.");
    create.mutate(
      {
        data: {
          name: name.trim(),
          bgDark: colors.bgDark,
          bgPanel: colors.bgPanel,
          accent: colors.accent,
          textLight: colors.textLight,
          backgroundImageUrl: bgImageUrl || null,
          logoUrl: logoUrl || null,
          displayOrder: themes.length,
        },
      },
      { onSuccess: reset },
    );
  };

  const colorFields: { key: keyof typeof colors; label: string }[] = [
    { key: "bgDark", label: "Background" },
    { key: "bgPanel", label: "Panel" },
    { key: "accent", label: "Accent" },
    { key: "textLight", label: "Text" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card themes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="th-name">Theme name</Label>
              <Input id="th-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finals Night" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {colorFields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colors[f.key]}
                      onChange={(e) => setColors((c) => ({ ...c, [f.key]: e.target.value }))}
                      className="h-9 w-10 rounded border bg-transparent p-0.5"
                    />
                    <Input
                      value={colors[f.key]}
                      onChange={(e) => setColors((c) => ({ ...c, [f.key]: e.target.value }))}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Background image (optional)</Label>
              <div className="border border-dashed rounded p-3 flex flex-col items-center gap-2">
                {bgImageUrl ? (
                  <img src={bgImageUrl} alt="background" className="max-h-20 object-cover rounded" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
                <input
                  ref={bgRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleBg(e.target.files[0])}
                  disabled={bgUpload.isUploading}
                  className="text-xs"
                />
                {bgUpload.isUploading && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Logo override (optional)</Label>
              <div className="border border-dashed rounded p-3 flex flex-col items-center gap-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="logo" className="max-h-16 object-contain" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
                  disabled={logoUpload.isUploading}
                  className="text-xs"
                />
                {logoUpload.isUploading && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                  </div>
                )}
              </div>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button onClick={add} disabled={create.isPending || bgUpload.isUploading || logoUpload.isUploading} className="w-full">
              Add theme
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {themes.length === 0 ? (
            <EmptyState
              title="No themes yet"
              message="Create a theme above to restyle your share cards."
            />
          ) : (
            themes.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border rounded p-2">
                <div className="flex gap-1">
                  {[t.bgDark, t.bgPanel, t.accent, t.textLight].map((c, i) => (
                    <span key={i} className="h-8 w-4 rounded-sm border" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {t.name}
                    {t.isDefault && (
                      <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.backgroundImageUrl ? "bg image • " : ""}
                    {t.logoUrl ? "custom logo" : "club logo"}
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
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete theme",
                        description: `Delete theme "${t.name}"?`,
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
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
