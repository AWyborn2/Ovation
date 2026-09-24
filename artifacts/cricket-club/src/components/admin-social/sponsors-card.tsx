import { useState } from "react";
import {
  useCreateSponsor,
  useUpdateSponsor,
  useDeleteSponsor,
  type Sponsor,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2 } from "lucide-react";
import type { CardKind } from "@/lib/share-card";
import { CardKindPicker } from "@/components/card-kind-picker";
import { EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { ImageCropDialog, SPONSOR_ASPECTS } from "@/components/admin-ui/image-crop-dialog";

/** Sponsor library: add a logo (upload and crop) and manage order / kinds / presenting. */
export function SponsorsCard({
  sponsors,
  onChanged,
}: {
  sponsors: Sponsor[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateSponsor({ mutation: { onSuccess: onChanged } });
  const remove = useDeleteSponsor({ mutation: { onSuccess: onChanged } });
  const update = useUpdateSponsor({ mutation: { onSuccess: onChanged } });

  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [activeFrom, setActiveFrom] = useState("");
  const [activeTo, setActiveTo] = useState("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [cardKinds, setCardKinds] = useState<CardKind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [logoDialogOpen, setLogoDialogOpen] = useState(false);

  const { uploadFile, isUploading } = useUpload({
    onError: (e) => setError(e.message),
  });

  const handleFile = async (file: File) => {
    setError(null);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    }
    const result = await uploadFile(file);
    if (result) {
      setLogoUrl(`/api/storage${result.objectPath}`);
    }
  };

  const add = () => {
    setError(null);
    if (!name.trim()) return setError("Name required.");
    if (isUploading) return setError("Logo is still uploading.");
    if (!logoUrl) return setError("Logo required.");
    create.mutate(
      {
        data: {
          name: name.trim(),
          logoUrl,
          link: link.trim(),
          activeFrom: activeFrom || null,
          activeTo: activeTo || null,
          cardKinds,
          displayOrder: sponsors.length,
        },
      },
      {
        onSuccess: () => {
          setName("");
          setLink("");
          setActiveFrom("");
          setActiveTo("");
          setLogoUrl("");
          setPreviewUrl("");
          setCardKinds([]);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sponsor library</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sp-name">Sponsor name</Label>
              <Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sp-link">Link (optional)</Label>
              <Input
                id="sp-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="sp-from">Active from</Label>
                <Input
                  id="sp-from"
                  type="date"
                  value={activeFrom}
                  onChange={(e) => setActiveFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sp-to">Active to</Label>
                <Input
                  id="sp-to"
                  type="date"
                  value={activeTo}
                  onChange={(e) => setActiveTo(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Show on card types</Label>
              <CardKindPicker value={cardKinds} onChange={setCardKinds} />
              <p className="text-xs text-muted-foreground">
                No specific types selected = logo shows on all card types.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Logo (PNG / SVG, transparent)</Label>
            <div className="flex flex-col items-center gap-3 rounded border border-dashed p-4">
              {previewUrl ? (
                <img src={previewUrl} alt="logo" className="max-h-24 object-contain" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading}
                onClick={() => setLogoDialogOpen(true)}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Uploading…
                  </>
                ) : previewUrl ? (
                  "Change logo"
                ) : (
                  "Upload logo"
                )}
              </Button>
              <ImageCropDialog
                open={logoDialogOpen}
                onOpenChange={setLogoDialogOpen}
                title="Sponsor logo"
                description="Drop the logo, then pick a shape and frame it. SVG logos are used as they are."
                aspects={SPONSOR_ASPECTS}
                suggestedWidth={800}
                passThrough={(f) => f.type === "image/svg+xml"}
                onCropped={handleFile}
              />
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button onClick={add} disabled={create.isPending || isUploading} className="w-full">
              Add sponsor
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {sponsors.length === 0 ? (
            <EmptyState
              title="No sponsors yet"
              message="Add a sponsor above to feature their logo on share cards."
            />
          ) : (
            sponsors.map((s) => (
              <div key={s.id} className="border rounded p-2 space-y-2">
                <div className="flex items-center gap-3">
                  <img
                    src={s.logoUrl}
                    alt={s.name}
                    className="h-10 w-16 object-contain bg-muted rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.link || "no link"} • {s.activeFrom ?? "no start"} →{" "}
                      {s.activeTo ?? "no end"}
                    </div>
                  </div>
                  <Input
                    type="number"
                    className="w-16"
                    defaultValue={s.displayOrder}
                    onBlur={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v) && v !== s.displayOrder) {
                        update.mutate({ id: s.id, data: { displayOrder: v } });
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Delete sponsor",
                          description: `Delete sponsor "${s.name}"?`,
                          confirmText: "Delete",
                          destructive: true,
                        })
                      )
                        remove.mutate({ id: s.id });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="pl-[4.75rem] space-y-2">
                  <CardKindPicker
                    value={s.cardKinds}
                    onChange={(next) => update.mutate({ id: s.id, data: { cardKinds: next } })}
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`sp-presenting-${s.id}`}
                      checked={s.isPresenting}
                      onCheckedChange={(v) =>
                        update.mutate({ id: s.id, data: { isPresenting: v } })
                      }
                    />
                    <Label htmlFor={`sp-presenting-${s.id}`} className="text-sm font-normal">
                      Presenting sponsor
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Fills the &ldquo;presented by&rdquo; line on cards (one per club).
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
