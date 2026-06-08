import React from "react";
import { Linking, ScrollView, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useGetJuniorsOverview } from "@workspace/api-client-react";

import { Body, Card, Heading, Loading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { JUNIOR, fmtJuniorDate } from "@/lib/juniors";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { navIcon } from "@/lib/nav-icons";

// Hard-coded fallback used until the nav config loads (or if it fails). Mirrors
// the seeded junior_quick_links surface so the tab is never empty.
const JUNIOR_QUICK_LINKS_FALLBACK: ResolvedNavItem[] = [
  {
    label: "Matches",
    target: "/juniors/matches",
    isExternal: false,
    iconKey: "clipboardList",
    description: "Browse junior games and full scorecards.",
  },
  {
    label: "Premierships",
    target: "/juniors/premierships",
    isExternal: false,
    iconKey: "crown",
    description: "Junior honour boards and winning rosters.",
  },
  {
    label: "Players & Leaders",
    target: "/juniors/players",
    isExternal: false,
    iconKey: "users",
    description: "Runs, wickets and games leaderboards.",
  },
];

function StatTile({ label, value }: { label: string; value: number | string }) {
  const colors = useColors();
  return (
    <Card style={{ flex: 1, padding: 12, alignItems: "center" }}>
      <Body
        bold
        style={{
          color: JUNIOR.accentDark,
          fontFamily: "Oswald_700Bold",
          fontSize: 24,
        }}
      >
        {value}
      </Body>
      <Body
        muted
        size={9}
        style={{
          textTransform: "uppercase",
          letterSpacing: 1,
          marginTop: 2,
          textAlign: "center",
        }}
      >
        {label}
      </Body>
    </Card>
  );
}

function QuickLinkCard({ item }: { item: ResolvedNavItem }) {
  const colors = useColors();
  return (
    <Card style={{ padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: JUNIOR.accentSoft,
          }}
        >
          <Feather name={navIcon(item.iconKey, "chevron-right")} size={20} color={JUNIOR.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Heading size="sm">{item.label}</Heading>
          {item.description ? (
            <Body muted size={12} style={{ marginTop: 2 }}>
              {item.description}
            </Body>
          ) : null}
        </View>
        <Feather
          name={item.isExternal ? "external-link" : "chevron-right"}
          size={18}
          color={colors.mutedForeground}
        />
      </View>
    </Card>
  );
}

function QuickLink({ item }: { item: ResolvedNavItem }) {
  // External targets open in the device browser; internal targets use the
  // in-app router. Mirrors the web app's internal/external handling.
  if (item.isExternal) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => void Linking.openURL(item.target)}>
        <QuickLinkCard item={item} />
      </TouchableOpacity>
    );
  }
  return (
    <Link href={item.target as never} asChild>
      <TouchableOpacity activeOpacity={0.7}>
        <QuickLinkCard item={item} />
      </TouchableOpacity>
    </Link>
  );
}

function LeaderList({
  title,
  rows,
}: {
  title: string;
  rows: { participantId: string; displayName: string; value: number }[];
}) {
  const colors = useColors();
  if (rows.length === 0) return null;
  return (
    <Card style={{ marginBottom: 10, padding: 14 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}
      >
        <Feather name="trending-up" size={15} color={JUNIOR.accent} />
        <Heading size="sm">{title}</Heading>
      </View>
      {rows.map((p, i) => (
        <Link key={p.participantId} href={`/juniors/players/${p.participantId}` as never} asChild>
          <TouchableOpacity activeOpacity={0.7}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 7,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Body muted size={12} style={{ width: 22 }}>
                {i + 1}
              </Body>
              <Body size={13} style={{ flex: 1 }} numberOfLines={1}>
                {p.displayName}
              </Body>
              <Body bold size={13} style={{ color: JUNIOR.accentDark }}>
                {p.value}
              </Body>
            </View>
          </TouchableOpacity>
        </Link>
      ))}
    </Card>
  );
}

export default function JuniorsOverviewScreen() {
  const colors = useColors();
  const { data, isLoading } = useGetJuniorsOverview();
  const quickLinks = useNavSurface("junior_quick_links", JUNIOR_QUICK_LINKS_FALLBACK);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <View
        style={{
          backgroundColor: JUNIOR.accentSoft,
          borderWidth: 1,
          borderColor: JUNIOR.accentBorder,
          borderRadius: colors.radius,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="star" size={14} color={JUNIOR.accentDark} />
          <Body
            bold
            size={11}
            style={{ color: JUNIOR.accentDark, textTransform: "uppercase", letterSpacing: 2 }}
          >
            Juniors
          </Body>
        </View>
        <Heading size="lg" style={{ marginTop: 6 }}>
          Junior Cricket
        </Heading>
        <Body muted size={13} style={{ marginTop: 4 }}>
          Match results, scorecards, premierships and player stats for Halls Head's
          junior grades.
        </Body>
      </View>

      {isLoading ? (
        <Loading />
      ) : !data ? (
        <Body muted style={{ textAlign: "center", padding: 32 }}>
          No junior data available yet.
        </Body>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <StatTile label="Matches" value={data.totals.matches} />
            <StatTile label="Players" value={data.totals.players} />
            <StatTile label="Premierships" value={data.totals.premierships} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            <StatTile label="Seasons" value={data.totals.seasons} />
            <StatTile label="Age Groups" value={data.totals.ageGroups} />
          </View>

          {quickLinks.map((item) => (
            <QuickLink key={`${item.target}-${item.label}`} item={item} />
          ))}

          {data.recentMatches.length > 0 ? (
            <>
              <View style={{ marginTop: 16, marginBottom: 10 }}>
                <Heading size="md">Recent Matches</Heading>
              </View>
              {data.recentMatches.map((m) => (
                <Link key={m.id} href={`/juniors/matches/${m.id}` as never} asChild>
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
                            {m.ageGroup ? (
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
                                  {m.ageGroup}
                                </Body>
                              </View>
                            ) : null}
                            <Heading size="sm">vs {m.opponentName ?? "Unknown"}</Heading>
                          </View>
                          <Body muted size={11} style={{ marginTop: 4 }}>
                            {m.season ?? ""}
                            {m.round ? ` · ${m.round}` : ""}
                          </Body>
                          {m.hhScore || m.opponentScore ? (
                            <Body size={12} style={{ marginTop: 4 }}>
                              {m.hhScore ?? "—"} vs {m.opponentScore ?? "—"}
                            </Body>
                          ) : null}
                          {m.hhResult ? (
                            <Body size={12} style={{ marginTop: 4 }} numberOfLines={2}>
                              {m.hhResult}
                            </Body>
                          ) : null}
                          {fmtJuniorDate(m.matchDate) ? (
                            <Body muted size={11} style={{ marginTop: 4 }}>
                              {fmtJuniorDate(m.matchDate)}
                            </Body>
                          ) : null}
                        </View>
                        <Feather
                          name="chevron-right"
                          size={18}
                          color={colors.mutedForeground}
                        />
                      </View>
                    </Card>
                  </TouchableOpacity>
                </Link>
              ))}
            </>
          ) : null}

          <View style={{ marginTop: 8 }} />
          <LeaderList
            title="Top Run Scorers"
            rows={data.topRunScorers.map((p) => ({
              participantId: p.participantId,
              displayName: p.displayName,
              value: p.runs,
            }))}
          />
          <LeaderList
            title="Top Wicket Takers"
            rows={data.topWicketTakers.map((p) => ({
              participantId: p.participantId,
              displayName: p.displayName,
              value: p.wickets,
            }))}
          />
        </>
      )}
    </ScrollView>
  );
}
