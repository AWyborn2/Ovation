import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Star, Trophy, Download, Loader2, RotateCw, Film, ImageIcon } from "lucide-react";
import { useGetPlayer, getGetPlayerQueryKey, useListCaps, getListCapsQueryKey } from "@workspace/api-client-react";
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { buildTradingCardData, type TradingCardData, type CardRole } from "@/lib/trading-card";
import {
  exportCardPng,
  encodeCardVideo,
  snapshotBitmap,
  canExportVideo,
  videoFormatLabel,
  type CardVideoFrame,
} from "@/lib/trading-card-export";

const CHARCOAL = "#333F48";
const GOLD = "#FBAC27";
const BROWN = "#41342B";

export const CARD_W = 384;
export const CARD_H = 800;

const FONT = "'Montserrat', sans-serif";

type Phase = "intro" | "mainStats" | "batting" | "bowling" | "fielding" | "premierships" | "outro";

const fmt = (v: number | string): string =>
  typeof v === "number" ? v.toLocaleString("en-AU") : v;

function mainStats(data: TradingCardData): { label: string; value: number | string }[] {
  const s = data.stats;
  const a = data.additionalStats;
  switch (data.role) {
    case "Bowler":
      return [
        { label: "Matches", value: s.matches },
        { label: "Wickets", value: s.wickets },
        { label: "Bowl Avg", value: s.bowlingAverage || "-" },
        { label: "Best", value: a.bestBowling },
      ];
    case "All-Rounder":
      return [
        { label: "Runs", value: s.runs },
        { label: "Bat Avg", value: s.battingAverage || "-" },
        { label: "Wickets", value: s.wickets },
        { label: "Bowl Avg", value: s.bowlingAverage || "-" },
      ];
    default:
      return [
        { label: "Matches", value: s.matches },
        { label: "Runs", value: s.runs },
        { label: "Bat Avg", value: s.battingAverage || "-" },
        { label: "High Score", value: a.highestScore },
      ];
  }
}

function perfBars(data: TradingCardData): { label: string; value: number; max: number }[] {
  const s = data.stats;
  const bar = (value: number, floor: number) => ({
    value,
    max: Math.max(floor, Math.ceil(value * 1.15)),
  });
  switch (data.role) {
    case "Bowler":
      return [
        { label: "5-Wicket Hauls", ...bar(s.fiveWickets, 5) },
        { label: "Wickets", ...bar(s.wickets, 100) },
      ];
    case "All-Rounder":
      return [
        { label: "Centuries", ...bar(s.centuries, 5) },
        { label: "5-Wicket Hauls", ...bar(s.fiveWickets, 5) },
      ];
    default:
      return [
        { label: "Centuries", ...bar(s.centuries, 5) },
        { label: "Half-Centuries", ...bar(s.halfCenturies, 10) },
      ];
  }
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={18}
          strokeWidth={1.5}
          style={{ color: GOLD }}
          fill={i < rating ? GOLD : "transparent"}
        />
      ))}
    </div>
  );
}

function CardSurface({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        fontFamily: FONT,
        background: `linear-gradient(160deg, ${CHARCOAL} 0%, #2a343c 55%, ${BROWN} 100%)`,
        borderRadius: 24,
        overflow: "hidden",
        position: "relative",
        color: "#fff",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        border: `1px solid rgba(251,172,39,0.35)`,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ data }: { data: TradingCardData }) {
  return (
    <div style={{ position: "relative", padding: "16px 18px", display: "flex", alignItems: "center", gap: 10 }}>
      <img src={logoUrl} alt="HHCC" crossOrigin="anonymous" style={{ width: 38, height: 38, objectFit: "contain" }} />
      <div style={{ lineHeight: 1.05 }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase" }}>
          Halls Head
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: GOLD, letterSpacing: 1.5, textTransform: "uppercase" }}>
          Cricket Club
        </div>
      </div>
      {data.number !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 74,
            height: 74,
            background: GOLD,
            clipPath: "polygon(100% 0, 0 0, 100% 100%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              textAlign: "right",
              color: CHARCOAL,
              lineHeight: 1,
            }}
          >
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
              Cap
            </div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{data.number}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerPhoto({ data, height }: { data: TradingCardData; height: number }) {
  return (
    <div
      style={{
        position: "relative",
        height,
        background: `radial-gradient(120% 80% at 50% 0%, ${BROWN} 0%, ${CHARCOAL} 70%)`,
        overflow: "hidden",
      }}
    >
      <img
        src={data.photoUrl}
        alt={data.name}
        crossOrigin="anonymous"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to top, ${CHARCOAL} 4%, rgba(51,63,72,0.0) 45%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(65,52,43,0.85)",
          color: GOLD,
          border: `1px solid ${GOLD}`,
          borderRadius: 999,
          padding: "4px 12px",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {data.role}
      </div>
      {data.debutYear !== null && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            background: "rgba(0,0,0,0.45)",
            borderRadius: 8,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          Since {data.debutYear}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, big }: { label: string; value: number | string; big?: boolean }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: big ? "14px 10px" : "10px 8px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: big ? 26 : 20, fontWeight: 900, color: GOLD, lineHeight: 1.1 }}>
        {fmt(value)}
      </div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.7)",
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function PerfBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(4, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 5 }}>
        <span style={{ color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </span>
        <span style={{ color: GOLD }}>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${GOLD}, #ffce6e)`, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 4, height: 18, background: GOLD, borderRadius: 2 }} />
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {children}
      </span>
    </div>
  );
}

function NameBlock({ data }: { data: TradingCardData }) {
  return (
    <div style={{ textAlign: "center", padding: "0 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 0.3, lineHeight: 1.1 }}>{data.name}</div>
      {data.rating !== null && (
        <div style={{ marginTop: 8 }}>
          <StarRow rating={data.rating} />
        </div>
      )}
    </div>
  );
}

export function CardFront({ data }: { data: TradingCardData }) {
  return (
    <CardSurface>
      <CardHeader data={data} />
      <PlayerPhoto data={data} height={300} />
      <div style={{ padding: "14px 18px 0" }}>
        <NameBlock data={data} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
          {mainStats(data).map((s) => (
            <StatTile key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {perfBars(data).map((b) => (
            <PerfBar key={b.label} label={b.label} value={b.value} max={b.max} />
          ))}
        </div>
      </div>
      <CardFooter />
    </CardSurface>
  );
}

function CardFooter({ flipHint }: { flipHint?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "10px 18px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.55)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span>Est. 1991</span>
      <span style={{ color: GOLD }}>{flipHint ? "Tap to flip" : "Official Trading Card"}</span>
    </div>
  );
}

export function CardBack({ data }: { data: TradingCardData }) {
  const s = data.stats;
  const a = data.additionalStats;
  const showBatting = data.role !== "Bowler";
  const showBowling = s.wickets > 0 || data.role === "Bowler" || data.role === "All-Rounder";
  const showFielding = a.catches + a.stumpings + a.runOuts > 0;
  return (
    <CardSurface>
      <CardHeader data={data} />
      <div style={{ padding: "8px 18px 56px", overflow: "hidden" }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{data.name}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: 1 }}>
            {data.role}
          </div>
        </div>

        <SectionTitle>Career</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <StatTile label="Debut" value={data.debutYear ?? "-"} />
          <StatTile label="Seasons" value={data.careerSpan ?? "-"} />
          <StatTile label="Matches" value={s.matches} />
        </div>

        {showBatting && (
          <div style={{ marginTop: 16 }}>
            <SectionTitle>Batting</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <StatTile label="Runs" value={s.runs} />
              <StatTile label="Average" value={s.battingAverage || "-"} />
              <StatTile label="High" value={a.highestScore} />
              <StatTile label="100s" value={s.centuries} />
              <StatTile label="50s" value={s.halfCenturies} />
            </div>
          </div>
        )}

        {showBowling && (
          <div style={{ marginTop: 16 }}>
            <SectionTitle>Bowling</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <StatTile label="Wickets" value={s.wickets} />
              <StatTile label="Average" value={s.bowlingAverage || "-"} />
              <StatTile label="Best" value={a.bestBowling} />
              <StatTile label="5W Hauls" value={s.fiveWickets} />
            </div>
          </div>
        )}

        {showFielding && (
          <div style={{ marginTop: 16 }}>
            <SectionTitle>Fielding</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: data.role === "Wicket-Keeper" ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
              <StatTile label="Catches" value={a.catches} />
              {data.role === "Wicket-Keeper" && <StatTile label="Stumpings" value={a.stumpings} />}
              <StatTile label="Run Outs" value={a.runOuts} />
            </div>
          </div>
        )}

        {data.achievements.premierships.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <SectionTitle>Premierships</SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {data.achievements.premierships.map((y) => (
                <span
                  key={y}
                  style={{
                    background: GOLD,
                    color: CHARCOAL,
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {y}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <CardFooter />
    </CardSurface>
  );
}

function PhaseHero({ data, title }: { data: TradingCardData; title?: string }) {
  return (
    <>
      <PlayerPhoto data={data} height={520} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70, textAlign: "center" }}>
        <NameBlock data={data} />
        {title && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: 2, textTransform: "uppercase" }}>
            {title}
          </div>
        )}
      </div>
    </>
  );
}

function PhasePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "26px 22px", display: "flex", flexDirection: "column", justifyContent: "center", height: CARD_H - 74 - 44 }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

export function CardPhaseFrame({ data, phase }: { data: TradingCardData; phase: Phase }) {
  const s = data.stats;
  const a = data.additionalStats;
  return (
    <CardSurface>
      <CardHeader data={data} />
      {phase === "intro" && <PhaseHero data={data} title="Player Card" />}
      {phase === "outro" && <PhaseHero data={data} title="Halls Head Cricket Club" />}
      {phase === "mainStats" && (
        <PhasePanel title="Career Statistics">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {mainStats(data).map((m) => (
              <StatTile key={m.label} label={m.label} value={m.value} big />
            ))}
          </div>
        </PhasePanel>
      )}
      {phase === "batting" && (
        <PhasePanel title="Batting">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <StatTile label="Runs" value={s.runs} big />
            <StatTile label="Average" value={s.battingAverage || "-"} big />
            <StatTile label="High Score" value={a.highestScore} big />
            <StatTile label="Centuries" value={s.centuries} big />
            <StatTile label="Half-Centuries" value={s.halfCenturies} big />
            <StatTile label="Matches" value={s.matches} big />
          </div>
        </PhasePanel>
      )}
      {phase === "bowling" && (
        <PhasePanel title="Bowling">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <StatTile label="Wickets" value={s.wickets} big />
            <StatTile label="Average" value={s.bowlingAverage || "-"} big />
            <StatTile label="Best Bowling" value={a.bestBowling} big />
            <StatTile label="5-Wicket Hauls" value={s.fiveWickets} big />
          </div>
        </PhasePanel>
      )}
      {phase === "fielding" && (
        <PhasePanel title="Fielding">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <StatTile label="Catches" value={a.catches} big />
            {data.role === "Wicket-Keeper" && <StatTile label="Stumpings" value={a.stumpings} big />}
            <StatTile label="Run Outs" value={a.runOuts} big />
          </div>
        </PhasePanel>
      )}
      {phase === "premierships" && (
        <PhasePanel title="Premierships">
          <div style={{ textAlign: "center" }}>
            <Trophy size={56} style={{ color: GOLD, margin: "0 auto 8px" }} />
            <div style={{ fontSize: 40, fontWeight: 900, color: GOLD }}>
              {data.achievements.premierships.length}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>
              Premierships Won
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {data.achievements.premierships.map((y) => (
                <span key={y} style={{ background: GOLD, color: CHARCOAL, borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 800 }}>
                  {y}
                </span>
              ))}
            </div>
          </div>
        </PhasePanel>
      )}
      <CardFooter />
    </CardSurface>
  );
}

function activePhases(data: TradingCardData): Phase[] {
  const s = data.stats;
  const a = data.additionalStats;
  const phases: Phase[] = ["intro", "mainStats"];
  if (data.role !== "Bowler" && s.runs > 0) phases.push("batting");
  if (s.wickets > 0) phases.push("bowling");
  if (a.catches + a.stumpings + a.runOuts > 0) phases.push("fielding");
  if (data.achievements.premierships.length > 0) phases.push("premierships");
  phases.push("outro");
  return phases;
}

function phaseDurations(phases: Phase[]): number[] {
  const weight: Record<Phase, number> = {
    intro: 2.4,
    mainStats: 3,
    batting: 2.6,
    bowling: 2.6,
    fielding: 2.2,
    premierships: 2.4,
    outro: 2.4,
  };
  const weights = phases.map((p) => weight[p]);
  const sum = weights.reduce((x, y) => x + y, 0);
  const TARGET = 18000;
  return weights.map((w) => Math.round((w / sum) * TARGET));
}

function ScaledCard({ children, scale }: { children: React.ReactNode; scale: number }) {
  return (
    <div style={{ width: CARD_W * scale, height: CARD_H * scale }}>
      <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

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

  const data = useMemo(
    () => (player && caps ? buildTradingCardData(player, caps) : null),
    [player, caps],
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
