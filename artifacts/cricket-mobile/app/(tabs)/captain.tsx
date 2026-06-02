import React, { useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCaptainLogin,
  useCaptainLogout,
  useGetCaptainVotingBoard,
  useSubmitBallot,
  getGetCaptainVotingBoardQueryKey,
  type Captain,
  type VotableAward,
  type VotableGrade,
  type VotableRound,
  type VotableRoundPlayer,
} from "@workspace/api-client-react";

import { Body, Card, Heading, Loading, styles } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  useCurrentCaptain,
  useInvalidateCaptain,
  handleCaptainMutationError,
} from "@/lib/captain-auth";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

export default function CaptainScreen() {
  const colors = useColors();
  const me = useCurrentCaptain();

  if (me.isLoading) {
    return <Loading />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {!me.data ? <LoginGate /> : <CaptainHome captain={me.data} />}
    </View>
  );
}

function LoginGate() {
  const colors = useColors();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateCaptain();
  const login = useCaptainLogin({
    mutation: {
      onSuccess: () => {
        setError(null);
        invalidate();
      },
      onError: (e) => {
        const status = (e as { status?: number })?.status;
        setError(status === 401 ? "Incorrect username or password." : "Sign-in failed.");
      },
    },
  });

  const submit = () => {
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    login.mutate({ data: { username, password } });
  };

  const inputStyle = {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: colors.radius,
    color: colors.foreground,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.scroll, { justifyContent: "center", flexGrow: 1 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Body muted size={11} style={{ letterSpacing: 2, textTransform: "uppercase" }}>
        Captain · 3-2-1 voting
      </Body>
      <Heading size="xl" style={{ marginTop: 4, marginBottom: 8 }}>
        Captain sign-in
      </Heading>
      <Body muted size={13} style={{ marginBottom: 20 }}>
        Grade captains sign in here to submit their 3-2-1 votes each round.
      </Body>

      <Card style={{ gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Body bold size={12} muted style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            Username
          </Body>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="Username"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Body bold size={12} muted style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            Password
          </Body>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            placeholder="Password"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            onSubmitEditing={submit}
          />
        </View>
        {error ? (
          <Body size={13} style={{ color: colors.destructive }}>
            {error}
          </Body>
        ) : null}
        <TouchableOpacity
          onPress={submit}
          disabled={login.isPending}
          activeOpacity={0.8}
          style={{
            backgroundColor: colors.primary,
            borderRadius: colors.radius,
            paddingVertical: 14,
            alignItems: "center",
            opacity: login.isPending ? 0.6 : 1,
          }}
        >
          <Body bold size={14} style={{ color: colors.primaryForeground, letterSpacing: 1 }}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </Body>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}

function CaptainHome({ captain }: { captain: Captain }) {
  const colors = useColors();
  const invalidate = useInvalidateCaptain();
  const logout = useCaptainLogout({ mutation: { onSettled: invalidate } });
  const board = useGetCaptainVotingBoard();
  const awards = board.data ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={board.isRefetching}
          onRefresh={board.refetch}
          tintColor={colors.primary}
        />
      }
    >
      <Card style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Body size={11} muted style={{ textTransform: "uppercase", letterSpacing: 1 }}>
            Captain · 3-2-1 voting
          </Body>
          <Heading size="md" style={{ marginTop: 2 }}>
            {captain.displayName}
          </Heading>
          <Body muted size={12} style={{ marginTop: 2 }}>
            @{captain.username}
            {captain.grades.length > 0 ? ` · ${captain.grades.join(", ")}` : ""}
          </Body>
        </View>
        <TouchableOpacity
          onPress={() => logout.mutate()}
          disabled={logout.isPending}
          activeOpacity={0.7}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: colors.radius,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Body size={12} bold style={{ color: colors.foreground }}>
            Sign out
          </Body>
        </TouchableOpacity>
      </Card>

      {board.isLoading ? (
        <Loading />
      ) : awards.length === 0 ? (
        <Card>
          <Body muted size={13} style={{ fontStyle: "italic" }}>
            You have no awards open for voting right now. Once an admin opens an
            award for one of your grades and a match scorecard is imported, the
            rounds will appear here.
          </Body>
        </Card>
      ) : (
        awards.map((award) => <AwardVotingCard key={award.configId} award={award} />)
      )}
    </ScrollView>
  );
}

function AwardVotingCard({ award }: { award: VotableAward }) {
  const colors = useColors();
  return (
    <Card style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
      <View
        style={{
          backgroundColor: colors.primary,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Feather name="check-square" size={18} color={colors.primaryForeground} />
        <Heading size="sm" style={{ flex: 1, color: colors.primaryForeground }}>
          {award.awardTitle} {formatSeason(award.season)}
        </Heading>
        {!award.votingOpen ? (
          <View
            style={{
              backgroundColor: colors.primaryForeground,
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Body size={10} bold style={{ color: colors.primary }}>
              CLOSED
            </Body>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 14, gap: 18 }}>
        {award.grades.map((g) => (
          <GradeSection key={g.grade} configId={award.configId} grade={g} />
        ))}
      </View>
    </Card>
  );
}

function GradeSection({ configId, grade }: { configId: number; grade: VotableGrade }) {
  const colors = useColors();
  const rounds = grade.rounds.slice().sort((a, b) => b.round - a.round);
  return (
    <View style={{ gap: 10 }}>
      <Body bold size={12} muted style={{ textTransform: "uppercase", letterSpacing: 1 }}>
        {grade.grade}
      </Body>
      {rounds.length === 0 ? (
        <Body muted size={12} style={{ fontStyle: "italic" }}>
          No imported rounds yet.
        </Body>
      ) : (
        rounds.map((round) => (
          <RoundBallot
            key={round.round}
            configId={configId}
            grade={grade.grade}
            round={round}
          />
        ))
      )}
    </View>
  );
}

function RoundBallot({
  configId,
  grade,
  round,
}: {
  configId: number;
  grade: string;
  round: VotableRound;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const submit = useSubmitBallot();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<{
    pick1: number | null;
    pick2: number | null;
    pick3: number | null;
  }>({
    pick1: round.ballot?.pick1PlayerId ?? null,
    pick2: round.ballot?.pick2PlayerId ?? null,
    pick3: round.ballot?.pick3PlayerId ?? null,
  });

  const nameOf = (id: number | null) =>
    round.players.find((p) => p.playerId === id)?.name ?? null;

  const reset = () => {
    setPicks({
      pick1: round.ballot?.pick1PlayerId ?? null,
      pick2: round.ballot?.pick2PlayerId ?? null,
      pick3: round.ballot?.pick3PlayerId ?? null,
    });
    setError(null);
  };

  const save = () => {
    setError(null);
    if (picks.pick1 == null || picks.pick2 == null || picks.pick3 == null) {
      setError("Select all three players (3, 2 and 1 votes).");
      return;
    }
    const ids = [picks.pick1, picks.pick2, picks.pick3];
    if (new Set(ids).size !== 3) {
      setError("The three picks must be different players.");
      return;
    }
    submit.mutate(
      {
        data: {
          configId,
          grade,
          round: round.round,
          pick1PlayerId: picks.pick1,
          pick2PlayerId: picks.pick2,
          pick3PlayerId: picks.pick3,
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          queryClient.invalidateQueries({
            queryKey: getGetCaptainVotingBoardQueryKey(),
          });
        },
        onError: (e) => setError(handleCaptainMutationError(e)),
      },
    );
  };

  const hasBallot = round.ballot != null;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: colors.radius,
        padding: 12,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Body bold size={14}>
            Round {round.round}
            {round.opponent ? (
              <Body size={14} muted>
                {"  "}vs {round.opponent}
              </Body>
            ) : null}
          </Body>
          {hasBallot && !open ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
              <VoteChip n="3" name={nameOf(round.ballot!.pick1PlayerId)} />
              <VoteChip n="2" name={nameOf(round.ballot!.pick2PlayerId)} />
              <VoteChip n="1" name={nameOf(round.ballot!.pick3PlayerId)} />
            </View>
          ) : !open ? (
            <Body muted size={12} style={{ marginTop: 4, fontStyle: "italic" }}>
              No vote submitted yet.
            </Body>
          ) : null}
        </View>
        {round.locked ? (
          <Body size={11} muted>
            Locked
          </Body>
        ) : !open ? (
          <TouchableOpacity
            onPress={() => setOpen(true)}
            activeOpacity={0.7}
            style={{
              backgroundColor: hasBallot ? "transparent" : colors.primary,
              borderWidth: 1,
              borderColor: hasBallot ? colors.border : colors.primary,
              borderRadius: colors.radius,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <Body
              size={12}
              bold
              style={{ color: hasBallot ? colors.foreground : colors.primaryForeground }}
            >
              {hasBallot ? "Edit vote" : "Vote"}
            </Body>
          </TouchableOpacity>
        ) : null}
      </View>

      {open ? (
        <View style={{ gap: 10, marginTop: 2 }}>
          <PickSelect
            label="3 votes"
            players={round.players}
            value={picks.pick1}
            exclude={[picks.pick2, picks.pick3]}
            onChange={(v) => setPicks((p) => ({ ...p, pick1: v }))}
          />
          <PickSelect
            label="2 votes"
            players={round.players}
            value={picks.pick2}
            exclude={[picks.pick1, picks.pick3]}
            onChange={(v) => setPicks((p) => ({ ...p, pick2: v }))}
          />
          <PickSelect
            label="1 vote"
            players={round.players}
            value={picks.pick3}
            exclude={[picks.pick1, picks.pick2]}
            onChange={(v) => setPicks((p) => ({ ...p, pick3: v }))}
          />
          {error ? (
            <Body size={13} style={{ color: colors.destructive }}>
              {error}
            </Body>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={save}
              disabled={submit.isPending}
              activeOpacity={0.8}
              style={{
                flex: 1,
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                paddingVertical: 12,
                alignItems: "center",
                opacity: submit.isPending ? 0.6 : 1,
              }}
            >
              <Body bold size={13} style={{ color: colors.primaryForeground }}>
                {submit.isPending ? "Saving…" : "Save vote"}
              </Body>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                reset();
                setOpen(false);
              }}
              activeOpacity={0.7}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: colors.radius,
                paddingVertical: 12,
                paddingHorizontal: 18,
                alignItems: "center",
              }}
            >
              <Body bold size={13} style={{ color: colors.foreground }}>
                Cancel
              </Body>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function VoteChip({ n, name }: { n: string; name: string | null }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginTop: 2 }}>
      <Body bold size={13} style={{ color: colors.primary, marginRight: 4 }}>
        {n}
      </Body>
      <Body size={13}>{name ?? "—"}</Body>
    </View>
  );
}

function PickSelect({
  label,
  players,
  value,
  exclude,
  onChange,
}: {
  label: string;
  players: VotableRoundPlayer[];
  value: number | null;
  exclude: (number | null)[];
  onChange: (v: number | null) => void;
}) {
  const colors = useColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  const excludeSet = new Set(exclude.filter((x): x is number => x != null));
  const selectedName = players.find((p) => p.playerId === value)?.name ?? null;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Body bold size={12} style={{ color: colors.primary, width: 56 }}>
        {label}
      </Body>
      <TouchableOpacity
        onPress={() => setPickerOpen(true)}
        activeOpacity={0.7}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: colors.radius,
          paddingHorizontal: 12,
          paddingVertical: 11,
        }}
      >
        <Body size={14} muted={selectedName == null} style={{ flex: 1 }} numberOfLines={1}>
          {selectedName ?? "Select a player"}
        </Body>
        <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPickerOpen(false)}
          style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <TouchableOpacity activeOpacity={1} style={{ maxHeight: "70%" }}>
            <View
              style={{
                backgroundColor: colors.card,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingTop: 16,
                paddingBottom: 32,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 18,
                  paddingBottom: 12,
                }}
              >
                <Heading size="sm">{label}</Heading>
                <TouchableOpacity onPress={() => setPickerOpen(false)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <ScrollView>
                <Row
                  label="— Clear selection —"
                  muted
                  selected={value == null}
                  onPress={() => {
                    onChange(null);
                    setPickerOpen(false);
                  }}
                />
                {players.map((p) => {
                  const disabled = excludeSet.has(p.playerId);
                  return (
                    <Row
                      key={p.playerId}
                      label={p.name}
                      disabled={disabled}
                      selected={p.playerId === value}
                      onPress={() => {
                        if (disabled) return;
                        onChange(p.playerId);
                        setPickerOpen(false);
                      }}
                    />
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Row({
  label,
  onPress,
  selected,
  disabled,
  muted,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  muted?: boolean;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Body
        size={15}
        muted={muted}
        style={{ color: selected ? colors.primary : undefined }}
      >
        {label}
        {disabled ? "  (already picked)" : ""}
      </Body>
      {selected ? <Feather name="check" size={18} color={colors.primary} /> : null}
    </TouchableOpacity>
  );
}
