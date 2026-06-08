import React, { useMemo, useState } from "react";
import { FlatList, TextInput, TouchableOpacity, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useListJuniorPlayers,
  useGetJuniorLeaderboards,
  useGetJuniorsFilters,
  getListJuniorPlayersQueryKey,
  getGetJuniorLeaderboardsQueryKey,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { JUNIOR, fmtJuniorDate, fmtNum, fmtSeasonSpan } from "@/lib/juniors";

type Tab = "directory" | "runs" | "wickets" | "games" | "innings" | "bowling";

const TABS: { key: Tab; label: string }[] = [
  { key: "directory", label: "Players" },
  { key: "runs", label: "Runs" },
  { key: "wickets", label: "Wickets" },
  { key: "games", label: "Games" },
  { key: "innings", label: "High Scores" },
  { key: "bowling", label: "Best Bowling" },
];

function Chip({
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

function PlayerLink({
  participantId,
  children,
}: {
  participantId: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={`/juniors/players/${participantId}` as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>{children}</TouchableOpacity>
    </Link>
  );
}

/** A leaderboard row: rank + name + up to three trailing stat columns. */
function LeaderRow({
  rank,
  participantId,
  name,
  sub,
  cols,
}: {
  rank: number;
  participantId: string;
  name: string;
  sub?: string;
  cols: { value: string | number; bold?: boolean }[];
}) {
  const colors = useColors();
  return (
    <PlayerLink participantId={participantId}>
      <Card style={{ marginBottom: 6, padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Body muted size={12} style={{ width: 26 }}>
            {rank}
          </Body>
          <View style={{ flex: 1 }}>
            <Body size={13} bold numberOfLines={1}>
              {name}
            </Body>
            {sub ? (
              <Body muted size={11} style={{ marginTop: 2 }} numberOfLines={1}>
                {sub}
              </Body>
            ) : null}
          </View>
          {cols.map((c, i) => (
            <Body
              key={i}
              bold={c.bold}
              size={13}
              style={{
                width: 56,
                textAlign: "right",
                color: c.bold ? JUNIOR.accentDark : colors.foreground,
              }}
            >
              {c.value}
            </Body>
          ))}
        </View>
      </Card>
    </PlayerLink>
  );
}

export default function JuniorPlayersScreen() {
  const colors = useColors();
  const [tab, setTab] = useState<Tab>("directory");
  const [search, setSearch] = useState("");
  const [season, setSeason] = useState("");
  const [ageGroup, setAgeGroup] = useState("");

  const { data: filters } = useGetJuniorsFilters();

  const inDirectory = tab === "directory";
  const inGames = tab === "games";

  const searchArg = inDirectory ? search.trim() || undefined : undefined;
  const seasonArg = inDirectory ? season || undefined : undefined;
  const ageArg = inDirectory ? ageGroup || undefined : undefined;

  const {
    data: players,
    isLoading: playersLoading,
    isError: playersError,
  } = useListJuniorPlayers(
    { search: searchArg, season: seasonArg, ageGroup: ageArg },
    {
      query: {
        enabled: inDirectory || inGames,
        queryKey: getListJuniorPlayersQueryKey({
          search: searchArg,
          season: seasonArg,
          ageGroup: ageArg,
        }),
      },
    },
  );

  const gamesRanked = useMemo(
    () =>
      [...(players ?? [])]
        .sort((a, b) => (b.matches ?? 0) - (a.matches ?? 0))
        .slice(0, 50),
    [players],
  );

  const {
    data: leaderboards,
    isLoading: lbLoading,
    isError: lbError,
  } = useGetJuniorLeaderboards({
    query: {
      enabled: !inDirectory && !inGames,
      queryKey: getGetJuniorLeaderboardsQueryKey(),
    },
  });

  function renderBody() {
    if (inDirectory) {
      if (playersLoading) return <Loading />;
      if (playersError) return <ErrorView />;
      if (!players || players.length === 0) {
        return (
          <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
            <Feather name="users" size={28} color={colors.mutedForeground} />
            <Body muted>No junior players found</Body>
          </View>
        );
      }
      return (
        <FlatList
          data={players}
          keyExtractor={(p) => p.participantId}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p }) => (
            <PlayerLink participantId={p.participantId}>
              <Card style={{ marginBottom: 6, padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Body size={13} bold numberOfLines={1}>
                      {p.displayName}
                    </Body>
                    <Body muted size={11} style={{ marginTop: 2 }}>
                      {fmtSeasonSpan(p.firstSeason, p.lastSeason)}
                    </Body>
                  </View>
                  <View style={{ alignItems: "flex-end", marginRight: 8 }}>
                    <Body bold size={13} style={{ color: JUNIOR.accentDark }}>
                      {p.runs ?? 0}r
                    </Body>
                    <Body muted size={11}>
                      {p.matches ?? 0}g · {p.wickets ?? 0}w
                    </Body>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </View>
              </Card>
            </PlayerLink>
          )}
        />
      );
    }

    if (inGames) {
      if (playersLoading) return <Loading />;
      if (playersError) return <ErrorView />;
      if (gamesRanked.length === 0) {
        return (
          <Body muted style={{ textAlign: "center", padding: 32 }}>
            No leaderboard data available.
          </Body>
        );
      }
      return (
        <FlatList
          data={gamesRanked}
          keyExtractor={(p) => p.participantId}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p, index }) => (
            <LeaderRow
              rank={index + 1}
              participantId={p.participantId}
              name={p.displayName}
              cols={[{ value: p.matches ?? 0, bold: true }]}
            />
          )}
        />
      );
    }

    if (lbLoading) return <Loading />;
    if (lbError) return <ErrorView />;
    if (!leaderboards) {
      return (
        <Body muted style={{ textAlign: "center", padding: 32 }}>
          No leaderboard data available.
        </Body>
      );
    }

    if (tab === "runs") {
      return (
        <FlatList
          data={leaderboards.mostRuns}
          keyExtractor={(p, i) => `${p.participantId}-${i}`}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p, index }) => (
            <LeaderRow
              rank={index + 1}
              participantId={p.participantId}
              name={p.displayName}
              sub={`${p.innings} inn · HS ${p.highScore ?? "—"} · Avg ${fmtNum(p.average, 2)}`}
              cols={[{ value: p.runs, bold: true }]}
            />
          )}
        />
      );
    }

    if (tab === "wickets") {
      return (
        <FlatList
          data={leaderboards.mostWickets}
          keyExtractor={(p, i) => `${p.participantId}-${i}`}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p, index }) => (
            <LeaderRow
              rank={index + 1}
              participantId={p.participantId}
              name={p.displayName}
              sub={`${p.matches} mts · Best ${p.bestWickets ?? "—"} · Econ ${fmtNum(p.economy, 2)}`}
              cols={[{ value: p.wickets, bold: true }]}
            />
          )}
        />
      );
    }

    if (tab === "innings") {
      return (
        <FlatList
          data={leaderboards.highestScores}
          keyExtractor={(p, i) => `${p.participantId}-${p.matchId}-${i}`}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: p, index }) => (
            <LeaderRow
              rank={index + 1}
              participantId={p.participantId}
              name={p.displayName}
              sub={`vs ${p.opponentName ?? "—"} · ${p.season ?? fmtJuniorDate(p.matchDate) ?? "—"}`}
              cols={[
                {
                  value: `${p.runs}${p.balls != null ? ` (${p.balls})` : ""}`,
                  bold: true,
                },
              ]}
            />
          )}
        />
      );
    }

    // bowling figures
    return (
      <FlatList
        data={leaderboards.bestBowling}
        keyExtractor={(p, i) => `${p.participantId}-${p.matchId}-${i}`}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: p, index }) => (
          <LeaderRow
            rank={index + 1}
            participantId={p.participantId}
            name={p.displayName}
            sub={`vs ${p.opponentName ?? "—"} · ${p.season ?? fmtJuniorDate(p.matchDate) ?? "—"}`}
            cols={[{ value: `${p.wickets}/${p.runs}`, bold: true }]}
          />
        )}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "JUNIOR PLAYERS" }} />
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
        <View style={{ marginBottom: 12 }}>
          <FlatList
            data={TABS}
            keyExtractor={(t) => t.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item: t }) => (
              <Chip label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />
            )}
          />
        </View>

        {inDirectory ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.card,
                borderRadius: colors.radius,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 12,
                marginBottom: 10,
              }}
            >
              <Feather name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search junior players"
                placeholderTextColor={colors.mutedForeground}
                style={{
                  flex: 1,
                  color: colors.foreground,
                  fontFamily: "Montserrat_400Regular",
                  fontSize: 15,
                  paddingVertical: 12,
                  paddingHorizontal: 8,
                }}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              ) : null}
            </View>

            {(filters?.ageGroups?.length ?? 0) > 0 ? (
              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}
              >
                <Chip label="All ages" active={ageGroup === ""} onPress={() => setAgeGroup("")} />
                {(filters?.ageGroups ?? []).map((a) => (
                  <Chip
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
                <Chip label="All seasons" active={season === ""} onPress={() => setSeason("")} />
                {(filters?.seasons ?? []).map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    active={season === s}
                    onPress={() => setSeason(season === s ? "" : s)}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {renderBody()}
      </View>
    </>
  );
}
