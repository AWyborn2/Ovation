import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";

// First-launch welcome is remembered on the device. Bumping the suffix would
// re-show the welcome to everyone (e.g. after a major feature change).
const WELCOME_SEEN_KEY = "hhcc.welcome.seen.v1";

export async function hasSeenWelcome(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WELCOME_SEEN_KEY)) === "1";
  } catch {
    // Storage unavailable — treat as "seen" so we never nag.
    return true;
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // Ignore — storage unavailable.
  }
}

// A coachmark step. `tabIndex` (when set) spotlights that bottom-tab; steps
// without one are centred "modal" cards (intro / outro / data note).
export type TourStep = {
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  tabIndex?: number;
};

// Tab order mirrors app/(tabs)/_layout.tsx:
// 0 Home · 1 Players · 2 Matches · 3 Honours · 4 Grades · 5 Captain · 6 Juniors
export const TAB_COUNT = 7;

export function tourSteps(): TourStep[] {
  return [
    {
      title: "Welcome to the club app",
      description:
        "A quick lap around the ground. We'll point out where to find players, matches, records and honour boards. Tap Next, or Skip any time.",
      icon: "award",
    },
    {
      title: "Home",
      description:
        "Club career totals, the latest match from each grade, and the season's top run scorers and wicket takers.",
      icon: "home",
      tabIndex: 0,
    },
    {
      title: "Players",
      description:
        "Search the full roster and open any player for their career stats, grade-by-grade breakdown and milestones.",
      icon: "users",
      tabIndex: 1,
    },
    {
      title: "Matches",
      description:
        "Every game by grade and season. Tap a match for a full digital scorecard with both innings.",
      icon: "clipboard",
      tabIndex: 2,
    },
    {
      title: "Honours",
      description:
        "Premierships, life members, club records and honour boards celebrating the club's history.",
      icon: "award",
      tabIndex: 3,
    },
    {
      title: "Grades",
      description:
        "Pick a grade for its full leaderboard and captain history across every season.",
      icon: "layers",
      tabIndex: 4,
    },
    {
      title: "Juniors",
      description:
        "The junior side has its own players, matches and premierships — kept completely separate from the seniors.",
      icon: "star",
      tabIndex: 6,
    },
    {
      title: "A note on the numbers",
      description:
        "Stats reflect what club admins record after each round, so the latest games may take a little while to appear. Some older seasons are still being backfilled, and a few junior players are kept private and hidden.",
      icon: "info",
    },
    {
      title: "Replay any time",
      description:
        "That's the tour! Re-open it whenever you like from the Help button on the Home screen. Enjoy exploring the club's history.",
      icon: "help-circle",
    },
  ];
}
