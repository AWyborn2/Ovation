import React from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Body, Card, Heading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { BOARDS, type BoardKey } from "@/lib/honour-boards";

const ICONS: Record<BoardKey, keyof typeof Feather.glyphMap> = {
  games: "shield",
  runs: "trending-up",
  wickets: "target",
  dismissals: "shield",
  highscores: "star",
  bestbowling: "zap",
  centurions: "award",
  fivefers: "crosshair",
};

export default function HonoursScreen() {
  const colors = useColors();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
    >
      <Body muted size={11} style={{ letterSpacing: 2, textTransform: "uppercase" }}>
        Career milestones · X Club legends
      </Body>
      <Heading size="xl" style={{ marginTop: 4, marginBottom: 16 }}>
        Honour Boards
      </Heading>

      {BOARDS.map((b) => (
        <Link key={b.key} href={`/honours/${b.key}` as never} asChild>
          <TouchableOpacity activeOpacity={0.7}>
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: colors.radius,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={ICONS[b.key]} size={22} color={colors.primaryForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Heading size="md">{b.title}</Heading>
                  <Body muted size={12} style={{ marginTop: 2 }}>
                    {b.subtitle}
                  </Body>
                </View>
                <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
              </View>
            </Card>
          </TouchableOpacity>
        </Link>
      ))}

      <Link href={"/honours/awards" as never} asChild>
        <TouchableOpacity activeOpacity={0.7}>
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: colors.radius,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="award" size={22} color={colors.primaryForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Heading size="md">Club Awards</Heading>
                <Body muted size={12} style={{ marginTop: 2 }}>
                  Honour rolls for each club award
                </Body>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </View>
          </Card>
        </TouchableOpacity>
      </Link>

      <Link href={"/premierships" as never} asChild>
        <TouchableOpacity activeOpacity={0.7}>
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: colors.radius,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="flag" size={22} color={colors.primaryForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Heading size="md">Premierships</Heading>
                <Body muted size={12} style={{ marginTop: 2 }}>
                  Grand Final winners · tap a result for the scorecard
                </Body>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </View>
          </Card>
        </TouchableOpacity>
      </Link>
    </ScrollView>
  );
}
