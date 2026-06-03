import React from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import {
  useGetMatch,
  getGetMatchQueryKey,
  type MatchScorecardLine,
} from "@workspace/api-client-react";

import {
  Body,
  Card,
  ErrorView,
  Heading,
  Loading,
  SectionHeader,
  styles,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

function PlayerName({ line }: { line: MatchScorecardLine }) {
  const colors = useColors();
  return (
    <Link href={`/players/${line.playerId}` as never} asChild>
      <TouchableOpacity>
        <Body bold size={13} style={{ color: colors.primary }}>
          {line.givenName} {line.surname}
        </Body>
      </TouchableOpacity>
    </Link>
  );
}

function Cell({ children, flex = 1, align = "right" }: { children: React.ReactNode; flex?: number; align?: "left" | "right" }) {
  return (
    <View style={{ flex, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      {typeof children === "string" || typeof children === "number" ? (
        <Body size={12} style={{ fontFamily: "Montserrat_500Medium" }}>{children}</Body>
      ) : (
        children
      )}
    </View>
  );
}

export default function MatchDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const { data, isLoading, isError } = useGetMatch(matchId, {
    query: {
      enabled: !Number.isNaN(matchId),
      queryKey: getGetMatchQueryKey(matchId),
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorView message="Match not found" />;

  const batting = data.lines
    .filter((l) => l.batted)
    .sort((a, b) => (a.battingPos ?? 99) - (b.battingPos ?? 99));
  const bowling = data.lines.filter((l) => l.bowled);
  const fielding = data.lines.filter(
    (l) => (l.catches ?? 0) + (l.stumpings ?? 0) + (l.runOuts ?? 0) > 0,
  );

  return (
    <>
      <Stack.Screen options={{ title: (data.opponent ?? "MATCH").toUpperCase() }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Heading size="lg">Halls Head vs {data.opponent ?? "Unknown"}</Heading>
        <Body muted size={12} style={{ marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>
          {data.grade} · {fmtSeason(data.season)}
          {data.round != null ? ` · Round ${data.round}` : ""}
        </Body>
        {data.competition ? (
          <Body muted size={11} style={{ marginTop: 2 }}>{data.competition}</Body>
        ) : null}

        <Card style={{ marginTop: 12 }}>
          {data.result ? <Body bold size={13}>{data.result}</Body> : null}
          {(data.hhccScore || data.opponentScore) ? (
            <View style={{ flexDirection: "row", gap: 24, marginTop: data.result ? 10 : 0 }}>
              {data.hhccScore ? (
                <View>
                  <Body muted size={10} style={{ letterSpacing: 1, textTransform: "uppercase" }}>Halls Head</Body>
                  <Heading size="md">{data.hhccScore}</Heading>
                </View>
              ) : null}
              {data.opponentScore ? (
                <View>
                  <Body muted size={10} style={{ letterSpacing: 1, textTransform: "uppercase" }}>{data.opponent ?? "Opponent"}</Body>
                  <Heading size="md">{data.opponentScore}</Heading>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 }}>
            {fmtDate(data.matchDate) ? <Body muted size={11}>{fmtDate(data.matchDate)}</Body> : null}
            {data.venue ? <Body muted size={11}>{data.venue}</Body> : null}
            {data.abandoned ? <Body size={11} bold style={{ color: colors.primary }}>ABANDONED</Body> : null}
          </View>
        </Card>

        <SectionHeader icon="activity" title="Batting" />
        <Card>
          <View style={{ flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Cell flex={3} align="left"><Body muted size={11}>BATTER</Body></Cell>
            <Cell><Body muted size={11}>R</Body></Cell>
            <Cell><Body muted size={11}>B</Body></Cell>
            <Cell><Body muted size={11}>4s</Body></Cell>
            <Cell><Body muted size={11}>6s</Body></Cell>
          </View>
          {batting.length === 0 ? (
            <Body muted size={12} style={{ paddingTop: 8 }}>No batting recorded.</Body>
          ) : (
            batting.map((l) => (
              <View key={l.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <PlayerName line={l} />
                      {l.notOut ? <Body bold size={13} style={{ color: colors.primary }}> *</Body> : null}
                    </View>
                  </View>
                  <Cell>{l.runs ?? 0}</Cell>
                  <Cell>{l.balls ?? "—"}</Cell>
                  <Cell>{l.fours ?? "—"}</Cell>
                  <Cell>{l.sixes ?? "—"}</Cell>
                </View>
                {l.dismissal ? <Body muted size={11} style={{ marginTop: 2 }}>{l.dismissal}</Body> : null}
              </View>
            ))
          )}
        </Card>

        <SectionHeader icon="target" title="Bowling" />
        <Card>
          <View style={{ flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Cell flex={3} align="left"><Body muted size={11}>BOWLER</Body></Cell>
            <Cell><Body muted size={11}>O</Body></Cell>
            <Cell><Body muted size={11}>M</Body></Cell>
            <Cell><Body muted size={11}>R</Body></Cell>
            <Cell><Body muted size={11}>W</Body></Cell>
          </View>
          {bowling.length === 0 ? (
            <Body muted size={12} style={{ paddingTop: 8 }}>No bowling recorded.</Body>
          ) : (
            bowling.map((l) => (
              <View key={l.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 3 }}><PlayerName line={l} /></View>
                <Cell>{l.overs || "—"}</Cell>
                <Cell>{l.maidens ?? "—"}</Cell>
                <Cell>{l.runsConceded ?? "—"}</Cell>
                <Cell>{l.wickets ?? 0}</Cell>
              </View>
            ))
          )}
        </Card>

        {fielding.length > 0 ? (
          <>
            <SectionHeader icon="shield" title="Fielding" />
            <Card>
              <View style={{ flexDirection: "row", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Cell flex={3} align="left"><Body muted size={11}>FIELDER</Body></Cell>
                <Cell><Body muted size={11}>Ct</Body></Cell>
                <Cell><Body muted size={11}>St</Body></Cell>
                <Cell><Body muted size={11}>RO</Body></Cell>
              </View>
              {fielding.map((l) => (
                <View key={l.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flex: 3 }}><PlayerName line={l} /></View>
                  <Cell>{l.catches || "—"}</Cell>
                  <Cell>{l.stumpings || "—"}</Cell>
                  <Cell>{l.runOuts || "—"}</Cell>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
