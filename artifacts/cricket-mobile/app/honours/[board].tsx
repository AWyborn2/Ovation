import React, { useMemo, useState } from "react";
import { SectionList, TouchableOpacity, View } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueries } from "@tanstack/react-query";
import {
  useGetGradeLeaderboard,
  useListGrades,
  getGetGradeLeaderboardQueryOptions,
  getGetGradeLeaderboardQueryKey,
} from "@workspace/api-client-react";

import { Body, ErrorView, Heading, Loading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  BOARDS,
  aggregateCareer,
  computeBoard,
  statToAggregated,
  type BoardKey,
  type BoardRow,
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

function TierSectionHeader({
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
    <View
      style={{
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: 1,
        borderColor: colors.border,
        borderTopLeftRadius: colors.radius,
        borderTopRightRadius: colors.radius,
        overflow: "hidden",
      }}
    >
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
    </View>
  );
}

function TierRow({
  tier,
  row,
  index,
  isLast,
}: {
  tier: BoardTier;
  row: BoardRow;
  index: number;
  isLast: boolean;
}) {
  const colors = useColors();
  return (
    <Link href={`/players/${row.playerId}` as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderTopWidth: 1,
            borderColor: colors.border,
            backgroundColor: index % 2 ? "#00000011" : "transparent",
            overflow: "hidden",
            ...(isLast
              ? {
                  borderBottomWidth: 1,
                  borderBottomLeftRadius: colors.radius,
                  borderBottomRightRadius: colors.radius,
                  marginBottom: 14,
                }
              : null),
          }}
        >
          <Body bold size={12} style={{ width: 28, color: colors.primary }}>
            {tier.startRank + index}
          </Body>
          <View style={{ flex: 1 }}>
            <Body bold size={13}>
              {row.surname}
            </Body>
            <Body muted size={11}>
              {row.givenName}
            </Body>
          </View>
          <Body bold size={13} style={{ width: 80, textAlign: "right" }}>
            {row.headline}
          </Body>
          <Body muted size={11} style={{ width: 70, textAlign: "right" }}>
            {row.supporting}
          </Body>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

function useCareerBoard(boardKey: BoardKey, opts: { enabled: boolean }) {
  const { data: grades } = useListGrades();
  const gradeNames = grades?.map((g) => g.grade) ?? [];

  const leaderboards = useQueries({
    queries: gradeNames.map((g) => ({
      ...getGetGradeLeaderboardQueryOptions(g),
      enabled: opts.enabled,
    })),
  });

  const allLoaded =
    opts.enabled &&
    gradeNames.length > 0 &&
    leaderboards.every((q) => q.data !== undefined || q.isError);
  const stats = leaderboards.flatMap((q) => q.data ?? []);

  const board = useMemo(() => {
    if (!allLoaded || stats.length === 0) return [];
    const aggregated = aggregateCareer(stats);
    return computeBoard(aggregated, boardKey);
  }, [allLoaded, stats, boardKey]);

  return { loading: opts.enabled && !allLoaded, board };
}

function useGradeBoard(boardKey: BoardKey, grade: string | null, opts: { enabled: boolean }) {
  const enabled = opts.enabled && !!grade;
  const { data, isLoading, isError } = useGetGradeLeaderboard(grade ?? "", {
    query: {
      enabled,
      queryKey: getGetGradeLeaderboardQueryKey(grade ?? ""),
    },
  });

  const board = useMemo(() => {
    if (!data) return [];
    const aggregated = data.map(statToAggregated);
    return computeBoard(aggregated, boardKey);
  }, [data, boardKey]);

  return { loading: enabled && isLoading, error: enabled && isError, board };
}

export default function HonourBoardScreen() {
  const colors = useColors();
  const { board: boardParam } = useLocalSearchParams<{ board: string }>();
  const boardKey = (boardParam as BoardKey) ?? "runs";
  const meta = BOARDS.find((b) => b.key === boardKey);
  const [scope, setScope] = useState<Scope>("career");
  const [grade, setGrade] = useState<string | null>(null);
  const { data: grades } = useListGrades();

  const career = useCareerBoard(boardKey, { enabled: scope === "career" });
  const gradeBoard = useGradeBoard(boardKey, grade, { enabled: scope === "by-grade" });

  const activeBoard = scope === "career" ? career.board : gradeBoard.board;

  const sections = useMemo(
    () => activeBoard.map((tier) => ({ tier, data: tier.rows })),
    [activeBoard],
  );

  if (!meta) return <ErrorView message="Unknown honour board" />;

  let emptyContent: React.ReactNode;
  if (scope === "career") {
    emptyContent = career.loading ? (
      <Loading />
    ) : (
      <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
        <Feather name="info" size={24} color={colors.mutedForeground} />
        <Body muted>No qualifying players yet.</Body>
      </View>
    );
  } else if (!grade) {
    emptyContent = <Body muted>Select a grade above.</Body>;
  } else if (gradeBoard.loading) {
    emptyContent = <Loading />;
  } else if (gradeBoard.error) {
    emptyContent = <ErrorView />;
  } else {
    emptyContent = (
      <Body muted style={{ padding: 16 }}>
        No qualifying players in {grade}.
      </Body>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: meta.label.toUpperCase() }} />
      <SectionList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
        sections={sections}
        keyExtractor={(item) => String(item.playerId)}
        renderItem={({ item, index, section }) => (
          <TierRow
            tier={section.tier}
            row={item}
            index={index}
            isLast={index === section.data.length - 1}
          />
        )}
        renderSectionHeader={({ section }) => (
          <TierSectionHeader
            tier={section.tier}
            headlineLabel={meta.headlineLabel}
            supportingLabel={meta.supportingLabel}
          />
        )}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={emptyContent}
        ListHeaderComponent={
          <>
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
          </>
        }
      />
    </>
  );
}
