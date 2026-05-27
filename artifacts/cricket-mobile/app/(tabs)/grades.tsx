import React from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useListGrades } from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

export default function GradesScreen() {
  const colors = useColors();
  const { data, isLoading, isError } = useListGrades();

  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorView />;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
    >
      <Body muted size={11} style={{ letterSpacing: 2, textTransform: "uppercase" }}>
        Tap a grade for its leaderboard
      </Body>
      <Heading size="xl" style={{ marginTop: 4, marginBottom: 16 }}>
        All Grades
      </Heading>

      {data.map((g) => (
        <Link
          key={g.grade}
          href={`/grades/${encodeURIComponent(g.grade)}` as never}
          asChild
        >
          <TouchableOpacity activeOpacity={0.7}>
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: colors.radius,
                    backgroundColor: colors.secondary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="layers" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Heading size="md">{g.grade}</Heading>
                  <Body muted size={12} style={{ marginTop: 2 }}>
                    {g.players ?? 0} players · {(g.games ?? 0).toLocaleString()} games
                  </Body>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Body bold size={14} style={{ color: colors.primary }}>
                    {(g.runs ?? 0).toLocaleString()}r
                  </Body>
                  <Body muted size={11}>
                    {(g.wickets ?? 0).toLocaleString()}w · {(g.catches ?? 0).toLocaleString()}ct
                  </Body>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
              </View>
            </Card>
          </TouchableOpacity>
        </Link>
      ))}
    </ScrollView>
  );
}
