import React, { useState } from "react";
import {
  FlatList,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useListPlayers,
  type Player,
} from "@workspace/api-client-react";

import { Body, Card, ErrorView, Heading, Loading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

type Sort = "games" | "runs" | "wickets" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "games", label: "Games" },
  { key: "runs", label: "Runs" },
  { key: "wickets", label: "Wickets" },
  { key: "name", label: "A-Z" },
];

function PlayerRow({ player }: { player: Player }) {
  const colors = useColors();
  return (
    <Link href={`/players/${player.id}` as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>
        <Card style={{ marginBottom: 8, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Heading size="sm">
                {player.surname}, {player.givenName}
              </Heading>
              <Body muted size={11} style={{ marginTop: 4 }} numberOfLines={1}>
                {player.gradesPlayed || "—"}
              </Body>
            </View>
            <View style={{ alignItems: "flex-end", marginRight: 8 }}>
              <Body bold size={14} style={{ color: colors.primary }}>
                {(player.totalRuns ?? 0).toLocaleString()}r
              </Body>
              <Body muted size={11}>
                {player.totalGames ?? 0}g · {player.totalWickets ?? 0}w
              </Body>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </Card>
      </TouchableOpacity>
    </Link>
  );
}

export default function PlayersScreen() {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<Sort>("runs");

  const { data, isLoading, isError } = useListPlayers({
    search: search || undefined,
    sortBy,
    sortOrder: sortBy === "name" ? "asc" : "desc",
    limit: 500,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: 12,
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search players"
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

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {SORTS.map((s) => {
          const active = s.key === sortBy;
          return (
            <TouchableOpacity
              key={s.key}
              onPress={() => setSortBy(s.key)}
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
          data={data.players}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item }) => <PlayerRow player={item} />}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 32, gap: 8 }}>
              <Feather name="users" size={28} color={colors.mutedForeground} />
              <Body muted>No players found</Body>
            </View>
          }
        />
      )}
    </View>
  );
}
