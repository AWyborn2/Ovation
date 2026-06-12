import React from "react";
import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { BRAND } from "@/constants/brand";
import {
  useGetJuniorMatch,
  getGetJuniorMatchQueryKey,
} from "@workspace/api-client-react";

import { Body, ErrorView, Heading, Loading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { JUNIOR, fmtJuniorDate } from "@/lib/juniors";
import { JuniorDigitalScorecard } from "@/components/junior-scorecard";

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: JUNIOR.accentSoft,
        borderWidth: 1,
        borderColor: JUNIOR.accentBorder,
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 2,
      }}
    >
      <Body
        bold
        size={10}
        style={{
          color: JUNIOR.accentDark,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {children}
      </Body>
    </View>
  );
}

export default function JuniorMatchDetailScreen() {
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const { data: match, isLoading, isError } = useGetJuniorMatch(matchId, {
    query: {
      enabled: Number.isFinite(matchId),
      queryKey: getGetJuniorMatchQueryKey(matchId),
    },
  });

  if (isLoading) return <Loading />;
  if (isError || !match) return <ErrorView message="Match not found" />;

  return (
    <>
      <Stack.Screen options={{ title: "JUNIOR SCORECARD" }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {match.ageGroup ? <Tag>{match.ageGroup}</Tag> : null}
          {match.status ? <Tag>{match.status}</Tag> : null}
        </View>

        <Heading size="lg" style={{ marginTop: 12 }}>
          {BRAND.shortName} vs {match.opponentName ?? "Unknown"}
        </Heading>
        <Body
          muted
          size={12}
          style={{ marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}
        >
          {match.season ?? ""}
          {match.round ? ` · ${match.round}` : ""}
          {match.competition ? ` · ${match.competition}` : ""}
          {match.association ? ` · ${match.association}` : ""}
        </Body>

        {match.hhScore || match.opponentScore ? (
          <Body bold size={16} style={{ marginTop: 8 }}>
            {match.hhScore ?? "—"} <Body muted size={13}>vs</Body>{" "}
            {match.opponentScore ?? "—"}
          </Body>
        ) : null}
        {match.hhResult ? (
          <Body bold size={13} style={{ color: JUNIOR.accentDark, marginTop: 6 }}>
            {match.hhResult}
          </Body>
        ) : null}

        <View style={{ flexDirection: "row", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          {fmtJuniorDate(match.matchDate) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="calendar" size={13} color={colors.mutedForeground} />
              <Body muted size={12}>{fmtJuniorDate(match.matchDate)}</Body>
            </View>
          ) : null}
          {match.venue ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Feather name="map-pin" size={13} color={colors.mutedForeground} />
              <Body muted size={12}>
                {[match.venueOval, match.venue, match.venueSuburb]
                  .filter(Boolean)
                  .join(" · ")}
              </Body>
            </View>
          ) : null}
        </View>

        <View style={{ marginTop: 16 }}>
          <JuniorDigitalScorecard match={match} />
        </View>
      </ScrollView>
    </>
  );
}
