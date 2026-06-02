import React from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useListAwards,
  useListPublicTallies,
  type Award,
  type AwardWinner,
  type AwardTally,
} from "@workspace/api-client-react";

import { Body, Card, Heading, Loading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

type SeasonGroup = { season: number; winners: AwardWinner[] };

function groupBySeason(winners: AwardWinner[]): SeasonGroup[] {
  const bySeason = new Map<number, AwardWinner[]>();
  for (const w of winners) {
    if (!bySeason.has(w.season)) bySeason.set(w.season, []);
    bySeason.get(w.season)!.push(w);
  }
  return [...bySeason.entries()]
    .map(([season, ws]) => ({
      season,
      winners: [...ws].sort(
        (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
      ),
    }))
    .sort((a, b) => b.season - a.season);
}

function WinnerRow({ winner }: { winner: AwardWinner }) {
  const colors = useColors();
  const content = (
    <Body
      bold
      size={13}
      style={{ color: winner.playerId != null ? colors.primary : colors.foreground }}
    >
      {winner.name}
    </Body>
  );
  if (winner.playerId != null) {
    return (
      <Link href={`/players/${winner.playerId}` as never} asChild>
        <TouchableOpacity activeOpacity={0.7}>{content}</TouchableOpacity>
      </Link>
    );
  }
  return content;
}

function LiveTally({ tally }: { tally: AwardTally }) {
  const colors = useColors();
  const winners = new Set(tally.winnerPlayerIds);
  const top = tally.entries.slice(0, 10);
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingTop: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.primary,
          }}
        />
        <Body bold size={11} style={{ color: colors.primary, letterSpacing: 0.5 }}>
          LIVE {formatSeason(tally.season)} TALLY
          {tally.finalised ? " · FINALISED" : ""}
        </Body>
      </View>
      {top.length === 0 ? (
        <Body muted size={12} style={{ fontStyle: "italic" }}>
          No votes counted yet.
        </Body>
      ) : (
        <View style={{ gap: 4 }}>
          {top.map((e, i) => {
            const isLeader = winners.has(e.playerId);
            return (
              <View
                key={e.playerId}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Body muted size={11} style={{ width: 18 }}>
                  {i + 1}
                </Body>
                <Body
                  bold={isLeader}
                  size={13}
                  style={{ flex: 1, color: isLeader ? colors.primary : colors.foreground }}
                >
                  {e.name}
                  {isLeader && tally.votingOpen ? " ● leading" : ""}
                </Body>
                <Body bold size={13}>
                  {e.points}
                </Body>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function AwardCard({ award, tally }: { award: Award; tally?: AwardTally }) {
  const colors = useColors();
  const groups = groupBySeason(award.winners);
  return (
    <Card style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
      <View
        style={{
          backgroundColor: colors.primary,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Feather name="award" size={18} color={colors.primaryForeground} />
        <Heading size="sm" style={{ flex: 1, color: colors.primaryForeground }}>
          {award.title}
        </Heading>
        <Body size={11} bold style={{ color: colors.primaryForeground }}>
          {groups.length}
        </Body>
      </View>

      {award.description ? (
        <Body muted size={12} style={{ paddingHorizontal: 14, paddingTop: 12 }}>
          {award.description}
        </Body>
      ) : null}

      {tally ? <LiveTally tally={tally} /> : null}

      {groups.length === 0 ? (
        <Body muted size={12} style={{ padding: 16, fontStyle: "italic" }}>
          No winners recorded yet.
        </Body>
      ) : (
        <View style={{ padding: 14, gap: 10 }}>
          {groups.map((g) => (
            <View
              key={g.season}
              style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
            >
              <Body bold size={13} style={{ width: 64, color: colors.primary }}>
                {formatSeason(g.season)}
              </Body>
              <View style={{ flex: 1, gap: 4 }}>
                {g.winners.map((w) => (
                  <WinnerRow key={w.id} winner={w} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

export default function AwardsScreen() {
  const colors = useColors();
  const { data: awards, isLoading } = useListAwards();
  const { data: tallies } = useListPublicTallies();

  const tallyByAward = new Map<number, AwardTally>();
  for (const t of tallies ?? []) tallyByAward.set(t.awardId, t);

  const sorted = [...(awards ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
  );

  return (
    <>
      <Stack.Screen options={{ title: "AWARDS" }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
      >
        <Heading size="lg">Club Awards</Heading>
        <Body muted size={12} style={{ marginTop: 4, marginBottom: 16 }}>
          Recognising the players and members awarded each season.
        </Body>

        {isLoading ? (
          <Loading />
        ) : sorted.length === 0 ? (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <Feather name="info" size={24} color={colors.mutedForeground} />
            <Body muted>No awards have been added yet.</Body>
          </View>
        ) : (
          sorted.map((a) => (
            <AwardCard key={a.id} award={a} tally={tallyByAward.get(a.id)} />
          ))
        )}
      </ScrollView>
    </>
  );
}
