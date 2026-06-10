import { Trophy, Award } from "lucide-react";
import type { TradingCardData } from "@/lib/trading-card";
import { GOLD, CHARCOAL, PHASE_PHOTO_H, type Phase } from "./constants";
import { frontStats, perfBars, premiershipLabel, careerStatTiles } from "./stat-helpers";
import {
  CardSurface,
  CardHeader,
  PlayerPhoto,
  StatTile,
  PerfBar,
  SectionTitle,
  NameBlock,
  StarRow,
  CardFooter,
  PhaseName,
  PhaseContent,
  PhaseTitle,
} from "./card-pieces";

export function CardFront({ data }: { data: TradingCardData }) {
  const premierships = data.achievements.premierships;
  return (
    <CardSurface>
      <CardHeader data={data} />
      <PlayerPhoto data={data} height={300} />
      <div style={{ padding: "14px 18px 0" }}>
        <NameBlock data={data} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
          {(data.configuredStats ?? frontStats(data)).map((s, i) => (
            <StatTile key={`${s.label}-${i}`} label={s.label} value={s.value} />
          ))}
          {!data.configuredStats && (
            <div style={{ gridColumn: "1 / -1" }}>
              <StatTile label="Best Bowling" value={data.additionalStats.bestBowling} />
            </div>
          )}
        </div>
        {premierships.length > 0 ? (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              background: "rgba(251,172,39,0.10)",
              border: `1px solid rgba(251,172,39,0.35)`,
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <Trophy size={38} style={{ color: GOLD }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 900, color: GOLD, lineHeight: 1 }}>
                ×{premierships.length}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                {premierships.length === 1 ? "Premiership" : "Premierships"}
              </span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {perfBars(data).map((b) => (
              <PerfBar key={b.label} label={b.label} value={b.value} max={b.max} />
            ))}
          </div>
        )}
      </div>
      <CardFooter />
    </CardSurface>
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
              {data.achievements.premierships.map((p, i) => (
                <span
                  key={`${p.year}-${p.grade}-${i}`}
                  style={{
                    background: GOLD,
                    color: CHARCOAL,
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {premiershipLabel(p)}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.achievements.awards.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <SectionTitle>Awards</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.achievements.awards.map((award, i) => (
                <div
                  key={`${award.title}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    padding: "6px 10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Award size={16} style={{ color: GOLD, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {award.title}
                    </span>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, flexShrink: 0 }}>
                    {award.seasons.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <CardFooter />
    </CardSurface>
  );
}

export function CardPhaseFrame({ data, phase }: { data: TradingCardData; phase: Phase }) {
  const s = data.stats;
  const a = data.additionalStats;
  return (
    <CardSurface>
      <CardHeader data={data} />
      <PlayerPhoto data={data} height={PHASE_PHOTO_H} />
      <PhaseName data={data} />
      <PhaseContent>
        {phase === "intro" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: 2, textTransform: "uppercase" }}>
              Official Player Card
            </div>
            {data.rating !== null && (
              <div style={{ marginTop: 14 }}>
                <StarRow rating={data.rating} />
              </div>
            )}
            {data.debutYear !== null && (
              <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 1 }}>
                Halls Head since {data.debutYear}
              </div>
            )}
          </div>
        )}
        {phase === "outro" && (
          <div style={{ textAlign: "center" }}>
            <Trophy size={44} style={{ color: GOLD, margin: "0 auto 10px" }} />
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.5 }}>Halls Head Cricket Club</div>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: 2, textTransform: "uppercase" }}>
              Est. 1991
            </div>
          </div>
        )}
        {phase === "careerStats" && (
          <>
            <PhaseTitle>Career Statistics</PhaseTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {careerStatTiles(data).slice(0, 6).map((m, i) => (
                <StatTile key={`${m.label}-${i}`} label={m.label} value={m.value} big />
              ))}
            </div>
          </>
        )}
        {phase === "batting" && (
          <>
            <PhaseTitle>Batting</PhaseTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <StatTile label="Runs" value={s.runs} big />
              <StatTile label="Average" value={s.battingAverage || "-"} big />
              <StatTile label="High Score" value={a.highestScore} big />
              <StatTile label="Centuries" value={s.centuries} big />
              <StatTile label="Half-Centuries" value={s.halfCenturies} big />
              <StatTile label="Matches" value={s.matches} big />
            </div>
          </>
        )}
        {phase === "bowling" && (
          <>
            <PhaseTitle>Bowling</PhaseTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatTile label="Wickets" value={s.wickets} big />
              <StatTile label="Average" value={s.bowlingAverage || "-"} big />
              <StatTile label="Best Bowling" value={a.bestBowling} big />
              <StatTile label="5-Wicket Hauls" value={s.fiveWickets} big />
            </div>
          </>
        )}
        {phase === "fielding" && (
          <>
            <PhaseTitle>Fielding</PhaseTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <StatTile label="Catches" value={a.catches} big />
              {data.role === "Wicket-Keeper" && <StatTile label="Stumpings" value={a.stumpings} big />}
              <StatTile label="Run Outs" value={a.runOuts} big />
            </div>
          </>
        )}
        {phase === "premierships" && (
          <div style={{ textAlign: "center" }}>
            <Trophy size={40} style={{ color: GOLD, margin: "0 auto 4px" }} />
            <div style={{ fontSize: 32, fontWeight: 900, color: GOLD, lineHeight: 1 }}>
              {data.achievements.premierships.length}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
              {data.achievements.premierships.length === 1 ? "Premiership" : "Premierships"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {data.achievements.premierships.map((p, i) => (
                <span key={`${p.year}-${p.grade}-${i}`} style={{ background: GOLD, color: CHARCOAL, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800 }}>
                  {premiershipLabel(p)}
                </span>
              ))}
            </div>
          </div>
        )}
        {phase === "awards" && (
          <>
            <PhaseTitle>Awards</PhaseTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
              {data.achievements.awards.slice(0, 4).map((award, i) => (
                <div
                  key={`${award.title}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "rgba(251,172,39,0.10)",
                    border: `1px solid rgba(251,172,39,0.30)`,
                    borderRadius: 10,
                    padding: "8px 12px",
                  }}
                >
                  <Award size={20} style={{ color: GOLD, flexShrink: 0 }} />
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {award.title}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>
                      {award.seasons.join(", ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </PhaseContent>
      <CardFooter />
    </CardSurface>
  );
}
