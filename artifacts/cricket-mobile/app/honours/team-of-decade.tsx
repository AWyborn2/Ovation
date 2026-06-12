import React from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Link, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { BRAND } from "@/constants/brand";
import {
  useListTeamOfDecadeBoards,
  type TeamOfDecadeBoard,
  type TeamOfDecadeMember,
} from "@workspace/api-client-react";

import { Body, Card, Heading, Loading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

function sortMembers(members: TeamOfDecadeMember[]): TeamOfDecadeMember[] {
  return [...members].sort(
    (a, b) =>
      a.battingOrder - b.battingOrder ||
      a.displayOrder - b.displayOrder ||
      a.id - b.id,
  );
}

function memberBadges(m: TeamOfDecadeMember): string[] {
  const badges: string[] = [];
  if (m.isCaptain) badges.push("C");
  if (m.isViceCaptain) badges.push("VC");
  if (m.isWicketkeeper) badges.push("WK");
  return badges;
}

function MemberRow({ member, rank }: { member: TeamOfDecadeMember; rank: number }) {
  const colors = useColors();
  const badges = memberBadges(member);

  const inner = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        gap: 4,
      }}
    >
      <Body bold size={13} style={{ width: 26, color: colors.primary }}>
        {rank}
      </Body>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Body
          bold
          size={14}
          style={{ color: member.playerId != null ? colors.primary : colors.foreground }}
        >
          {member.name}
        </Body>
        {badges.map((b) => (
          <View
            key={b}
            style={{
              backgroundColor: colors.secondary,
              borderRadius: 4,
              paddingHorizontal: 5,
              paddingVertical: 1,
            }}
          >
            <Body bold size={9} style={{ color: colors.primary, letterSpacing: 0.5 }}>
              {b}
            </Body>
          </View>
        ))}
        {member.role ? (
          <Body muted size={11} style={{ fontStyle: "italic" }}>
            {member.role}
          </Body>
        ) : null}
      </View>
      {member.playerId != null ? (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      ) : null}
    </View>
  );

  if (member.playerId != null) {
    return (
      <Link href={`/players/${member.playerId}` as never} asChild>
        <TouchableOpacity activeOpacity={0.7}>{inner}</TouchableOpacity>
      </Link>
    );
  }
  return inner;
}

function BoardCard({ board }: { board: TeamOfDecadeBoard }) {
  const colors = useColors();
  const members = sortMembers(board.members);
  const labels = [board.teamLabel, board.periodLabel].filter(Boolean).join(" · ");

  return (
    <Card style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
      <View
        style={{
          backgroundColor: colors.primary,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Feather name="users" size={18} color={colors.primaryForeground} />
        <View style={{ flex: 1 }}>
          <Heading size="sm" style={{ color: colors.primaryForeground }}>
            {board.title}
          </Heading>
          {labels ? (
            <Body size={11} style={{ color: colors.primaryForeground, opacity: 0.9, marginTop: 2 }}>
              {labels}
            </Body>
          ) : null}
        </View>
        <Body size={11} bold style={{ color: colors.primaryForeground }}>
          {members.length}
        </Body>
      </View>

      {board.subtitle ? (
        <Body muted size={12} style={{ paddingHorizontal: 14, paddingTop: 12, fontStyle: "italic" }}>
          {board.subtitle}
        </Body>
      ) : null}

      {members.length === 0 ? (
        <Body muted size={12} style={{ padding: 16, fontStyle: "italic" }}>
          No players selected yet.
        </Body>
      ) : (
        <View style={{ paddingTop: 4, paddingBottom: 4 }}>
          {members.map((m, i) => (
            <MemberRow key={m.id} member={m} rank={i + 1} />
          ))}
        </View>
      )}
    </Card>
  );
}

export default function TeamOfDecadeScreen() {
  const colors = useColors();
  const { data: boards, isLoading } = useListTeamOfDecadeBoards();

  const sorted = [...(boards ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
  );

  return (
    <>
      <Stack.Screen options={{ title: "TEAM OF THE DECADE" }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
      >
        <Heading size="lg">Teams of the Decade</Heading>
        <Body muted size={12} style={{ marginTop: 4, marginBottom: 16 }}>
          The greatest XIs in {BRAND.name} history — selected to honour the
          finest players of each era.
        </Body>

        {isLoading ? (
          <Loading />
        ) : sorted.length === 0 ? (
          <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
            <Feather name="info" size={24} color={colors.mutedForeground} />
            <Body muted>No Teams of the Decade have been published yet.</Body>
          </View>
        ) : (
          sorted.map((b) => <BoardCard key={b.id} board={b} />)
        )}
      </ScrollView>
    </>
  );
}
