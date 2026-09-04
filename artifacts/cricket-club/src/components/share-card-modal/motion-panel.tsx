import { Label } from "@/components/ui/label";
import type { MotionPreset } from "@/lib/share-card";
import { MOTION_OPTIONS, LENGTH_OPTIONS, SPEED_OPTIONS } from "./constants";
import type { MotionAudio } from "./use-motion-audio";

/** Admin motion preset + clip length / speed (canvas cards only). */
export function MotionPanel({
  motion,
  animated,
  videoSupported,
  videoFormat,
  gifSupported,
}: {
  motion: MotionAudio;
  animated: boolean;
  videoSupported: boolean;
  videoFormat: string;
  gifSupported: boolean;
}) {
  const {
    motion: preset,
    setMotion,
    setMotionTouched,
    durationMs,
    setDurationMs,
    speed,
    setSpeed,
  } = motion;
  return (
    <div className="space-y-1.5 rounded border px-3 py-2">
      <Label htmlFor="motion-select" className="text-sm">
        Motion
      </Label>
      <select
        id="motion-select"
        value={preset}
        onChange={(e) => {
          setMotionTouched(true);
          setMotion(e.target.value as MotionPreset);
        }}
        className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
      >
        {MOTION_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      {preset !== "none" && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="length-select" className="text-xs">
              Clip length
            </Label>
            <select
              id="length-select"
              value={durationMs}
              onChange={(e) => setDurationMs(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
            >
              {LENGTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="speed-select" className="text-xs">
              Speed
            </Label>
            <select
              id="speed-select"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded border bg-card text-foreground text-sm"
            >
              {SPEED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {preset === "countUp"
          ? "Numbers tick up from zero on stat values; other elements fade in."
          : "Adds an entrance animation; each element enters independently."}
        {animated && videoSupported
          ? ` Video exports as ${videoFormat}${gifSupported ? "; GIF also available" : ""}.`
          : animated && !videoSupported
            ? " Your browser can't record video; only the still image will download."
            : ""}
      </p>
    </div>
  );
}
