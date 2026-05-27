import React, { useMemo, useState } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetGradeLeaderboard,
  getGetGradeLeaderboardQueryKey,
  type Stat,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

type Sort = "runs" | "wickets" | "games" | "catches" | "batAvg";

const SORTS: { key: Sort; label: string; get: (s: Stat) => number }[] = [
  { key: "runs", label: "Runs", get: (s) => s.runs ?? 0 },
  { key: "wickets", label: "Wickets", get: (s) => s.wickets ?? 0 },
  { key: "games", label: "Games", get: (s) => s.games ?? 0 },
  { key: "catches", label: "Catches", get: (s) => s.catches ?? 0 },
  { key: "batAvg", label: "Bat Avg", get: (s) => s.batAvg ?? 0 },
];

export default function GradeLeaderboardScreen() {
  const colors = useColors();
  const { grade } = useLocalSearchParams<{ grade: string }>();
  const decoded = decodeURIComponent(grade ?? "");
  const [sort, setSort] = useState<Sort>("runs");

  const { data, isLoading, isError } = useGetGradeLeaderboard(decoded, {
    query: {
      enabled: !!decoded,
      queryKey: getGetGradeLeaderboardQueryKey(decoded),
    },
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    const cfg = SORTS.find((s) => s.key === sort)!;
    return [...data].sort((a, b) => cfg.get(b) - cfg.get(a));
  }, [data, sort]);

  return (
    <>
      <Stack.Screen options={{ title: decoded.toUpperCase() }} />
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <Heading size="lg">{decoded} Leaderboard</Heading>
        <Body muted size={12} style={{ marginTop: 4, marginBottom: 12 }}>
          Tap a player for full career stats
        </Body>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {SORTS.map((s) => {
            const active = s.key === sort;
            return (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSort(s.key)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: colors.radius,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Body
                  size={12}
                  bold
                  style={{
                    color: active ? colors.primaryForeground : colors.foreground,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {s.label}
                </Body>
              </TouchableOpacity>
            );
          })}
        </View>

        {isLoading ? (
          <Loading />
        ) : isError || !data ? (
          <ErrorView />
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(s) => String(s.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            renderItem={({ item, index }) => {
              const cfg = SORTS.find((x) => x.key === sort)!;
              return (
                <Link href={`/players/${item.playerId}` as never} asChild>
                  <TouchableOpacity activeOpacity={0.7}>
                    <Card style={{ marginBottom: 8, padding: 14 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ width: 32, alignItems: "center" }}>
                          <Heading size="md">{index + 1}</Heading>
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Body bold>
                            {item.surname}, {item.givenName}
                          </Body>
                          <Body muted size={11} style={{ marginTop: 2 }}>
                            {item.games ?? 0}g · {(item.runs ?? 0).toLocaleString()}r · {item.wickets ?? 0}w
                          </Body>
                        </View>
                        <View style={{ alignItems: "flex-end", marginRight: 6 }}>
                          <Heading size="md">
                            {sort === "batAvg"
                              ? (item.batAvg != null ? item.batAvg.toFixed(2) : "-")
                              : cfg.get(item).toLocaleString()}
                          </Heading>
                          <Body muted size={10} style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                            {cfg.label}
                          </Body>
                        </View>
                        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                      </View>
                    </Card>
                  </TouchableOpacity>
                </Link>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", padding: 32 }}>
                <Body muted>No stats recorded for this grade.</Body>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}
