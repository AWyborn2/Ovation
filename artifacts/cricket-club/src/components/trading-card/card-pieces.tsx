import { Star } from "lucide-react";
import type { TradingCardData } from "@/lib/trading-card";
import {
  logoUrl,
  CHARCOAL,
  GOLD,
  BROWN,
  FONT,
  CARD_W,
  CARD_H,
  PHASE_CONTENT_H,
  fmt,
} from "./constants";

export function StarRow({ rating }: { rating: number }) {
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

export function CardSurface({ children }: { children: React.ReactNode }) {
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

export function CardHeader({ data }: { data: TradingCardData }) {
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
            width: 104,
            height: 104,
            background: GOLD,
            clipPath: "polygon(100% 0, 0 0, 100% 100%)",
          }}
        >
          {/* Keep the label + number close to the top-right corner where the
              triangle is widest, so even a 4-digit cap number reads fully. */}
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 8,
              textAlign: "right",
              color: CHARCOAL,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
              Cap
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>{data.number}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayerPhoto({ data, height }: { data: TradingCardData; height: number }) {
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

export function StatTile({ label, value, big }: { label: string; value: number | string; big?: boolean }) {
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

export function PerfBar({ label, value, max }: { label: string; value: number; max: number }) {
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

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 4, height: 18, background: GOLD, borderRadius: 2 }} />
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {children}
      </span>
    </div>
  );
}

export function NameBlock({ data }: { data: TradingCardData }) {
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

export function CardFooter({ flipHint }: { flipHint?: boolean }) {
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

export function PhaseName({ data }: { data: TradingCardData }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 16px 0" }}>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.3, lineHeight: 1.1 }}>{data.name}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
        {data.role}
      </div>
    </div>
  );
}

export function PhaseContent({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: PHASE_CONTENT_H,
        padding: "12px 22px 0",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function PhaseTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 }}>
      <div style={{ width: 4, height: 18, background: GOLD, borderRadius: 2 }} />
      <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {children}
      </span>
    </div>
  );
}

export function ScaledCard({ children, scale }: { children: React.ReactNode; scale: number }) {
  return (
    <div style={{ width: CARD_W * scale, height: CARD_H * scale }}>
      <div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
