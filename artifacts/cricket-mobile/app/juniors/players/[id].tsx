import React from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetJuniorPlayer,
  getGetJuniorPlayerQueryKey,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading, SectionHeader, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { JUNIOR, fmtJuniorDate, fmtNum } from "@/lib/juniors";

function Stat({ label, value }: { label: string; value: string | number }) {
  const colors = useColors();
  return (
    <Card style={{ flex: 1, minWidth: "30%", padding: 10, alignItems: "center" }}>
      <Body
        bold
        style={{ color: JUNIOR.accentDark, fontFamily: "Oswald_700Bold", fontSize: 18 }}
      >
        {value}
      </Body>
      <Body
        muted
        size={9}
        style={{ textTransform: "uppercase", letterSpacing: 1, marginTop: 2, textAlign: "center" }}
      >
        {label}
      </Body>
    </Card>
  );
}

export default function JuniorPlayerDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const participantId = id ?? "";
  const { data: player, isLoading, isError } = useGetJuniorPlayer(participantId, {
    query: {
      enabled: !!participantId,
      queryKey: getGetJuniorPlayerQueryKey(participantId),
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !player) return <ErrorView message="Player not found" />;

  return (
    <>
      <Stack.Screen options={{ title: "JUNIOR PLAYER" }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Body
          bold
          size={11}
          style={{ color: JUNIOR.accentDark, textTransform: "uppercase", letterSpacing: 2 }}
        >
          Junior Player
        </Body>
        <Heading size="xl" style={{ marginTop: 4 }}>
          {player.displayName}
        </Heading>
        <Body muted size={12} style={{ marginTop: 4 }}>
          {player.firstSeason && player.lastSeason
            ? `${player.firstSeason} – ${player.lastSeason}`
            : player.firstSeason ?? ""}
          {player.teams ? ` · ${player.teams}` : ""}
        </Body>

        <SectionHeader icon="trending-up" title="Batting" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Stat label="Matches" value={player.batting.matches} />
          <Stat label="Innings" value={player.batting.innings} />
          <Stat label="Runs" value={player.batting.runs} />
          <Stat label="Not Outs" value={player.batting.notOuts} />
          <Stat label="High Score" value={player.batting.highScore ?? "—"} />
          <Stat label="Average" value={fmtNum(player.batting.average, 2)} />
        </View>

        <SectionHeader icon="target" title="Bowling" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Stat label="Matches" value={player.bowling.matches} />
          <Stat label="Wickets" value={player.bowling.wickets} />
          <Stat label="Runs" value={player.bowling.runs} />
          <Stat label="Maidens" value={player.bowling.maidens} />
          <Stat
            label="Best"
            value={
              player.bowling.bestWickets != null
                ? `${player.bowling.bestWickets}/${player.bowling.bestRuns ?? "—"}`
                : "—"
            }
          />
          <Stat label="Economy" value={fmtNum(player.bowling.economy, 2)} />
        </View>

        {player.seasons.length > 0 ? (
          <>
            <SectionHeader icon="calendar" title="By Season" />
            {player.seasons.map((s, i) => (
              <Card key={i} style={{ marginBottom: 6, padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Body bold size={13}>{s.season}</Body>
                    {s.teams ? (
                      <Body muted size={11} style={{ marginTop: 2 }}>{s.teams}</Body>
                    ) : null}
                  </View>
                  <Body size={12} muted style={{ width: 56, textAlign: "right" }}>
                    {s.matches}g
                  </Body>
                  <Body size={12} muted style={{ width: 56, textAlign: "right" }}>
                    {s.runs}r
                  </Body>
                  <Body size={12} muted style={{ width: 48, textAlign: "right" }}>
                    {s.wickets}w
                  </Body>
                </View>
              </Card>
            ))}
          </>
        ) : null}

        {player.matches.length > 0 ? (
          <>
            <SectionHeader icon="clipboard" title="Match Log" />
            {player.matches.map((m) => {
              const batNotOut =
                m.batting?.dismissal && /not out/i.test(m.batting.dismissal);
              return (
                <Link key={m.matchId} href={`/juniors/matches/${m.matchId}` as never} asChild>
                  <TouchableOpacity activeOpacity={0.7}>
                    <Card style={{ marginBottom: 8, padding: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <Heading size="sm">vs {m.opponentName ?? "Unknown"}</Heading>
                          <Body muted size={11} style={{ marginTop: 3 }}>
                            {m.season ?? ""}
                            {m.ageGroup ? ` · ${m.ageGroup}` : ""}
                            {m.round ? ` · ${m.round}` : ""}
                          </Body>
                          <Body size={12} style={{ marginTop: 4 }}>
                            {m.batting && m.batting.runs != null
                              ? `Bat ${m.batting.runs}${batNotOut ? "*" : ""}`
                              : ""}
                            {m.batting?.runs != null && m.bowling?.wickets != null ? "  ·  " : ""}
                            {m.bowling && m.bowling.wickets != null
                              ? `Bowl ${m.bowling.wickets}/${m.bowling.runs ?? "—"}`
                              : ""}
                          </Body>
                          {fmtJuniorDate(m.matchDate) ? (
                            <Body muted size={11} style={{ marginTop: 4 }}>
                              {fmtJuniorDate(m.matchDate)}
                            </Body>
                          ) : null}
                        </View>
                        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                      </View>
                    </Card>
                  </TouchableOpacity>
                </Link>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}
