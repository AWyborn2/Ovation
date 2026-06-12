import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { BRAND } from "@/constants/brand";
import {
  buildScorecard,
  type MatchDetail,
  type ScorecardInnings,
  type ScorecardTeam,
  type TeamColors,
} from "@workspace/scorecard";
import {
  useGetPlayer,
  getGetPlayerQueryKey,
  type Stat,
} from "@workspace/api-client-react";

import { Body } from "@/components/ui";

/* ------------------------------------------------------------------ helpers */

const num = (n: number | null | undefined) => n ?? 0;

function initials(team: ScorecardTeam): string {
  const src = team.shortName || team.name;
  return src
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function extrasParts(e: ScorecardInnings["extras"]): string[] {
  const parts: string[] = [];
  if (e.wides) parts.push(`${e.wides}w`);
  if (e.noBalls) parts.push(`${e.noBalls}nb`);
  if (e.other) parts.push(`${e.other}b/lb`);
  return parts;
}

function bestHighScore(stats: Stat[]): string | null {
  let best = -1;
  let label: string | null = null;
  for (const s of stats) {
    if (!s.highScore) continue;
    const v = parseInt(s.highScore.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(v) && v > best) {
      best = v;
      label = s.highScore;
    }
  }
  return label;
}

function bestBowling(stats: Stat[]): string | null {
  let bestW = -1;
  let bestR = Infinity;
  let label: string | null = null;
  for (const s of stats) {
    if (!s.bestBowling) continue;
    const m = /(\d+)\s*\/\s*(\d+)/.exec(s.bestBowling);
    if (!m) continue;
    const w = parseInt(m[1], 10);
    const r = parseInt(m[2], 10);
    if (w > bestW || (w === bestW && r < bestR)) {
      bestW = w;
      bestR = r;
      label = s.bestBowling;
    }
  }
  return label;
}

/* ------------------------------------------------------------------- header */

function CardLogo({ team, c }: { team: ScorecardTeam; c: TeamColors }) {
  const [errored, setErrored] = useState(false);
  if (team.logoUrl && !errored) {
    return (
      <Image
        source={{ uri: team.logoUrl }}
        style={{ width: 34, height: 34, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.9)" }}
        contentFit="contain"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 4,
        backgroundColor: c.secondary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Body bold size={11} style={{ color: c.accentText }}>
        {initials(team)}
      </Body>
    </View>
  );
}

function CardHeaderRow({
  team,
  inningsLabel,
  c,
}: {
  team: ScorecardTeam;
  inningsLabel: string;
  c: TeamColors;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: c.primary,
        paddingHorizontal: 12,
        paddingVertical: 9,
      }}
    >
      <CardLogo team={team} c={c} />
      <View style={{ flex: 1 }}>
        <Body bold size={15} style={{ color: c.text, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {team.name}
        </Body>
      </View>
      <View
        style={{
          backgroundColor: c.secondary,
          borderRadius: 3,
          paddingHorizontal: 7,
          paddingVertical: 2,
        }}
      >
        <Body bold size={9} style={{ color: c.accentText, letterSpacing: 0.5 }}>
          {inningsLabel}
        </Body>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ batting */

function HeaderCell({
  children,
  flex,
  width,
  align = "center",
  c,
}: {
  children: React.ReactNode;
  flex?: number;
  width?: number;
  align?: "left" | "center" | "right";
  c: TeamColors;
}) {
  return (
    <View style={{ flex, width, alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}>
      <Body size={9} bold style={{ color: c.text, opacity: 0.8, letterSpacing: 0.5 }}>
        {children}
      </Body>
    </View>
  );
}

function DataCell({
  children,
  flex,
  width,
  align = "center",
  c,
  bold,
  size = 12,
  dim,
}: {
  children: React.ReactNode;
  flex?: number;
  width?: number;
  align?: "left" | "center" | "right";
  c: TeamColors;
  bold?: boolean;
  size?: number;
  dim?: boolean;
}) {
  return (
    <View style={{ flex, width, alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}>
      <Body size={size} bold={bold} style={{ color: c.rowText, opacity: dim ? 0.7 : 1 }}>
        {children}
      </Body>
    </View>
  );
}

export function BattingBlock({
  innings,
  onPlayer,
}: {
  innings: ScorecardInnings;
  onPlayer?: (id: number, name: string) => void;
}) {
  const team = innings.battingTeam;
  const c = team.colors;
  const parts = extrasParts(innings.extras);

  return (
    <View style={{ borderRadius: 4, overflow: "hidden" }}>
      <CardHeaderRow team={team} inningsLabel={innings.inningsLabel} c={c} />

      <View style={{ flexDirection: "row", backgroundColor: c.primary, paddingHorizontal: 10, paddingVertical: 5, opacity: 0.9 }}>
        <HeaderCell flex={3} align="left" c={c}>BATSMAN</HeaderCell>
        <HeaderCell flex={4} c={c}>DISMISSAL</HeaderCell>
        <HeaderCell width={34} c={c}>R</HeaderCell>
        <HeaderCell width={30} c={c}>B</HeaderCell>
        <HeaderCell width={42} c={c}>SR</HeaderCell>
      </View>

      {innings.batsmen.length === 0 ? (
        <View style={{ backgroundColor: c.rowOdd, padding: 12 }}>
          <Body size={12} style={{ color: c.rowText, opacity: 0.6, fontStyle: "italic" }}>No batting recorded.</Body>
        </View>
      ) : (
        innings.batsmen.map((row, idx) => {
          const bg = idx % 2 === 0 ? c.rowOdd : c.rowEven;
          const clickable = row.playerId != null;
          return (
            <View
              key={`${row.name}-${idx}`}
              style={{ flexDirection: "row", alignItems: "center", backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: c.borderColor }}
            >
              <View style={{ flex: 3 }}>
                {clickable ? (
                  <Pressable onPress={() => onPlayer?.(row.playerId!, row.name)}>
                    <Body bold size={13} style={{ color: c.rowText, textTransform: "uppercase" }}>
                      {row.name}{row.notOut ? <Body bold size={13} style={{ color: c.secondary }}> *</Body> : null}
                    </Body>
                  </Pressable>
                ) : (
                  <Body bold size={13} style={{ color: c.rowText, textTransform: "uppercase" }}>
                    {row.name}{row.notOut ? <Body bold size={13} style={{ color: c.secondary }}> *</Body> : null}
                  </Body>
                )}
              </View>
              <DataCell flex={4} c={c} size={11} dim>{row.dismissal || "—"}</DataCell>
              <DataCell width={34} c={c} bold size={14}>{row.runs ?? 0}</DataCell>
              <DataCell width={30} c={c} size={12} dim>{row.balls ?? "—"}</DataCell>
              <DataCell width={42} c={c} size={12} dim>{row.strikeRate != null ? row.strikeRate.toFixed(1) : "—"}</DataCell>
            </View>
          );
        })
      )}

      {innings.didNotBat.length > 0 ? (
        <View style={{ backgroundColor: c.rowEven, paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.borderColor }}>
          <Body size={11} style={{ color: c.rowText, opacity: 0.6, fontStyle: "italic" }}>
            Did not bat: {innings.didNotBat.join(", ")}
          </Body>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.totalBg, paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 2, borderTopColor: c.secondary }}>
        <View style={{ flex: 1 }}>
          <Body size={11} bold style={{ color: c.totalText }}>OVERS {innings.oversTotal ?? "—"}</Body>
        </View>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Body size={11} style={{ color: c.totalText }}>
            EXTRAS {innings.extras.total}{parts.length > 0 ? ` (${parts.join(" ")})` : ""}
          </Body>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Body bold size={20} style={{ color: c.totalText }}>
            {innings.totalRuns != null ? `${innings.totalRuns}/${innings.wickets ?? 0}` : "—"}
          </Body>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ bowling */

export function BowlingBlock({
  innings,
  hatTrickIds,
  onPlayer,
}: {
  innings: ScorecardInnings;
  hatTrickIds?: Set<number>;
  onPlayer?: (id: number, name: string) => void;
}) {
  const team = innings.bowlingTeam;
  const c = team.colors;
  const parts = extrasParts(innings.extras);

  return (
    <View style={{ borderRadius: 4, overflow: "hidden" }}>
      <CardHeaderRow team={team} inningsLabel={innings.inningsLabel} c={c} />

      <View style={{ flexDirection: "row", backgroundColor: c.primary, paddingHorizontal: 10, paddingVertical: 5, opacity: 0.9 }}>
        <HeaderCell flex={3} align="left" c={c}>BOWLER</HeaderCell>
        <HeaderCell width={44} c={c}>O</HeaderCell>
        <HeaderCell width={32} c={c}>M</HeaderCell>
        <HeaderCell width={40} c={c}>R</HeaderCell>
        <HeaderCell width={36} c={c}>W</HeaderCell>
        <HeaderCell width={48} c={c}>ECON</HeaderCell>
      </View>

      {innings.bowlers.length === 0 ? (
        <View style={{ backgroundColor: c.rowOdd, padding: 12 }}>
          <Body size={12} style={{ color: c.rowText, opacity: 0.6, fontStyle: "italic" }}>No bowling recorded.</Body>
        </View>
      ) : (
        innings.bowlers.map((row, idx) => {
          const bg = idx % 2 === 0 ? c.rowOdd : c.rowEven;
          const clickable = row.playerId != null;
          const hasHatTrick = row.playerId != null && hatTrickIds?.has(row.playerId);
          return (
            <View
              key={`${row.name}-${idx}`}
              style={{ flexDirection: "row", alignItems: "center", backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: c.borderColor }}
            >
              <View style={{ flex: 3, flexDirection: "row", alignItems: "center", gap: 5 }}>
                {clickable ? (
                  <Pressable onPress={() => onPlayer?.(row.playerId!, row.name)} style={{ flexShrink: 1 }}>
                    <Body bold size={13} style={{ color: c.rowText, textTransform: "uppercase" }}>{row.name}</Body>
                  </Pressable>
                ) : (
                  <Body bold size={13} style={{ color: c.rowText, textTransform: "uppercase" }}>{row.name}</Body>
                )}
                {hasHatTrick ? <Body bold size={12} style={{ color: c.secondary }}>🔥</Body> : null}
              </View>
              <DataCell width={44} c={c} size={12} dim>{row.overs ?? "—"}</DataCell>
              <DataCell width={32} c={c} size={12} dim>{row.maidens ?? "—"}</DataCell>
              <DataCell width={40} c={c} size={12} dim>{row.runs ?? "—"}</DataCell>
              <DataCell width={36} c={c} bold size={14}>{row.wickets ?? 0}</DataCell>
              <DataCell width={48} c={c} size={12} dim>{row.economy != null ? row.economy.toFixed(2) : "—"}</DataCell>
            </View>
          );
        })
      )}

      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.totalBg, paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 2, borderTopColor: c.secondary }}>
        <View style={{ flex: 1 }}>
          <Body size={11} bold style={{ color: c.totalText }}>
            EXTRAS {innings.extras.total}{parts.length > 0 ? ` (${parts.join(" ")})` : ""}
          </Body>
        </View>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Body size={11} bold style={{ color: c.totalText }}>OVERS {innings.oversTotal ?? "—"}</Body>
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Body bold size={20} style={{ color: c.totalText }}>
            {innings.totalRuns != null ? `${innings.totalRuns}/${innings.wickets ?? 0}` : "—"}
          </Body>
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------- modal */

function StatTileSmall({ label, value }: { label: string; value: string | number | null }) {
  return (
    <View style={{ flexBasis: "31%", flexGrow: 1, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 6, paddingVertical: 8, alignItems: "center" }}>
      <Body bold size={17} style={{ color: "#e5e7eb" }}>{value ?? "—"}</Body>
      <Body size={9} style={{ color: "#6b7280", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</Body>
    </View>
  );
}

function PlayerStatsModal({
  playerId,
  fallbackName,
  onClose,
}: {
  playerId: number | null;
  fallbackName?: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useGetPlayer(playerId ?? 0, {
    query: { enabled: playerId != null, queryKey: getGetPlayerQueryKey(playerId ?? 0) },
  });

  const stats = data?.stats ?? [];
  const games = stats.reduce((a, s) => a + num(s.games), 0);
  const innings = stats.reduce((a, s) => a + num(s.innings), 0);
  const notOuts = stats.reduce((a, s) => a + num(s.notOuts), 0);
  const runs = stats.reduce((a, s) => a + num(s.runs), 0);
  const fifties = stats.reduce((a, s) => a + num(s.fifties), 0);
  const hundreds = stats.reduce((a, s) => a + num(s.hundreds), 0);
  const wickets = stats.reduce((a, s) => a + num(s.wickets), 0);
  const runsConceded = stats.reduce((a, s) => a + num(s.runsConceded), 0);
  const fiveWickets = stats.reduce((a, s) => a + num(s.fiveWickets), 0);
  const catches = stats.reduce((a, s) => a + num(s.catches), 0);
  const stumpings = stats.reduce((a, s) => a + num(s.stumpings), 0);
  const runOuts = stats.reduce((a, s) => a + num(s.runOuts), 0);

  const dismissals = innings - notOuts;
  const batAvg = dismissals > 0 ? (runs / dismissals).toFixed(1) : null;
  const bowlAvg = wickets > 0 ? (runsConceded / wickets).toFixed(1) : null;
  const hasBatting = innings > 0 || runs > 0;
  const hasBowling = wickets > 0 || runsConceded > 0;
  const hasFielding = catches + stumpings + runOuts > 0;

  const name = data ? `${data.givenName} ${data.surname}`.trim() : fallbackName ?? "Player";

  return (
    <Modal visible={playerId != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 16 }}
        onPress={onClose}
      >
        <Pressable
          style={{ width: "100%", maxWidth: 460, borderRadius: 10, overflow: "hidden", backgroundColor: "#0c1c33", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
          onPress={() => {}}
        >
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#00305c", paddingHorizontal: 18, paddingVertical: 14 }}>
            <View style={{ flex: 1 }}>
              <Body bold size={17} style={{ color: "#f5a623", letterSpacing: 0.5, textTransform: "uppercase" }}>{name}</Body>
              {data?.gradesPlayed ? <Body size={12} style={{ color: "#9ca3af", marginTop: 2 }}>{data.gradesPlayed}</Body> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Body size={22} style={{ color: "#9ca3af" }}>×</Body>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 18 }}>
            {isLoading ? (
              <Body size={13} style={{ color: "#9ca3af" }}>Loading career stats…</Body>
            ) : stats.length === 0 ? (
              <Body size={13} style={{ color: "#9ca3af" }}>No career stats recorded.</Body>
            ) : (
              <>
                <Body size={10} bold style={{ color: "#6b7280", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                  Career • {games} {games === 1 ? "Game" : "Games"}
                </Body>

                {hasBatting ? (
                  <>
                    <Body size={9} bold style={{ color: "#4b5563", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Batting</Body>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                      <StatTileSmall label="Runs" value={runs.toLocaleString()} />
                      <StatTileSmall label="Average" value={batAvg} />
                      <StatTileSmall label="High Score" value={bestHighScore(stats)} />
                      <StatTileSmall label="50s" value={fifties} />
                      <StatTileSmall label="100s" value={hundreds} />
                      <StatTileSmall label="Innings" value={innings} />
                    </View>
                  </>
                ) : null}

                {hasBowling ? (
                  <>
                    <Body size={9} bold style={{ color: "#4b5563", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Bowling</Body>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                      <StatTileSmall label="Wickets" value={wickets} />
                      <StatTileSmall label="Average" value={bowlAvg} />
                      <StatTileSmall label="Best" value={bestBowling(stats)} />
                      <StatTileSmall label="5 Wkts" value={fiveWickets} />
                    </View>
                  </>
                ) : null}

                {hasFielding ? (
                  <>
                    <Body size={9} bold style={{ color: "#4b5563", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Fielding</Body>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      <StatTileSmall label="Catches" value={catches} />
                      <StatTileSmall label="Stumpings" value={stumpings} />
                      <StatTileSmall label="Run Outs" value={runOuts} />
                    </View>
                  </>
                ) : null}
              </>
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", alignItems: "center" }}>
            <Link href={`/players/${playerId}` as never} asChild onPress={onClose}>
              <Pressable>
                <Body size={12} bold style={{ color: "#f5a623" }}>View full profile →</Body>
              </Pressable>
            </Link>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* --------------------------------------------------------------- scorecard */

export function DigitalScorecard({
  match,
  hatTrickIds,
}: {
  match: MatchDetail;
  hatTrickIds?: Set<number>;
}) {
  const scorecard = useMemo(() => buildScorecard(match), [match]);
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const onPlayer = (id: number, name: string) => setSelected({ id, name });

  const hasAnyData = scorecard.innings.some(
    (inn) => inn.batsmen.length + inn.bowlers.length + inn.didNotBat.length > 0,
  );

  if (!hasAnyData) {
    return (
      <View style={{ backgroundColor: "#0a1626", borderRadius: 8, padding: 24, alignItems: "center" }}>
        <Body size={13} style={{ color: "#9ca3af", fontStyle: "italic" }}>
          {match.abandoned ? "Match abandoned — no scorecard recorded." : "No scorecard recorded for this match."}
        </Body>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: "#0a1626", borderRadius: 8, padding: 10, gap: 12 }}>
      {scorecard.innings.map((inn, i) => (
        <View key={i} style={{ gap: 8 }}>
          <BattingBlock innings={inn} onPlayer={onPlayer} />
          <BowlingBlock innings={inn} hatTrickIds={hatTrickIds} onPlayer={onPlayer} />
        </View>
      ))}
      {!scorecard.orderKnown ? (
        <Body size={11} style={{ color: "#6b7280", textAlign: "center" }}>
          Batting order not confirmed — innings shown {BRAND.shortName} first.
        </Body>
      ) : null}

      <PlayerStatsModal
        playerId={selected?.id ?? null}
        fallbackName={selected?.name}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}
