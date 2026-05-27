import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useGetDashboard } from "@workspace/api-client-react";

import {
  Body,
  Card,
  ErrorView,
  Heading,
  Loading,
  SectionHeader,
  StatTile,
  styles,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";

function TopPerformerRow({
  label,
  name,
  value,
  href,
  icon,
}: {
  label: string;
  name: string;
  value: string;
  href: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  const colors = useColors();
  return (
    <Link href={href as never} asChild>
      <Card style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name={icon} size={20} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Body size={11} muted style={{ textTransform: "uppercase", letterSpacing: 1 }}>
              {label}
            </Body>
            <Body bold size={16} style={{ marginTop: 2 }}>
              {name}
            </Body>
          </View>
          <Heading size="lg">{value}</Heading>
        </View>
      </Card>
    </Link>
  );
}

export default function DashboardScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useGetDashboard();
  const colors = useColors();

  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorView />;

  const tr = data.topRunScorer;
  const tw = data.topWicketTaker;
  const tf = data.topFielder;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
    >
      <View>
        <Body muted size={11} style={{ letterSpacing: 2, textTransform: "uppercase" }}>
          Halls Head Cricket Club · Est. 1991
        </Body>
        <Heading size="xl" style={{ marginTop: 4 }}>Club Totals</Heading>
      </View>

      <View style={[styles.row, { marginTop: 16 }]}>
        <StatTile label="Players" value={data.totalPlayers} />
        <StatTile label="Games" value={data.totalGames} />
      </View>
      <View style={[styles.row, { marginTop: 12 }]}>
        <StatTile label="Runs" value={data.totalRuns} />
        <StatTile label="Wickets" value={data.totalWickets} />
      </View>

      <SectionHeader icon="star" title="Top Performers" />
      <TopPerformerRow
        label="Most Career Runs"
        name={`${tr.givenName} ${tr.surname}`}
        value={(tr.totalRuns ?? 0).toLocaleString()}
        href={`/players/${tr.id}`}
        icon="trending-up"
      />
      <TopPerformerRow
        label="Most Career Wickets"
        name={`${tw.givenName} ${tw.surname}`}
        value={(tw.totalWickets ?? 0).toLocaleString()}
        href={`/players/${tw.id}`}
        icon="target"
      />
      <TopPerformerRow
        label="Most Games Played"
        name={`${tf.givenName} ${tf.surname}`}
        value={(tf.totalGames ?? 0).toLocaleString()}
        href={`/players/${tf.id}`}
        icon="shield"
      />

      <SectionHeader icon="layers" title="Grades" />
      {(data.gradeSummaries ?? []).map((g) => (
        <Link key={g.grade} href={`/grades/${encodeURIComponent(g.grade)}` as never} asChild>
          <Card style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Heading size="sm">{g.grade}</Heading>
                <Body muted size={12} style={{ marginTop: 2 }}>
                  {g.players ?? 0} players · {(g.games ?? 0).toLocaleString()} games
                </Body>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Body bold size={14} style={{ color: colors.primary }}>
                  {(g.runs ?? 0).toLocaleString()} runs
                </Body>
                <Body muted size={12}>
                  {(g.wickets ?? 0).toLocaleString()} wickets
                </Body>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
            </View>
          </Card>
        </Link>
      ))}
    </ScrollView>
  );
}
