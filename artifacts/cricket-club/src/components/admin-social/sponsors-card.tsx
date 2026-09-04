import { useRef, useState } from "react";
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

/** Sponsor library: add a logo (drag-drop upload) and manage order / kinds / presenting. */
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
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
          if (fileRef.current) fileRef.current.value = "";
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
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!isUploading) setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (isUploading) return;
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`border border-dashed rounded p-4 flex flex-col items-center gap-3 transition-colors ${
                isDragging ? "border-primary bg-primary/5" : ""
              }`}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="logo" className="max-h-24 object-contain" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp,image/jpeg"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                disabled={isUploading}
                className="text-xs"
              />
              {isUploading && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                </div>
              )}
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
