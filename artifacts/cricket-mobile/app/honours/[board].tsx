import React, { useMemo, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueries } from "@tanstack/react-query";
import {
  useGetGradeLeaderboard,
  useListGrades,
  getGetGradeLeaderboardQueryOptions,
  getGetGradeLeaderboardQueryKey,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  BOARDS,
  aggregateCareer,
  computeBoard,
  statToAggregated,
  type BoardKey,
  type BoardTier,
} from "@/lib/honour-boards";

type Scope = "career" | "by-grade";

const TIER_ICONS: (keyof typeof Feather.glyphMap)[] = [
  "award",
  "star",
  "shield",
  "target",
  "flag",
  "bookmark",
  "circle",
];

function TierCard({
  tier,
  headlineLabel,
  supportingLabel,
}: {
  tier: BoardTier;
  headlineLabel: string;
  supportingLabel: string;
}) {
  const colors = useColors();
  const icon = TIER_ICONS[Math.min(tier.tierIndex, TIER_ICONS.length - 1)];
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
        <Feather name={icon} size={18} color={colors.primaryForeground} />
        <Heading size="sm" style={{ flex: 1, color: colors.primaryForeground }}>
          {tier.label}
        </Heading>
        <Body size={11} bold style={{ color: colors.primaryForeground }}>
          {tier.rows.length}
        </Body>
      </View>
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 14,
          paddingVertical: 8,
          backgroundColor: "#00000033",
        }}
      >
        <Body muted size={10} style={{ width: 28, textTransform: "uppercase", letterSpacing: 1 }}>
          #
        </Body>
        <Body muted size={10} style={{ flex: 1, textTransform: "uppercase", letterSpacing: 1 }}>
          Player
        </Body>
        <Body muted size={10} style={{ width: 80, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>
          {headlineLabel}
        </Body>
        <Body muted size={10} style={{ width: 70, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>
          {supportingLabel}
        </Body>
      </View>
      {tier.rows.map((r, i) => (
        <Link key={r.playerId} href={`/players/${r.playerId}` as never} asChild>
          <TouchableOpacity activeOpacity={0.7}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: i % 2 ? "#00000011" : "transparent",
              }}
            >
              <Body bold size={12} style={{ width: 28, color: colors.primary }}>
                {tier.startRank + i}
              </Body>
              <View style={{ flex: 1 }}>
                <Body bold size={13}>
                  {r.surname}
                </Body>
                <Body muted size={11}>
                  {r.givenName}
                </Body>
              </View>
              <Body bold size={13} style={{ width: 80, textAlign: "right" }}>
                {r.headline}
              </Body>
              <Body muted size={11} style={{ width: 70, textAlign: "right" }}>
                {r.supporting}
              </Body>
            </View>
          </TouchableOpacity>
        </Link>
      ))}
    </Card>
  );
}

function CareerBoard({ boardKey }: { boardKey: BoardKey }) {
  const colors = useColors();
  const { data: grades } = useListGrades();
  const gradeNames = grades?.map((g) => g.grade) ?? [];

  const leaderboards = useQueries({
    queries: gradeNames.map((g) => getGetGradeLeaderboardQueryOptions(g)),
  });

  const allLoaded =
    gradeNames.length > 0 &&
    leaderboards.every((q) => q.data !== undefined || q.isError);
  const stats = leaderboards.flatMap((q) => q.data ?? []);

  const board = useMemo(() => {
    if (!allLoaded || stats.length === 0) return [];
    const aggregated = aggregateCareer(stats);
    return computeBoard(aggregated, boardKey);
  }, [allLoaded, stats, boardKey]);

  if (!allLoaded) return <Loading />;

  const meta = BOARDS.find((b) => b.key === boardKey)!;
  if (board.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
        <Feather name="info" size={24} color={colors.mutedForeground} />
        <Body muted>No qualifying players yet.</Body>
      </View>
    );
  }

  return (
    <>
      {board.map((tier) => (
        <TierCard
          key={tier.label}
          tier={tier}
          headlineLabel={meta.headlineLabel}
          supportingLabel={meta.supportingLabel}
        />
      ))}
    </>
  );
}

function ByGradeBoard({ boardKey, grade }: { boardKey: BoardKey; grade: string }) {
  const { data, isLoading, isError } = useGetGradeLeaderboard(grade, {
    query: {
      enabled: !!grade,
      queryKey: getGetGradeLeaderboardQueryKey(grade),
    },
  });
  const meta = BOARDS.find((b) => b.key === boardKey)!;

  const board = useMemo(() => {
    if (!data) return [];
    const aggregated = data.map(statToAggregated);
    return computeBoard(aggregated, boardKey);
  }, [data, boardKey]);

  if (isLoading) return <Loading />;
  if (isError) return <ErrorView />;
  if (board.length === 0) {
    return <Body muted style={{ padding: 16 }}>No qualifying players in {grade}.</Body>;
  }

  return (
    <>
      {board.map((tier) => (
        <TierCard
          key={tier.label}
          tier={tier}
          headlineLabel={meta.headlineLabel}
          supportingLabel={meta.supportingLabel}
        />
      ))}
    </>
  );
}

export default function HonourBoardScreen() {
  const colors = useColors();
  const { board } = useLocalSearchParams<{ board: string }>();
  const boardKey = (board as BoardKey) ?? "runs";
  const meta = BOARDS.find((b) => b.key === boardKey);
  const [scope, setScope] = useState<Scope>("career");
  const [grade, setGrade] = useState<string | null>(null);
  const { data: grades } = useListGrades();

  if (!meta) return <ErrorView message="Unknown honour board" />;

  return (
    <>
      <Stack.Screen options={{ title: meta.label.toUpperCase() }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
      >
        <Heading size="lg">{meta.title}</Heading>
        <Body muted size={12} style={{ marginTop: 4, marginBottom: 16 }}>
          {meta.subtitle}
        </Body>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {(["career", "by-grade"] as Scope[]).map((s) => {
            const active = scope === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => {
                  setScope(s);
                  if (s === "by-grade" && !grade && grades?.length) {
                    setGrade(grades[0].grade);
                  }
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  alignItems: "center",
                  borderRadius: colors.radius,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Body
                  bold
                  size={12}
                  style={{
                    color: active ? colors.primaryForeground : colors.foreground,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {s === "career" ? "Career" : "By Grade"}
                </Body>
              </TouchableOpacity>
            );
          })}
        </View>

        {scope === "by-grade" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {(grades ?? []).map((g) => {
              const active = grade === g.grade;
              return (
                <TouchableOpacity
                  key={g.grade}
                  onPress={() => setGrade(g.grade)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: colors.radius,
                    backgroundColor: active ? colors.secondary : colors.card,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Body
                    size={11}
                    bold
                    style={{
                      color: active ? colors.primary : colors.foreground,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                    }}
                  >
                    {g.grade}
                  </Body>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {scope === "career" ? (
          <CareerBoard boardKey={boardKey} />
        ) : grade ? (
          <ByGradeBoard boardKey={boardKey} grade={grade} />
        ) : (
          <Body muted>Select a grade above.</Body>
        )}
      </ScrollView>
    </>
  );
}
