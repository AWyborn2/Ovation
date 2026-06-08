import React from "react";
import {
  Modal,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Body } from "@/components/ui";

/**
 * Reusable full-screen "honour board" plaque shown when a premiership card is
 * tapped. Two variants:
 *  - "senior": a metallic silver engraved plaque (navy/gold senior side).
 *  - "junior": a deep-green honour board with gold lettering and a gold frame,
 *    matching the emerald junior section while reading as a gold-themed board.
 *
 * Data is normalised by the caller so the same component renders both the
 * senior (`Premiership`) and junior (`JuniorPremiership`) shapes. Player links
 * and the deciding-scorecard link are driven by `href` values; tapping any of
 * them closes the modal and navigates so the destination is visible.
 */

export type PlaquePlayer = {
  key: string;
  name: string;
  href?: string | null;
  isCaptain?: boolean;
};

export type PlaqueModalProps = {
  visible: boolean;
  onClose: () => void;
  variant: "senior" | "junior";
  /** Grade (senior) or age group (junior). */
  title: string;
  /** Season · competition line shown under the title. */
  subtitle?: string | null;
  /** Small lines under the subtitle (e.g. venue, date). */
  meta?: (string | null | undefined)[];
  /** Single summary line (e.g. junior scoreline). */
  summary?: string | null;
  /** Result text ("X def Y"). */
  resultText?: string | null;
  /** When true, the result banner itself links to the scorecard (senior). */
  resultLinksToScorecard?: boolean;
  /** Man of the match name. */
  mom?: string | null;
  rosterLabel?: string;
  players: PlaquePlayer[];
  /** Deciding-scorecard link. */
  scorecard?: { href: string; label: string } | null;
};

type PlaqueTheme = {
  plate: [string, string, ...string[]];
  plateLoc: [number, number, ...number[]];
  start: { x: number; y: number };
  end: { x: number; y: number };
  frameOuter: string;
  frameInner: string;
  title: string;
  text: string;
  subtext: string;
  chipBg: string;
  chipBorder: string;
  chipText: string;
  chipLinkBg: string;
  chipLinkBorder: string;
  chipLinkText: string;
  bannerBg: string;
  bannerText: string;
  bannerIcon: string;
  divider: string;
};

const SENIOR_THEME: PlaqueTheme = {
  plate: ["#c8ccd1", "#e8ebee", "#b8bdc4", "#d8dce0", "#aeb3ba", "#c8ccd1"],
  plateLoc: [0, 0.2, 0.4, 0.6, 0.8, 1],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
  frameOuter: "#6b7280",
  frameInner: "#9ca3af",
  title: "#0f172a",
  text: "#0f172a",
  subtext: "#334155",
  chipBg: "rgba(15,23,42,0.05)",
  chipBorder: "rgba(15,23,42,0.18)",
  chipText: "#0f172a",
  chipLinkBg: "rgba(15,23,42,0.09)",
  chipLinkBorder: "rgba(15,23,42,0.4)",
  chipLinkText: "#0f172a",
  bannerBg: "#0f172a",
  bannerText: "#ffffff",
  bannerIcon: "#E7C66B",
  divider: "rgba(15,23,42,0.18)",
};

const JUNIOR_THEME: PlaqueTheme = {
  plate: ["#065f46", "#03543f", "#022c22"],
  plateLoc: [0, 0.55, 1],
  start: { x: 0.1, y: 0 },
  end: { x: 0.9, y: 1 },
  frameOuter: "#C9A646",
  frameInner: "#E7C66B",
  title: "#F6E7B0",
  text: "#F6E7B0",
  subtext: "#E7C66B",
  chipBg: "rgba(231,198,107,0.1)",
  chipBorder: "rgba(231,198,107,0.35)",
  chipText: "#F6E7B0",
  chipLinkBg: "rgba(231,198,107,0.16)",
  chipLinkBorder: "rgba(231,198,107,0.6)",
  chipLinkText: "#F6E7B0",
  bannerBg: "rgba(231,198,107,0.14)",
  bannerText: "#F6E7B0",
  bannerIcon: "#E7C66B",
  divider: "rgba(231,198,107,0.3)",
};

function RosterChip({
  player,
  theme,
  onGo,
}: {
  player: PlaquePlayer;
  theme: PlaqueTheme;
  onGo: (href: string) => void;
}) {
  const label = player.isCaptain ? `${player.name} (c)` : player.name;
  const linked = !!player.href;
  const inner = (
    <View
      style={{
        borderWidth: 1,
        borderColor: linked ? theme.chipLinkBorder : theme.chipBorder,
        backgroundColor: linked ? theme.chipLinkBg : theme.chipBg,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Body size={13} bold style={{ color: linked ? theme.chipLinkText : theme.chipText }}>
        {label}
      </Body>
    </View>
  );
  if (linked && player.href) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => onGo(player.href!)}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

export function PlaqueModal({
  visible,
  onClose,
  variant,
  title,
  subtitle,
  meta,
  summary,
  resultText,
  resultLinksToScorecard,
  mom,
  rosterLabel = "Premiership Team",
  players,
  scorecard,
}: PlaqueModalProps) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const theme = variant === "senior" ? SENIOR_THEME : JUNIOR_THEME;

  const plaqueWidth = Math.min(width - 24, 460);

  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };

  const metaLines = (meta ?? []).filter((m): m is string => !!m && m.trim().length > 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)" }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            paddingTop: 48,
            paddingHorizontal: 16,
            paddingBottom: 8,
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close plaque"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.12)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.3)",
            }}
          >
            <Feather name="x" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{
            alignItems: "center",
            paddingHorizontal: 12,
            paddingBottom: 48,
          }}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={theme.plate}
            locations={theme.plateLoc}
            start={theme.start}
            end={theme.end}
            style={{
              width: plaqueWidth,
              minHeight: Math.min(height * 0.5, 420),
              borderRadius: 8,
              padding: 6,
            }}
          >
            <View
              style={{
                flex: 1,
                borderWidth: 2,
                borderColor: theme.frameOuter,
                borderRadius: 4,
                padding: 4,
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.frameInner,
                  borderRadius: 2,
                  paddingHorizontal: 20,
                  paddingVertical: 22,
                  alignItems: "center",
                }}
              >
                <Feather name="award" size={26} color={theme.subtext} />

                <Body
                  size={22}
                  style={{
                    fontFamily: "Oswald_700Bold",
                    color: theme.title,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    textAlign: "center",
                    marginTop: 8,
                  }}
                >
                  {title}
                </Body>

                {subtitle ? (
                  <Body
                    size={12}
                    bold
                    style={{
                      color: theme.subtext,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    {subtitle}
                  </Body>
                ) : null}

                {metaLines.map((m) => (
                  <Body
                    key={m}
                    size={11}
                    style={{
                      color: theme.subtext,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      textAlign: "center",
                      marginTop: 3,
                    }}
                  >
                    {m}
                  </Body>
                ))}

                {summary ? (
                  <Body
                    size={13}
                    style={{ color: theme.text, textAlign: "center", marginTop: 10 }}
                  >
                    {summary}
                  </Body>
                ) : null}

                {players.length > 0 ? (
                  <>
                    <View
                      style={{
                        height: 1,
                        alignSelf: "stretch",
                        backgroundColor: theme.divider,
                        marginVertical: 16,
                      }}
                    />
                    <Body
                      size={10}
                      bold
                      style={{
                        color: theme.subtext,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        marginBottom: 12,
                      }}
                    >
                      {rosterLabel}
                    </Body>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      {players.map((p) => (
                        <RosterChip key={p.key} player={p} theme={theme} onGo={go} />
                      ))}
                    </View>
                  </>
                ) : null}

                {mom ? (
                  <Body
                    size={12}
                    bold
                    style={{
                      color: theme.text,
                      textAlign: "center",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      marginTop: 16,
                    }}
                  >
                    {`M.O.M · ${mom}`}
                  </Body>
                ) : null}

                {resultText && resultLinksToScorecard && scorecard ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => go(scorecard.href)}
                    style={{ alignSelf: "stretch", marginTop: 18 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 8,
                        backgroundColor: theme.bannerBg,
                      }}
                    >
                      <Feather name="award" size={16} color={theme.bannerIcon} />
                      <Body bold size={12} style={{ flex: 1, color: theme.bannerText }}>
                        {resultText}
                      </Body>
                      <Feather name="chevron-right" size={18} color={theme.bannerText} />
                    </View>
                  </TouchableOpacity>
                ) : resultText ? (
                  <View
                    style={{
                      alignSelf: "stretch",
                      marginTop: 18,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      backgroundColor: theme.bannerBg,
                    }}
                  >
                    <Body bold size={12} style={{ color: theme.bannerText, textAlign: "center" }}>
                      {resultText}
                    </Body>
                  </View>
                ) : null}

                {scorecard && !(resultText && resultLinksToScorecard) ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => go(scorecard.href)}
                    style={{ marginTop: 16 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Body bold size={13} style={{ color: theme.subtext }}>
                        {scorecard.label}
                      </Body>
                      <Feather name="arrow-right" size={14} color={theme.subtext} />
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </LinearGradient>
        </ScrollView>
      </View>
    </Modal>
  );
}
