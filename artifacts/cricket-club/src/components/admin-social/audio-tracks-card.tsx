import { useRef, useState } from "react";
import {
  useCreateCardAudioTrack,
  useUpdateCardAudioTrack,
  useDeleteCardAudioTrack,
  type CardAudioTrack,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

/** Background music library for animated card exports. */
export function AudioTracksCard({
  tracks,
  onChanged,
}: {
  tracks: CardAudioTrack[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateCardAudioTrack({ mutation: { onSuccess: onChanged } });
  const update = useUpdateCardAudioTrack({ mutation: { onSuccess: onChanged } });
  const remove = useDeleteCardAudioTrack({ mutation: { onSuccess: onChanged } });

  const [name, setName] = useState("");
  const [trackUrl, setTrackUrl] = useState<string>("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useUpload({ onError: (e) => setError(e.message) });

  const handleFile = async (file: File) => {
    setError(null);
    setDurationMs(null);
    const r = await upload.uploadFile(file);
    if (r) {
      setTrackUrl(`/api/storage${r.objectPath}`);
      if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, ""));
      // Read the track length from the file so the trim UI knows the range.
      try {
        const objUrl = URL.createObjectURL(file);
        const probe = new Audio();
        probe.preload = "metadata";
        probe.src = objUrl;
        probe.addEventListener("loadedmetadata", () => {
          if (Number.isFinite(probe.duration)) {
            setDurationMs(Math.round(probe.duration * 1000));
          }
          URL.revokeObjectURL(objUrl);
        });
      } catch {
        /* duration is optional */
      }
    }
  };

  const reset = () => {
    setName("");
    setTrackUrl("");
    setDurationMs(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const add = () => {
    setError(null);
    if (!name.trim()) return setError("Track name required.");
    if (!trackUrl) return setError("Upload an audio file first.");
    if (upload.isUploading) return setError("Audio is still uploading.");
    create.mutate(
      {
        data: {
          name: name.trim(),
          url: trackUrl,
          durationMs,
          displayOrder: tracks.length,
        },
      },
      { onSuccess: reset },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card music tracks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Background music for animated video clips. Admins pick a track (with
          volume + trim) in the share dialog; the exported MP4/WebM includes it.
          Only upload tracks you are licensed to use.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="au-name">Track name</Label>
              <Input
                id="au-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Upbeat Stadium Loop"
              />
            </div>
            {durationMs != null && (
              <div className="text-xs text-muted-foreground">
                Length: {(durationMs / 1000).toFixed(1)}s
              </div>
            )}
            {error && <div className="text-sm text-destructive">{error}</div>}
            <Button
              onClick={add}
              disabled={create.isPending || upload.isUploading || !trackUrl}
              className="w-full"
            >
              Add track
            </Button>
          </div>
          <div className="space-y-1">
            <Label>Audio file</Label>
            <div className="border border-dashed rounded p-3 flex flex-col items-center gap-2">
              {trackUrl ? (
                <audio src={trackUrl} controls className="w-full" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/mp4,audio/x-m4a"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                disabled={upload.isUploading}
                className="text-xs"
              />
              {upload.isUploading && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {tracks.length === 0 ? (
            <EmptyState
              title="No music tracks yet"
              message="Upload a track above to offer background music on animated clips."
            />
          ) : (
            tracks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 border rounded p-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {t.name}
                    {t.isCurated && (
                      <span className="text-[10px] uppercase tracking-wide bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                        Library
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.durationMs ? `${(t.durationMs / 1000).toFixed(1)}s` : "length unknown"}
                  </div>
                </div>
                <audio src={`/api/storage${t.url}`.replace("/api/storage/api/storage", "/api/storage")} controls className="h-8 max-w-[14rem]" />
                <Input
                  type="number"
                  className="w-16"
                  defaultValue={t.displayOrder}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v !== t.displayOrder) {
                      update.mutate({ id: t.id, data: { displayOrder: v } });
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete track",
                        description: `Delete music track "${t.name}"?`,
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
