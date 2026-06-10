import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Download, Loader2, RotateCw, Film, ImageIcon } from "lucide-react";
import {
  useGetPlayer,
  getGetPlayerQueryKey,
  useListCaps,
  getListCapsQueryKey,
  useListPlayerImages,
  getListPlayerImagesQueryKey,
  getGetTradingCardSettingsQueryKey,
  useGetTradingCardSettings,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { buildTradingCardData } from "@/lib/trading-card";
import {
  exportCardPng,
  encodeCardVideo,
  snapshotBitmap,
  canExportVideo,
  videoFormatLabel,
  type CardVideoFrame,
} from "@/lib/trading-card-export";
import { CARD_W, CARD_H, type Phase } from "@/components/trading-card/constants";
import { activePhases, phaseDurations } from "@/components/trading-card/stat-helpers";
import { ScaledCard } from "@/components/trading-card/card-pieces";
import { CardFront, CardBack, CardPhaseFrame } from "@/components/trading-card/card-faces";

export { CARD_W, CARD_H } from "@/components/trading-card/constants";
export { CardFront, CardBack, CardPhaseFrame } from "@/components/trading-card/card-faces";

export function TradingCardModal({
  playerId,
  open,
  onOpenChange,
}: {
  playerId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: player, isLoading } = useGetPlayer(playerId, {
    query: { enabled: open && !!playerId, queryKey: getGetPlayerQueryKey(playerId) },
  });
  const { data: caps, isLoading: capsLoading } = useListCaps({
    query: { enabled: open, queryKey: getListCapsQueryKey() },
  });
  const { data: images } = useListPlayerImages(playerId, {
    query: { enabled: open && !!playerId, queryKey: getListPlayerImagesQueryKey(playerId) },
  });
  // Global, admin-chosen card contents (which stats + which awards show on EVERY card).
  const { data: cardSettings } = useGetTradingCardSettings({
    query: { enabled: open, queryKey: getGetTradingCardSettingsQueryKey() },
  });

  // Admin can pick which gallery image the card uses; defaults to the player's
  // default photo (players.image_url, mirrored by the gallery default).
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setSelectedImageUrl(null);
      return;
    }
    const def = images?.find((i) => i.isDefault) ?? images?.[0];
    setSelectedImageUrl(def?.imageUrl ?? null);
  }, [open, images]);

  const data = useMemo(
    () =>
      player && caps
        ? buildTradingCardData(player, caps, selectedImageUrl, cardSettings)
        : null,
    [player, caps, selectedImageUrl, cardSettings],
  );

  const [flipped, setFlipped] = useState(false);
  const [tab, setTab] = useState<"card" | "video">("card");
  const [capturePhase, setCapturePhase] = useState<Phase>("intro");
  const [pngBusy, setPngBusy] = useState<"front" | "back" | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setFlipped(false);
      setTab("card");
      setError(null);
      setProgress(0);
    }
  }, [open]);

  const fileBase = data ? data.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "player";
  const videoOk = canExportVideo();

  async function handlePng(side: "front" | "back") {
    const node = side === "front" ? frontRef.current : backRef.current;
    if (!node) return;
    setPngBusy(side);
    setError(null);
    try {
      await exportCardPng(node, `hhcc-card-${fileBase}-${side}.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export the image.");
    } finally {
      setPngBusy(null);
    }
  }

  async function handleVideo() {
    if (!data || !captureRef.current) return;
    setVideoBusy(true);
    setError(null);
    setProgress(0);
    try {
      const phases = activePhases(data);
      const durations = phaseDurations(phases);
      const frames: CardVideoFrame[] = [];
      if (document.fonts?.ready) await document.fonts.ready;
      for (let i = 0; i < phases.length; i++) {
        flushSync(() => setCapturePhase(phases[i]));
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        const bmp = await snapshotBitmap(captureRef.current!, 2);
        frames.push({ bitmap: bmp, durationMs: durations[i] });
        setProgress(Math.round(((i + 1) / phases.length) * 70));
      }
      setProgress(75);
      await encodeCardVideo(frames, CARD_W * 2, CARD_H * 2, `hhcc-card-${fileBase}`);
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export the video.");
    } finally {
      setVideoBusy(false);
      setCapturePhase("intro");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Player Trading Card</DialogTitle>
          <DialogDescription className="sr-only">
            Download a two-sided player trading card as an image or animated video.
          </DialogDescription>
        </DialogHeader>

        {isLoading || capsLoading || !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "card" | "video")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="card">
                <ImageIcon className="mr-1.5 h-4 w-4" /> Card
              </TabsTrigger>
              <TabsTrigger value="video">
                <Film className="mr-1.5 h-4 w-4" /> Video
              </TabsTrigger>
            </TabsList>

            <TabsContent value="card" className="mt-4">
              <div className="flex flex-col items-center gap-4">
                <div style={{ perspective: 1600 }}>
                  <div
                    onClick={() => setFlipped((f) => !f)}
                    style={{
                      width: CARD_W * 0.72,
                      height: CARD_H * 0.72,
                      position: "relative",
                      transformStyle: "preserve-3d",
                      transition: "transform 0.7s cubic-bezier(0.4,0.2,0.2,1)",
                      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}>
                      <ScaledCard scale={0.72}>
                        <CardFront data={data} />
                      </ScaledCard>
                    </div>
                    <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                      <ScaledCard scale={0.72}>
                        <CardBack data={data} />
                      </ScaledCard>
                    </div>
                  </div>
                </div>

                {images && images.length > 1 && (
                  <div className="flex w-full flex-wrap items-center justify-center gap-2">
                    {images.map((img) => {
                      const selected = selectedImageUrl === img.imageUrl;
                      return (
                        <button
                          key={img.id}
                          type="button"
                          title={img.isDefault ? "Default photo" : undefined}
                          className={`h-12 w-12 overflow-hidden rounded border-2 ${
                            selected ? "border-primary" : "border-muted"
                          }`}
                          onClick={() => setSelectedImageUrl(img.imageUrl)}
                        >
                          <img
                            src={img.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex w-full flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setFlipped((f) => !f)}>
                    <RotateCw className="mr-1.5 h-4 w-4" /> Flip
                  </Button>
                  <Button size="sm" onClick={() => handlePng("front")} disabled={pngBusy !== null}>
                    {pngBusy === "front" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                    Front PNG
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handlePng("back")} disabled={pngBusy !== null}>
                    {pngBusy === "back" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                    Back PNG
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="video" className="mt-4">
              <div className="flex flex-col items-center gap-4">
                <ScaledCard scale={0.62}>
                  <CardPhaseFrame data={data} phase={videoBusy ? capturePhase : "intro"} />
                </ScaledCard>
                {videoOk ? (
                  <>
                    <Button onClick={handleVideo} disabled={videoBusy} className="w-full">
                      {videoBusy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                      {videoBusy ? `Rendering… ${progress}%` : `Download Video (${videoFormatLabel()})`}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      An ~18 second animated card revealing {data.name.split(" ")[0]}'s career stats.
                    </p>
                  </>
                ) : (
                  <p className="text-center text-sm text-muted-foreground">
                    Video export isn't supported in this browser. The PNG card is available on the Card tab.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        {error && <p className="text-center text-sm text-destructive">{error}</p>}

        {/* Off-screen full-resolution nodes for export */}
        {data && (
          <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none", opacity: 0 }} aria-hidden>
            <div ref={frontRef}>
              <CardFront data={data} />
            </div>
            <div ref={backRef}>
              <CardBack data={data} />
            </div>
            <div ref={captureRef}>
              <CardPhaseFrame data={data} phase={capturePhase} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
