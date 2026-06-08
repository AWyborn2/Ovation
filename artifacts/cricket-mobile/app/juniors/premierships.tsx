import React, { useMemo, useState } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useListJuniorPremierships,
  type JuniorPremiership,
  type JuniorPremiershipPlayer,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { JUNIOR } from "@/lib/juniors";
import { PlaqueModal, type PlaquePlayer } from "@/components/premiership-plaque";

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

function RosterName({ p }: { p: JuniorPremiershipPlayer }) {
  const colors = useColors();
  if (p.participantId) {
    return (
      <Link href={`/juniors/players/${p.participantId}` as never} asChild>
        <TouchableOpacity activeOpacity={0.7}>
          <View
            style={{
              borderWidth: 1,
              borderColor: JUNIOR.accentBorder,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: JUNIOR.accentSoft,
            }}
          >
            <Body size={12} bold style={{ color: JUNIOR.accentDark }}>
              {p.playerName}
            </Body>
          </View>
        </TouchableOpacity>
      </Link>
    );
  }
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Body size={12} muted>{p.playerName}</Body>
    </View>
  );
}

function PremiershipCard({ prem, onOpen }: { prem: JuniorPremiership; onOpen: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onOpen}>
    <Card style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
      <View style={{ backgroundColor: JUNIOR.accent, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="award" size={18} color={JUNIOR.onAccent} />
          <Body bold size={15} style={{ color: JUNIOR.onAccent, flex: 1 }}>
            {prem.ageGroup ?? "Junior"}
            {prem.season ? ` · ${prem.season}` : ""}
          </Body>
          <Feather name="maximize-2" size={14} color={JUNIOR.onAccent} />
        </View>
        {prem.competition ? (
          <Body
            size={10}
            style={{
              color: JUNIOR.onAccent,
              opacity: 0.9,
              marginTop: 2,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {prem.competition}
          </Body>
        ) : null}
      </View>

      <View style={{ padding: 14, gap: 10 }}>
        {prem.opponent || prem.hhScore || prem.oppScore ? (
          <Body size={13}>
            {prem.opponent ? <Body size={13} muted>def. {prem.opponent} </Body> : null}
            {prem.hhScore || prem.oppScore ? `${prem.hhScore ?? "—"} vs ${prem.oppScore ?? "—"}` : ""}
          </Body>
        ) : null}
        {prem.resultText ? <Body size={13}>{prem.resultText}</Body> : null}

        {prem.players.length > 0 ? (
          <View>
            <Body
              bold
              size={10}
              style={{
                color: JUNIOR.accentDark,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              Roster
            </Body>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {prem.players.map((pl, i) => (
                <RosterName key={i} p={pl} />
              ))}
            </View>
          </View>
        ) : null}

        {prem.matchId != null ? (
          <Link href={`/juniors/matches/${prem.matchId}` as never} asChild>
            <TouchableOpacity activeOpacity={0.7}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Body bold size={13} style={{ color: JUNIOR.accentDark }}>
                  View deciding scorecard
                </Body>
                <Feather name="arrow-right" size={14} color={JUNIOR.accentDark} />
              </View>
            </TouchableOpacity>
          </Link>
        ) : null}
      </View>
    </Card>
    </TouchableOpacity>
  );
}

export default function JuniorPremiershipsScreen() {
  const colors = useColors();
  const { data, isLoading, isError } = useListJuniorPremierships();
  const [ageGroup, setAgeGroup] = useState("");
  const [active, setActive] = useState<JuniorPremiership | null>(null);

  const ageGroups = useMemo(() => {
    const set = new Set<string>();
    for (const p of data ?? []) if (p.ageGroup) set.add(p.ageGroup);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(
    () => (data ?? []).filter((p) => !ageGroup || p.ageGroup === ageGroup),
    [data, ageGroup],
  );

  return (
    <>
      <Stack.Screen options={{ title: "JUNIOR PREMIERSHIPS" }} />
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        {ageGroups.length > 0 ? (
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}
          >
            <FilterChip
              label="All ages"
              active={ageGroup === ""}
              onPress={() => setAgeGroup("")}
            />
            {ageGroups.map((a) => (
              <FilterChip
                key={a}
                label={a}
                active={ageGroup === a}
                onPress={() => setAgeGroup(ageGroup === a ? "" : a)}
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
            renderItem={({ item }) => (
              <PremiershipCard prem={item} onOpen={() => setActive(item)} />
            )}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
                <Feather name="award" size={28} color={colors.mutedForeground} />
                <Body muted>No junior premierships recorded</Body>
              </View>
            }
          />
        )}
      </View>

      {active ? (
        <PlaqueModal
          visible={active != null}
          onClose={() => setActive(null)}
          variant="junior"
          title={active.ageGroup ?? "Junior"}
          subtitle={[active.season ?? undefined, active.competition ?? undefined]
            .filter(Boolean)
            .join(" · ")}
          summary={
            active.opponent || active.hhScore || active.oppScore
              ? `${active.opponent ? `def. ${active.opponent}` : ""}${
                  (active.hhScore || active.oppScore)
                    ? `${active.opponent ? "  " : ""}${active.hhScore ?? "—"} vs ${active.oppScore ?? "—"}`
                    : ""
                }`.trim()
              : undefined
          }
          resultText={active.resultText ?? undefined}
          players={active.players.map<PlaquePlayer>((p, i) => ({
            key: String(i),
            name: p.playerName,
            href: p.participantId ? `/juniors/players/${p.participantId}` : null,
          }))}
          scorecard={
            active.matchId != null
              ? {
                  href: `/juniors/matches/${active.matchId}`,
                  label: "View deciding scorecard",
                }
              : null
          }
        />
      ) : null}
    </>
  );
}
