import React, { useMemo, useState } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useListMatches,
  useListGrades,
  type MatchSummary,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

function MatchRow({ match }: { match: MatchSummary }) {
  const colors = useColors();
  return (
    <Link href={`/matches/${match.id}` as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>
        <Card style={{ marginBottom: 8, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Heading size="sm">vs {match.opponent ?? "Unknown"}</Heading>
              <Body muted size={11} style={{ marginTop: 4 }}>
                {match.grade} · {fmtSeason(match.season)}
                {match.round != null ? ` · Rnd ${match.round}` : ""}
              </Body>
              {match.result ? (
                <Body size={12} style={{ marginTop: 4 }} numberOfLines={2}>
                  {match.result}
                </Body>
              ) : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                {fmtDate(match.matchDate) ? (
                  <Body muted size={11}>{fmtDate(match.matchDate)}</Body>
                ) : null}
                <Body muted size={11}>{match.playerCount} players</Body>
                {match.abandoned ? (
                  <Body size={11} bold style={{ color: colors.primary }}>ABANDONED</Body>
                ) : null}
              </View>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </Card>
      </TouchableOpacity>
    </Link>
  );
}

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
        {label}
      </Body>
    </TouchableOpacity>
  );
}

export default function MatchesScreen() {
  const colors = useColors();
  const [grade, setGrade] = useState<string>("");
  const [season, setSeason] = useState<number | null>(null);

  const { data, isLoading, isError } = useListMatches({
    grade: grade || undefined,
    season: season ?? undefined,
  });
  const { data: grades } = useListGrades();

  const gradeOptions = useMemo(
    () => (grades ?? []).map((g) => g.grade).filter((g) => g !== "CLUB TOTAL"),
    [grades],
  );

  const seasonOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of data ?? []) set.add(m.season);
    return Array.from(set).sort((a, b) => b - a);
  }, [data]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <FilterChip label="All grades" active={grade === ""} onPress={() => setGrade("")} />
        {gradeOptions.map((g) => (
          <FilterChip key={g} label={g} active={grade === g} onPress={() => setGrade(grade === g ? "" : g)} />
        ))}
      </View>

      {seasonOptions.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <FilterChip label="All seasons" active={season === null} onPress={() => setSeason(null)} />
          {seasonOptions.map((s) => (
            <FilterChip
              key={s}
              label={fmtSeason(s)}
              active={season === s}
              onPress={() => setSeason(season === s ? null : s)}
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
              <Body muted>No matches found</Body>
            </View>
          }
        />
      )}
    </View>
  );
}
