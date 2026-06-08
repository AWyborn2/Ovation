import React, { useState } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useListJuniorMatches,
  useGetJuniorsFilters,
  getListJuniorMatchesQueryKey,
  type JuniorMatchSummary,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { JUNIOR, fmtJuniorDate } from "@/lib/juniors";

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: colors.radius,
        backgroundColor: active ? JUNIOR.accent : colors.card,
        borderWidth: 1,
        borderColor: active ? JUNIOR.accent : colors.border,
      }}
    >
      <Body
        size={12}
        bold
        style={{
          color: active ? JUNIOR.onAccent : colors.foreground,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </Body>
    </TouchableOpacity>
  );
}

function MatchRow({ match }: { match: JuniorMatchSummary }) {
  const colors = useColors();
  return (
    <Link href={`/juniors/matches/${match.id}` as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>
        <Card style={{ marginBottom: 8, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {match.ageGroup ? (
                  <View
                    style={{
                      backgroundColor: JUNIOR.accentSoft,
                      borderWidth: 1,
                      borderColor: JUNIOR.accentBorder,
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                    }}
                  >
                    <Body
                      bold
                      size={9}
                      style={{
                        color: JUNIOR.accentDark,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      {match.ageGroup}
                    </Body>
                  </View>
                ) : null}
                <Heading size="sm">vs {match.opponentName ?? "Unknown"}</Heading>
              </View>
              <Body muted size={11} style={{ marginTop: 4 }}>
                {match.season ?? ""}
                {match.round ? ` · ${match.round}` : ""}
              </Body>
              {match.hhScore || match.opponentScore ? (
                <Body size={12} style={{ marginTop: 4 }}>
                  {match.hhScore ?? "—"} vs {match.opponentScore ?? "—"}
                </Body>
              ) : null}
              {match.hhResult ? (
                <Body size={12} style={{ marginTop: 4 }} numberOfLines={2}>
                  {match.hhResult}
                </Body>
              ) : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                {fmtJuniorDate(match.matchDate) ? (
                  <Body muted size={11}>{fmtJuniorDate(match.matchDate)}</Body>
                ) : null}
                {match.status ? <Body muted size={11}>{match.status}</Body> : null}
              </View>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </Card>
      </TouchableOpacity>
    </Link>
  );
}

export default function JuniorMatchesScreen() {
  const colors = useColors();
  const [season, setSeason] = useState("");
  const [ageGroup, setAgeGroup] = useState("");

  const { data: filters } = useGetJuniorsFilters();

  const seasonArg = season || undefined;
  const ageArg = ageGroup || undefined;

  const { data, isLoading, isError } = useListJuniorMatches(
    { season: seasonArg, ageGroup: ageArg },
    {
      query: {
        queryKey: getListJuniorMatchesQueryKey({ season: seasonArg, ageGroup: ageArg }),
      },
    },
  );

  return (
    <>
      <Stack.Screen options={{ title: "JUNIOR MATCHES" }} />
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        {(filters?.ageGroups?.length ?? 0) > 0 ? (
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}
          >
            <FilterChip
              label="All ages"
              active={ageGroup === ""}
              onPress={() => setAgeGroup("")}
            />
            {(filters?.ageGroups ?? []).map((a) => (
              <FilterChip
                key={a}
                label={a}
                active={ageGroup === a}
                onPress={() => setAgeGroup(ageGroup === a ? "" : a)}
              />
            ))}
          </View>
        ) : null}

        {(filters?.seasons?.length ?? 0) > 0 ? (
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}
          >
            <FilterChip
              label="All seasons"
              active={season === ""}
              onPress={() => setSeason("")}
            />
            {(filters?.seasons ?? []).map((s) => (
              <FilterChip
                key={s}
                label={s}
                active={season === s}
                onPress={() => setSeason(season === s ? "" : s)}
              />
            ))}
          </View>
        ) : null}

        {isLoading ? (
          <Loading />
        ) : isError || !data ? (
          <ErrorView />
        ) : (
          <FlatList
            data={data}
            keyExtractor={(m) => String(m.id)}
            renderItem={({ item }) => <MatchRow match={item} />}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
                <Feather name="clipboard" size={28} color={colors.mutedForeground} />
                <Body muted>No junior matches found</Body>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}
