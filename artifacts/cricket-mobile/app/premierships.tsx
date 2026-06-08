import React, { useMemo, useState } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useListPremierships,
  type Premiership,
  type PremiershipPlayer,
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

function PlayerName({ p }: { p: PremiershipPlayer }) {
  const colors = useColors();
  const display = p.name.replace(/\s+/g, " ").trim();
  const label = p.isCaptain ? `${display} (c)` : display;
  if (p.playerId) {
    return (
      <Link href={`/players/${p.playerId}` as never} asChild>
        <TouchableOpacity activeOpacity={0.7}>
          <Body size={12} bold style={{ color: colors.primary }}>
            {label}
          </Body>
        </TouchableOpacity>
      </Link>
    );
  }
  return <Body size={12}>{label}</Body>;
}

function ResultBlock({ prem }: { prem: Premiership }) {
  const colors = useColors();
  if (!prem.result) return null;
  const text = prem.result.replace(/\s+def\s+/i, " def ");

  if (prem.matchId) {
    return (
      <Link href={`/matches/${prem.matchId}` as never} asChild>
        <TouchableOpacity activeOpacity={0.7}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: colors.radius,
              backgroundColor: colors.primary,
            }}
          >
            <Feather name="award" size={16} color={colors.primaryForeground} />
            <Body bold size={12} style={{ flex: 1, color: colors.primaryForeground }}>
              {text}
            </Body>
            <Feather name="chevron-right" size={18} color={colors.primaryForeground} />
          </View>
        </TouchableOpacity>
      </Link>
    );
  }

  return (
    <View
      style={{
        marginTop: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: colors.radius,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Body bold size={12}>{text}</Body>
    </View>
  );
}

function PremiershipCard({ prem }: { prem: Premiership }) {
  const colors = useColors();
  return (
    <Card style={{ marginBottom: 10, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Heading size="sm">{prem.grade}</Heading>
          <Body muted size={11} style={{ marginTop: 4 }}>
            {fmtSeason(prem.year)}
            {prem.competition ? ` · ${prem.competition}` : ""}
          </Body>
        </View>
      </View>

      {(prem.venue || prem.matchDate) ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
          {prem.venue ? <Body muted size={11}>{prem.venue}</Body> : null}
          {fmtDate(prem.matchDate) ? <Body muted size={11}>{fmtDate(prem.matchDate)}</Body> : null}
        </View>
      ) : null}

      {prem.players.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {prem.players.map((p) => (
            <PlayerName key={p.id} p={p} />
          ))}
        </View>
      ) : null}

      {prem.mom ? (
        <Body size={12} style={{ marginTop: 10 }}>
          <Body size={12} muted bold>M.O.M · </Body>
          {prem.mom}
        </Body>
      ) : null}

      <ResultBlock prem={prem} />
    </Card>
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

export default function PremiershipsScreen() {
  const colors = useColors();
  const { data, isLoading, isError } = useListPremierships();
  const [grade, setGrade] = useState<string>("");

  const gradeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of data ?? []) set.add(p.grade);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const list = grade ? (data ?? []).filter((p) => p.grade === grade) : (data ?? []);
    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return (b.matchDate ?? "").localeCompare(a.matchDate ?? "");
    });
  }, [data, grade]);

  return (
    <>
      <Stack.Screen options={{ title: "PREMIERSHIPS" }} />
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        {gradeOptions.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <FilterChip label="All grades" active={grade === ""} onPress={() => setGrade("")} />
            {gradeOptions.map((g) => (
              <FilterChip
                key={g}
                label={g}
                active={grade === g}
                onPress={() => setGrade(grade === g ? "" : g)}
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
            data={filtered}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item }) => <PremiershipCard prem={item} />}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
                <Feather name="award" size={28} color={colors.mutedForeground} />
                <Body muted>No premierships found</Body>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}
