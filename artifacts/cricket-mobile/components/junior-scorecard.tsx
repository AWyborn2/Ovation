import React, { useMemo } from "react";
import { View } from "react-native";
import { buildJuniorScorecard, type JuniorMatchDetail } from "@workspace/scorecard";

import { Body } from "@/components/ui";
import { BattingBlock, BowlingBlock } from "@/components/scorecard";

/**
 * Branded two-innings digital scorecard for a junior match. Reuses the shared
 * batting/bowling blocks from the senior scorecard via the junior view-model
 * adapter, so juniors get the same look. Junior participant ids are strings, so
 * names always render as plain text (no career-stats popup); private
 * participants are already masked server-side before this renders.
 */
export function JuniorDigitalScorecard({ match }: { match: JuniorMatchDetail }) {
  const scorecard = useMemo(() => buildJuniorScorecard(match), [match]);

  const hasAnyData = scorecard.innings.some(
    (inn) => inn.batsmen.length + inn.bowlers.length > 0,
  );

  if (!hasAnyData) {
    return (
      <View
        style={{
          backgroundColor: "#0a1626",
          borderRadius: 8,
          padding: 24,
          alignItems: "center",
        }}
      >
        <Body size={13} style={{ color: "#9ca3af", fontStyle: "italic" }}>
          No scorecard recorded for this match.
        </Body>
      </View>
    );
  }

  return (
    <View
      style={{ backgroundColor: "#0a1626", borderRadius: 8, padding: 10, gap: 12 }}
    >
      {scorecard.innings.map((inn, i) => (
        <View key={i} style={{ gap: 8 }}>
          <BattingBlock innings={inn} />
          <BowlingBlock innings={inn} />
        </View>
      ))}
    </View>
  );
}
