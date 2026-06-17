import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetSeniorOverview,
  useGetSeniorSeasonTopPerformers,
  useGetDashboard,
  type MatchSummary,
  type SeasonLeader,
} from "@workspace/api-client-react";

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
import { BRAND } from "@/constants/brand";

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

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

function RecentMatchRow({ match }: { match: MatchSummary }) {
  const colors = useColors();
  return (
    <Link href={`/matches/${match.id}` as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>
        <Card style={{ marginBottom: 8, padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Body size={11} bold style={{ color: colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                {match.grade}
              </Body>
              <Heading size="sm" style={{ marginTop: 2 }}>vs {match.opponent ?? "Unknown"}</Heading>
              {match.clubScore || match.opponentScore ? (
                <Body size={12} style={{ marginTop: 4 }}>
                  {match.clubScore ?? "—"} vs {match.opponentScore ?? "—"}
                </Body>
              ) : null}
              {match.result ? (
                <Body muted size={12} style={{ marginTop: 4 }} numberOfLines={2}>
                  {match.result}
                </Body>
              ) : null}
              {fmtDate(match.matchDate) ? (
                <Body muted size={11} style={{ marginTop: 4 }}>{fmtDate(match.matchDate)}</Body>
              ) : null}
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </Card>
      </TouchableOpacity>
    </Link>
  );
}

function LeaderRow({
  label,
  leader,
  icon,
}: {
  label: string;
  leader: SeasonLeader;
  icon: keyof typeof Feather.glyphMap;
}) {
  const colors = useColors();
  return (
    <Link href={`/players/${leader.playerId}` as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>
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
                {leader.givenName} {leader.surname}
              </Body>
            </View>
            <Heading size="lg">{leader.value.toLocaleString()}</Heading>
          </View>
        </Card>
      </TouchableOpacity>
    </Link>
  );
}

// Season picker value: "latest" (default), "all" (all-time), or a season year.
type SeasonChoice = "latest" | "all" | number;

export default function DashboardScreen() {
  const { data, isLoading, isError, refetch, isRefetching } = useGetSeniorOverview();
  const { data: dashboard } = useGetDashboard();
  const colors = useColors();
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [season, setSeason] = useState<SeasonChoice>("latest");

  // Top performers drive BOTH the leader rows AND the grade chips: the response
  // carries availableGrades for the resolved season (or all grades, all-time).
  const seasonParams =
    season === "all" ? { allTime: true } : season === "latest" ? {} : { season };
  const { data: tp } = useGetSeniorSeasonTopPerformers({
    ...(gradeFilter ? { grade: gradeFilter } : {}),
    ...seasonParams,
  });

  const gradeOptions = useMemo(() => tp?.availableGrades ?? [], [tp?.availableGrades]);

  // If the chosen grade has no records in the newly-selected season, fall back
  // to the club-wide list so we never show an empty, stale grade filter.
  useEffect(() => {
    if (gradeFilter && tp && !tp.availableGrades.includes(gradeFilter)) {
      setGradeFilter("");
    }
  }, [tp, gradeFilter]);

  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorView />;

  const topRunScorers = tp?.topRunScorers ?? [];
  const topWicketTakers = tp?.topWicketTakers ?? [];

  // Header label for the resolved season ("All time" when aggregating).
  const seasonTitle =
    season === "all"
      ? "Top Performers · All time"
      : tp?.seasonLabel
        ? `Top Performers · ${tp.seasonLabel}`
        : "Top Performers";

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
          {BRAND.name} · Est. {BRAND.foundedYear}
        </Body>
        <Heading size="xl" style={{ marginTop: 4 }}>Club Totals</Heading>
      </View>

      <View style={[styles.row, { marginTop: 16 }]}>
        <StatTile label="Players" value={data.totals.players} />
        <StatTile label="Games" value={data.totals.games} />
      </View>
      <View style={[styles.row, { marginTop: 12 }]}>
        <StatTile label="Runs" value={data.totals.runs} />
        <StatTile label="Wickets" value={data.totals.wickets} />
      </View>

      {/* Recent matches — most recent game of each grade in the latest season */}
      {data.recentMatches.length > 0 ? (
        <>
          <SectionHeader
            icon="clipboard"
            title={data.latestSeasonLabel ? `Recent Matches · ${data.latestSeasonLabel}` : "Recent Matches"}
          />
          {data.recentMatches.map((m) => (
            <RecentMatchRow key={m.id} match={m} />
          ))}
        </>
      ) : null}

      {/* Top performers — season picker + season-aware grade chips */}
      <SectionHeader icon="star" title={seasonTitle} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {data.availableSeasons.map((s) => (
          <FilterChip
            key={s.season}
            label={s.label}
            active={season === s.season || (season === "latest" && s.season === data.latestSeason)}
            onPress={() => setSeason(s.season)}
          />
        ))}
        <FilterChip label="All time" active={season === "all"} onPress={() => setSeason("all")} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <FilterChip label="All grades" active={gradeFilter === ""} onPress={() => setGradeFilter("")} />
        {gradeOptions.map((g) => (
          <FilterChip
            key={g}
            label={g}
            active={gradeFilter === g}
            onPress={() => setGradeFilter(gradeFilter === g ? "" : g)}
          />
        ))}
      </View>

      {topRunScorers.length === 0 && topWicketTakers.length === 0 ? (
        <Card>
          <Body muted>No stats recorded for this season yet.</Body>
        </Card>
      ) : (
        <>
          {topRunScorers.length > 0 ? (
            <LeaderRow
              label="Most Runs"
              leader={topRunScorers[0]}
              icon="trending-up"
            />
          ) : null}
          {topWicketTakers.length > 0 ? (
            <LeaderRow
              label="Most Wickets"
              leader={topWicketTakers[0]}
              icon="target"
            />
          ) : null}
        </>
      )}

      <SectionHeader icon="layers" title="Grades" />
      {(dashboard?.gradeSummaries ?? []).map((g) => (
        <Link key={g.grade} href={`/grades/${encodeURIComponent(g.grade)}` as never} asChild>
          <TouchableOpacity activeOpacity={0.7}>
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
          </TouchableOpacity>
        </Link>
      ))}
    </ScrollView>
  );
}
