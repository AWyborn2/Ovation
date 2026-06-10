import React from "react";
import { Modal, ScrollView, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Body, Heading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

const CAN_DO: { icon: keyof typeof Feather.glyphMap; text: string }[] = [
  { icon: "users", text: "Browse every player and their career stats" },
  { icon: "clipboard", text: "Read full scorecards for past matches" },
  { icon: "award", text: "Explore records, honour boards & premierships" },
  { icon: "star", text: "Switch to the juniors side for their results" },
];

// First-launch welcome sheet. Explains what the app does (and its limits) and
// offers to start the coachmark tour. Shows once per device; the tour can
// always be relaunched from the Home screen's Help button.
export function WelcomeGuide({
  visible,
  onDismiss,
  onStartTour,
}: {
  visible: boolean;
  onDismiss: () => void;
  onStartTour: () => void;
}) {
  const colors = useColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius + 6,
            borderWidth: 1,
            borderColor: colors.border,
            maxHeight: "88%",
            overflow: "hidden",
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 22 }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Feather name="award" size={18} color={colors.primary} />
              <Body
                bold
                size={11}
                style={{
                  color: colors.primary,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                }}
              >
                Halls Head Cricket Club
              </Body>
            </View>

            <Heading size="lg">Welcome to the club app</Heading>
            <Body muted size={14} style={{ marginTop: 8, lineHeight: 21 }}>
              Your home for Halls Head's players, matches, records and honours —
              seniors and juniors alike.
            </Body>

            <Body
              bold
              size={12}
              style={{
                marginTop: 20,
                marginBottom: 10,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              What you can do
            </Body>
            <View style={{ gap: 12 }}>
              {CAN_DO.map(({ icon, text }) => (
                <View
                  key={text}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <Feather name={icon} size={18} color={colors.primary} />
                  <Body size={14} style={{ flex: 1 }}>
                    {text}
                  </Body>
                </View>
              ))}
            </View>

            <View
              style={{
                marginTop: 20,
                padding: 14,
                borderRadius: colors.radius,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.muted,
              }}
            >
              <Body muted size={12} style={{ lineHeight: 19 }}>
                <Body bold size={12}>
                  Good to know:{" "}
                </Body>
                stats reflect what club admins have recorded after each round, so
                the very latest games may take a little while to appear. Some
                older seasons are still being backfilled and may be incomplete,
                and a few junior players are kept private and hidden.
              </Body>
            </View>

            <View style={{ marginTop: 24, gap: 10 }}>
              <TouchableOpacity
                onPress={onStartTour}
                style={{
                  paddingVertical: 14,
                  borderRadius: colors.radius,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                }}
              >
                <Body
                  bold
                  size={14}
                  style={{
                    color: colors.primaryForeground,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Take a quick tour
                </Body>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDismiss}
                style={{
                  paddingVertical: 14,
                  borderRadius: colors.radius,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                }}
              >
                <Body
                  bold
                  size={14}
                  muted
                  style={{ textTransform: "uppercase", letterSpacing: 1 }}
                >
                  Maybe later
                </Body>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
