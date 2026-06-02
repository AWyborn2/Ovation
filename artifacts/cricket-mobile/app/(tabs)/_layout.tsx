import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: "Oswald_600SemiBold",
          fontSize: 11,
          letterSpacing: 1,
          textTransform: "uppercase",
        },
        tabBarBackground: () => (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.card },
            ]}
          />
        ),
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: {
          fontFamily: "Oswald_700Bold",
          color: colors.primary,
          letterSpacing: 1.5,
        },
        headerTintColor: colors.primary,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "DASHBOARD",
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: "PLAYERS",
          tabBarLabel: "Players",
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="honours"
        options={{
          title: "HONOUR BOARDS",
          tabBarLabel: "Honours",
          tabBarIcon: ({ color }) => (
            <Feather name="award" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="grades"
        options={{
          title: "GRADES",
          tabBarLabel: "Grades",
          tabBarIcon: ({ color }) => (
            <Feather name="layers" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="captain"
        options={{
          title: "CAPTAIN VOTING",
          tabBarLabel: "Captain",
          tabBarIcon: ({ color }) => (
            <Feather name="check-square" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
