import { useEffect, useMemo, useState } from "react";
import {
  useListCardAudioTracks,
  getListCardAudioTracksQueryKey,
  type CardAudioTrack as ApiCardAudioTrack,
  type CardTemplate,
} from "@workspace/api-client-react";
import { DEFAULT_DURATION_MS, type MotionPreset } from "@/lib/share-card";
import type { Props } from "./constants";

/**
 * Motion preset + clip length / speed (admin) + background music for animated
 * exports. Motion defaults to the selected template's own preset until the
 * club picks one; everything resets when the modal closes.
 */
export function useMotionAudio({
  open,
  input,
  selectedTemplate,
}: {
  open: boolean;
  input: Props["input"];
  selectedTemplate: CardTemplate | null;
}) {
  // Motion preset. Defaults to the selected template's own preset (so an
  // animated template animates out of the box) until the club picks one.
  const [motion, setMotion] = useState<MotionPreset>("none");
  const [motionTouched, setMotionTouched] = useState(false);
  // Reset the motion choice each time the modal opens or the card changes.
  useEffect(() => {
    if (open) {
      setMotion("none");
      setMotionTouched(false);
    }
  }, [open, input]);
  useEffect(() => {
    if (!open || motionTouched) return;
    setMotion((selectedTemplate?.motionPreset as MotionPreset | undefined) ?? "none");
  }, [open, motionTouched, selectedTemplate]);

  // Admin-only clip length + speed controls (safe bounds enforced in the engine).
  const [durationMs, setDurationMs] = useState<number>(DEFAULT_DURATION_MS);
  const [speed, setSpeed] = useState<number>(1);
  useEffect(() => {
    if (!open) {
      setDurationMs(DEFAULT_DURATION_MS);
      setSpeed(1);
    }
  }, [open]);

  // Admin-only background music for animated clips. No track = silent export
  // (the default). `selectedAudioId === null` means "No music"; volume 0–1;
  // trim is the offset (ms) into the track where the clip's audio window starts.
  const audioTracksQ = useListCardAudioTracks({
    query: { enabled: open, queryKey: getListCardAudioTracksQueryKey() },
  });
  const audioTracks = (audioTracksQ.data ?? []) as ApiCardAudioTrack[];
  const [selectedAudioId, setSelectedAudioId] = useState<number | null>(null);
  const [audioVolume, setAudioVolume] = useState<number>(0.8);
  const [audioTrimStartMs, setAudioTrimStartMs] = useState<number>(0);
  const [previewSoundOn, setPreviewSoundOn] = useState<boolean>(false);
  useEffect(() => {
    if (!open) {
      setSelectedAudioId(null);
      setAudioVolume(0.8);
      setAudioTrimStartMs(0);
      setPreviewSoundOn(false);
    }
  }, [open]);
  const selectedAudioTrack = useMemo(
    () => audioTracks.find((t) => t.id === selectedAudioId) ?? null,
    [audioTracks, selectedAudioId],
  );
  // Reset the trim when the chosen track changes (offsets are track-specific).
  useEffect(() => {
    setAudioTrimStartMs(0);
  }, [selectedAudioId]);
  // The resolved audio selection threaded into render options (null = silent).
  const audioSpec = useMemo(
    () =>
      selectedAudioTrack
        ? {
            url: `/api/storage${selectedAudioTrack.url}`.replace(
              "/api/storage/api/storage",
              "/api/storage",
            ),
            volume: audioVolume,
            trimStartMs: audioTrimStartMs,
          }
        : null,
    [selectedAudioTrack, audioVolume, audioTrimStartMs],
  );

  return {
    motion,
    setMotion,
    setMotionTouched,
    durationMs,
    setDurationMs,
    speed,
    setSpeed,
    audioTracks,
    selectedAudioId,
    setSelectedAudioId,
    audioVolume,
    setAudioVolume,
    audioTrimStartMs,
    setAudioTrimStartMs,
    previewSoundOn,
    setPreviewSoundOn,
    selectedAudioTrack,
    audioSpec,
  };
}

export type MotionAudio = ReturnType<typeof useMotionAudio>;
