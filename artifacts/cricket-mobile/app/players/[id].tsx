import React from "react";
import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetPlayer, getGetPlayerQueryKey } from "@workspace/api-client-react";

import {
  Body,
  Card,
  ErrorView,
  Heading,
  Loading,
  SectionHeader,
  StatTile,
  styles,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";

function StatRow({ label, value }: { label: string; value: string | number }) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Body muted size={13}>{label}</Body>
      <Body bold size={13}>{value}</Body>
    </View>
  );
}

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const playerId = Number(id);
  const { data, isLoading, isError } = useGetPlayer(playerId, {
    query: {
      enabled: !Number.isNaN(playerId),
      queryKey: getGetPlayerQueryKey(playerId),
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorView message="Player not found" />;

  const totalGames = data.stats.reduce((s, x) => s + (x.games ?? 0), 0);
  const totalRuns = data.stats.reduce((s, x) => s + (x.runs ?? 0), 0);
  const totalWickets = data.stats.reduce((s, x) => s + (x.wickets ?? 0), 0);
  const totalCatches = data.stats.reduce((s, x) => s + (x.catches ?? 0), 0);

  return (
    <>
      <Stack.Screen options={{ title: data.surname.toUpperCase() }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Heading size="xl">{data.givenName} {data.surname}</Heading>
        <Body muted size={12} style={{ marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>
          {data.gradesPlayed || "—"}
        </Body>

        <View style={[styles.row, { marginTop: 16 }]}>
          <StatTile label="Games" value={totalGames} />
          <StatTile label="Runs" value={totalRuns} />
        </View>
        <View style={[styles.row, { marginTop: 12 }]}>
          <StatTile label="Wickets" value={totalWickets} />
          <StatTile label="Catches" value={totalCatches} />
        </View>

        <SectionHeader icon="layers" title="By Grade" />
        {data.stats.length === 0 ? (
          <Card><Body muted>No stats recorded.</Body></Card>
        ) : (
          data.stats.map((s) => (
            <Card key={s.id} style={{ marginBottom: 10 }}>
              <Heading size="md">{s.grade}</Heading>
              <View style={{ marginTop: 8 }}>
                <StatRow label="Games" value={s.games ?? 0} />
                <StatRow label="Innings" value={s.innings ?? 0} />
                <StatRow label="Not Outs" value={s.notOuts ?? 0} />
                <StatRow label="Runs" value={(s.runs ?? 0).toLocaleString()} />
                <StatRow label="Batting Avg" value={s.batAvg != null ? s.batAvg.toFixed(2) : "-"} />
                <StatRow label="High Score" value={s.highScore || "-"} />
                <StatRow label="50s / 100s" value={`${s.fifties ?? 0} / ${s.hundreds ?? 0}`} />
                <StatRow label="Wickets" value={s.wickets ?? 0} />
                <StatRow label="Bowling Avg" value={s.bowlAvg != null ? s.bowlAvg.toFixed(2) : "-"} />
                <StatRow label="Best Bowling" value={s.bestBowling || "-"} />
                <StatRow label="5wI" value={s.fiveWickets ?? 0} />
                <StatRow label="Catches" value={s.catches ?? 0} />
                <StatRow label="Stumpings" value={s.stumpings ?? 0} />
                <StatRow label="Run Outs" value={s.runOuts ?? 0} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </>
  );
}
