import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Heading } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { type TourStep, TAB_COUNT } from "@/lib/onboarding";

const OVERLAY = "rgba(0,0,0,0.78)";
const PAD = 6;

// Approximate the bottom tab bar geometry. The tab bar isn't measurable from
// here (it's owned by expo-router), so we reconstruct it from screen width,
// the safe-area bottom inset and the platform default tab content height.
function tabRect(index: number, bottomInset: number) {
  const { width, height } = Dimensions.get("window");
  const contentHeight = 49; // RN default tab-bar content height
  const barTop = height - contentHeight - bottomInset;
  const tabWidth = width / TAB_COUNT;
  return {
    x: tabWidth * index,
    y: barTop,
    width: tabWidth,
    height: contentHeight,
  };
}

export function CoachTour({
  visible,
  steps,
  onClose,
}: {
  visible: boolean;
  steps: TourStep[];
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  if (!visible || steps.length === 0) return null;

  const step = steps[Math.min(index, steps.length - 1)];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const finish = () => {
    setIndex(0);
    onClose();
  };

  const next = () => (isLast ? finish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  const { width, height } = Dimensions.get("window");
  const target =
    step.tabIndex != null ? tabRect(step.tabIndex, insets.bottom) : null;

  // Card sits above a spotlit tab; otherwise it's centred on screen.
  const cardBottom = target
    ? height - target.y + PAD + 14
    : undefined;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={{ flex: 1 }}>
        {target ? (
          <>
            {/* Four dark panels leaving a clear cutout over the target tab. */}
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: target.y - PAD,
                backgroundColor: OVERLAY,
              }}
            />
            <View
              style={{
                position: "absolute",
                top: target.y + target.height + PAD,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: OVERLAY,
              }}
            />
            <View
              style={{
                position: "absolute",
                top: target.y - PAD,
                left: 0,
                width: target.x - PAD,
                height: target.height + PAD * 2,
                backgroundColor: OVERLAY,
              }}
            />
            <View
              style={{
                position: "absolute",
                top: target.y - PAD,
                left: target.x + target.width + PAD,
                right: 0,
                height: target.height + PAD * 2,
                backgroundColor: OVERLAY,
              }}
            />
            {/* Gold ring around the cutout. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: target.y - PAD,
                left: target.x - PAD,
                width: target.width + PAD * 2,
                height: target.height + PAD * 2,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: colors.primary,
              }}
            />
          </>
        ) : (
          <View
            style={{ position: "absolute", inset: 0, backgroundColor: OVERLAY }}
          />
        )}

        {/* Popover card */}
        <View
          style={
            target
              ? {
                  position: "absolute",
                  left: 16,
                  right: 16,
                  bottom: cardBottom,
                }
              : {
                  position: "absolute",
                  left: 24,
                  right: 24,
                  top: height / 2 - 130,
                }
          }
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: colors.radius + 4,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather
                  name={step.icon}
                  size={18}
                  color={colors.primaryForeground}
                />
              </View>
              <Heading size="md" style={{ flex: 1 }}>
                {step.title}
              </Heading>
            </View>

            <Body muted size={14} style={{ marginTop: 12, lineHeight: 21 }}>
              {step.description}
            </Body>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 18,
              }}
            >
              <Body
                muted
                size={12}
                style={{ letterSpacing: 1, flex: 1 }}
              >
                {index + 1} / {steps.length}
              </Body>

              {!isFirst ? (
                <TouchableOpacity
                  onPress={back}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: colors.radius,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginRight: 8,
                  }}
                >
                  <Body
                    bold
                    size={13}
                    style={{ textTransform: "uppercase", letterSpacing: 1 }}
                  >
                    Back
                  </Body>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={finish}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: colors.radius,
                    borderWidth: 1,
                    borderColor: colors.border,
                    marginRight: 8,
                  }}
                >
                  <Body
                    muted
                    bold
                    size={13}
                    style={{ textTransform: "uppercase", letterSpacing: 1 }}
                  >
                    Skip
                  </Body>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={next}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 9,
                  borderRadius: colors.radius,
                  backgroundColor: colors.primary,
                }}
              >
                <Body
                  bold
                  size={13}
                  style={{
                    color: colors.primaryForeground,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {isLast ? "Done" : "Next"}
                </Body>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
