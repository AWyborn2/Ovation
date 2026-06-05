import React from "react";
import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetMatch, getGetMatchQueryKey } from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading, styles } from "@/components/ui";
import { DigitalScorecard } from "@/components/scorecard";
import { useColors } from "@/hooks/useColors";

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const matchLabel = (round: number | null | undefined, stage: string | null | undefined) => {
  if (stage) return stage;
  if (round != null) return `Round ${round}`;
  return "";
};

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

  const hatTrickIds = new Set(data.hatTrickPlayerIds ?? []);
  const label = matchLabel(data.round, data.stage);

  return (
    <>
      <Stack.Screen options={{ title: (data.opponent ?? "MATCH").toUpperCase() }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Heading size="lg">Halls Head vs {data.opponent ?? "Unknown"}</Heading>
        <Body muted size={12} style={{ marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>
          {data.grade} · {fmtSeason(data.season)}
          {label ? ` · ${label}` : ""}
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

        <View style={{ marginTop: 16 }}>
          <DigitalScorecard match={data} hatTrickIds={hatTrickIds} />
        </View>
      </ScrollView>
    </>
  );
}
