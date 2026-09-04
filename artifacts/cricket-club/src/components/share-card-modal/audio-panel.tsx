import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MotionAudio } from "./use-motion-audio";

/** Admin background-music picker for animated exports. */
export function AudioPanel({ audio }: { audio: MotionAudio }) {
  const {
    audioTracks,
    selectedAudioId,
    setSelectedAudioId,
    selectedAudioTrack,
    audioVolume,
    setAudioVolume,
    durationMs,
    audioTrimStartMs,
    setAudioTrimStartMs,
    previewSoundOn,
    setPreviewSoundOn,
  } = audio;
  return (
    <div className="space-y-2 rounded border px-3 py-2">
      <Label htmlFor="audio-select" className="text-sm">
        Background music
      </Label>
      <select
        id="audio-select"
        value={selectedAudioId ?? ""}
        onChange={(e) => setSelectedAudioId(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
      >
        <option value="">No music (silent)</option>
        {audioTracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.isCurated ? " (library)" : ""}
          </option>
        ))}
      </select>
      {selectedAudioTrack && (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="audio-volume" className="text-xs">
                Volume
              </Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(audioVolume * 100)}%
              </span>
            </div>
            <input
              id="audio-volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioVolume}
              onChange={(e) => setAudioVolume(Number(e.target.value))}
              className="w-full"
            />
          </div>
          {selectedAudioTrack.durationMs && selectedAudioTrack.durationMs > durationMs && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="audio-trim" className="text-xs">
                  Start from
                </Label>
                <span className="text-xs text-muted-foreground">
                  {(audioTrimStartMs / 1000).toFixed(1)}s
                </span>
              </div>
              <input
                id="audio-trim"
                type="range"
                min={0}
                max={Math.max(0, selectedAudioTrack.durationMs - durationMs)}
                step={500}
                value={Math.min(
                  audioTrimStartMs,
                  Math.max(0, selectedAudioTrack.durationMs - durationMs),
                )}
                onChange={(e) => setAudioTrimStartMs(Number(e.target.value))}
                className="w-full"
              />
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="audio-preview-toggle" className="text-xs">
              Play sound in preview
            </Label>
            <Switch
              id="audio-preview-toggle"
              checked={previewSoundOn}
              onCheckedChange={setPreviewSoundOn}
            />
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {selectedAudioTrack
          ? "The exported video clip includes this track, mixed and trimmed to the clip. GIFs stay silent."
          : "Pick a track to add background music to the exported video clip. No track = silent (default)."}
      </p>
    </div>
  );
}
