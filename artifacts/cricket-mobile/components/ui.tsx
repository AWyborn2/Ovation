import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";

export function Heading({
  children,
  size = "md",
  style,
}: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  style?: TextStyle;
}) {
  const colors = useColors();
  const fontSize = size === "xl" ? 28 : size === "lg" ? 22 : size === "md" ? 16 : 13;
  return (
    <Text
      style={[
        {
          fontFamily: "Oswald_700Bold",
          color: colors.primary,
          fontSize,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  bold,
  size = 14,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  bold?: boolean;
  size?: number;
  style?: TextStyle;
  numberOfLines?: number;
}) {
  const colors = useColors();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: bold ? "Montserrat_600SemiBold" : "Montserrat_400Regular",
          color: muted ? colors.mutedForeground : colors.foreground,
          fontSize: size,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: colors.radius,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function StatTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  const colors = useColors();
  return (
    <Card style={{ flex: 1, padding: 14 }}>
      <Text
        style={{
          fontFamily: "Oswald_700Bold",
          color: colors.primary,
          fontSize: 26,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </Text>
      <Text
        style={{
          fontFamily: "Oswald_500Medium",
          color: colors.mutedForeground,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginTop: 4,
        }}
      >
        {label}
      </Text>
    </Card>
  );
}

export function SectionHeader({
  icon,
  title,
  trailing,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  trailing?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 24,
        marginBottom: 12,
        gap: 8,
      }}
    >
      {icon ? (
        <Feather name={icon} size={16} color={colors.primary} />
      ) : null}
      <Heading size="md" style={{ flex: 1 }}>
        {title}
      </Heading>
      {trailing}
    </View>
  );
}

export function Loading() {
  const colors = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({ message }: { message?: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 12,
        backgroundColor: colors.background,
      }}
    >
      <Feather name="alert-triangle" size={28} color={colors.destructive} />
      <Body muted>{message || "Something went wrong."}</Body>
    </View>
  );
}

export const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 16, paddingBottom: 32 },
  row: { flexDirection: "row", gap: 12 },
});
