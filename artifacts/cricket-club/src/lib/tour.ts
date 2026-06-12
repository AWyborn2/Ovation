import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import type { TourContent, TourStepContent } from "@workspace/api-client-react";

// First-visit welcome is remembered per browser. Bumping the suffix would
// re-show the welcome to everyone (e.g. after a major feature change).
const WELCOME_SEEN_KEY = "hhcc.welcome.seen.v1";

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    // Private mode / storage disabled — treat as "seen" so we never nag.
    return true;
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    // Ignore — storage unavailable.
  }
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Resolve each step against the live DOM. Element-less "modal" steps always
// survive. For a selector step we pick the first *visible* match and pass the
// resolved element to driver.js — this both skips pointers at sections that
// aren't on the current page (graceful degradation) and handles responsive
// duplicates (e.g. the same marker on a hidden desktop nav and a visible mobile
// control) by always highlighting the one the user can actually see.
function runTour(steps: DriveStep[]): void {
  const available: DriveStep[] = [];
  for (const s of steps) {
    if (!s.element || typeof s.element !== "string") {
      available.push(s);
      continue;
    }
    const visible = Array.from(document.querySelectorAll(s.element)).find(isVisible);
    if (visible) available.push({ ...s, element: visible });
  }
  if (available.length === 0) return;

  const d = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: "hhcc-tour",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps: available,
  });
  d.drive();
}

// --- Editable copy: structure in code, wording optionally overridden by admins -

// A tour step's DOM target + placement live in code (the structure of the tour:
// which sections are highlighted). Only `title` + `description` are editable by
// admins via /admin/settings/tour; an admin can blank a field to fall back to
// the default below. `key` is the stable id stored server-side.
type StepConfig = {
  key: string;
  title: string;
  description: string;
  element?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
};

// Default fan/visitor walkthrough copy + structure.
const FAN_STEP_DEFS: StepConfig[] = [
  {
    key: "fan-welcome",
    title: "Welcome to the club portal",
    description:
      "A quick lap around the ground. This tour points out where to find players, matches, records and honour boards. You can stop any time by pressing Esc.",
  },
  {
    key: "fan-section-toggle",
    element: '[data-tour="section-toggle"]',
    title: "Seniors & Juniors",
    description:
      "Switch between the senior and junior sides of the club here. Each side has its own players, matches and premierships — they're kept completely separate.",
    side: "bottom",
    align: "end",
  },
  {
    key: "fan-main-nav",
    element: '[data-tour="main-nav"]',
    title: "Main navigation",
    description:
      "Jump to Honour Boards, Players, Matches, Grades, Records, Premierships and Compare. On a phone these live behind the menu button.",
    side: "bottom",
    align: "center",
  },
  {
    key: "fan-home-totals",
    element: '[data-tour="home-totals"]',
    title: "Club at a glance",
    description:
      "Career totals across every grade — players, games, runs, wickets and the number of grades the club fields.",
    side: "bottom",
    align: "center",
  },
  {
    key: "fan-quick-links",
    element: '[data-tour="quick-links"]',
    title: "Quick links",
    description: "Shortcuts straight to the most-visited sections of the portal.",
    side: "top",
    align: "center",
  },
  {
    key: "fan-recent-matches",
    element: '[data-tour="recent-matches"]',
    title: "Recent matches",
    description:
      "The latest game from each grade. Tap any card for a full digital scorecard.",
    side: "top",
    align: "center",
  },
  {
    key: "fan-top-performers",
    element: '[data-tour="top-performers"]',
    title: "Top performers",
    description:
      "Leading run scorers and wicket takers. Use the season picker and grade chips to slice the lists.",
    side: "top",
    align: "center",
  },
  {
    key: "fan-help-button",
    element: '[data-tour="help-button"]',
    title: "Replay any time",
    description:
      "Lost? Re-open this tour whenever you like from the Help button up here. Enjoy exploring the club's history!",
    side: "bottom",
    align: "end",
  },
  {
    key: "fan-numbers",
    title: "A note on the numbers",
    description:
      "Stats reflect what club admins have recorded after each round, so the latest games may take a little while to appear. Some older seasons are still being backfilled and may be incomplete, and a handful of junior players are kept private and hidden.",
  },
];

// Default admin walkthrough copy + structure.
const ADMIN_STEP_DEFS: StepConfig[] = [
  {
    key: "admin-intro",
    title: "Admin tools",
    description:
      "This area is only visible to signed-in admins. Here's what each group of tools manages.",
  },
  {
    key: "admin-menu",
    element: '[data-tour="admin-nav"]',
    title: "Admin menu",
    description:
      "Everything you manage lives in this menu. We'll walk through each group next.",
    side: "right",
    align: "start",
  },
  {
    key: "admin-import",
    element: '[data-tour="admin-nav-/admin/import"]',
    title: "Import",
    description:
      "Upload a PlayCricket combined CSV for a whole season, or a single match scorecard. This is how new results and stats get into the portal.",
    side: "right",
    align: "center",
  },
  {
    key: "admin-people",
    element: '[data-tour="admin-nav-/admin/people"]',
    title: "People",
    description:
      "Manage players and their stats, plus committee members, captains, junior office bearers and non-player officials.",
    side: "right",
    align: "center",
  },
  {
    key: "admin-honours",
    element: '[data-tour="admin-nav-/admin/honours"]',
    title: "Honours & Records",
    description:
      "Curate premierships, awards, Team of the Decade, the cap register, life members and junior premierships.",
    side: "right",
    align: "center",
  },
  {
    key: "admin-social",
    element: '[data-tour="admin-nav-/admin/social"]',
    title: "Social Media",
    description:
      "The branded share-card factory — build and review cards for milestones, results and junior highlights.",
    side: "right",
    align: "center",
  },
  {
    key: "admin-settings",
    element: '[data-tour="admin-nav-/admin/settings"]',
    title: "Display & Settings",
    description:
      "Control defaults and display options for the public pages — Matches, Records, honour & milestone boards, trading cards, the welcome tour and site navigation.",
    side: "right",
    align: "center",
  },
  {
    key: "admin-outro",
    title: "That's the tour",
    description:
      "Changes you make here flow straight to the public portal. You can re-open this tour any time from the Help button in the header.",
  },
];

// Default welcome dialog copy (the editable title + body shown first visit).
export const DEFAULT_WELCOME_TITLE = "Welcome to the club portal";
export const DEFAULT_WELCOME_BODY =
  "Your home for the club's players, matches, records and honours — seniors and juniors alike.";

// Expose the default step lists so the admin editor can render an editable row
// per step (structure stays in code; only the copy is editable).
export function defaultFanSteps(): StepConfig[] {
  return FAN_STEP_DEFS;
}
export function defaultAdminSteps(): StepConfig[] {
  return ADMIN_STEP_DEFS;
}

// An empty/blank override falls back to the in-code default for that field.
function pick(override: string | undefined, fallback: string): string {
  const v = (override ?? "").trim();
  return v.length > 0 ? v : fallback;
}

function applyOverrides(
  defs: StepConfig[],
  overrides: TourStepContent[] | undefined,
): DriveStep[] {
  const byKey = new Map((overrides ?? []).map((o) => [o.key, o]));
  return defs.map((def) => {
    const o = byKey.get(def.key);
    const step: DriveStep = {
      popover: {
        title: pick(o?.title, def.title),
        description: pick(o?.description, def.description),
        ...(def.side ? { side: def.side } : {}),
        ...(def.align ? { align: def.align } : {}),
      },
    };
    if (def.element) step.element = def.element;
    return step;
  });
}

export function resolveWelcomeTitle(content?: TourContent | null): string {
  return pick(content?.welcomeTitle, DEFAULT_WELCOME_TITLE);
}
export function resolveWelcomeBody(content?: TourContent | null): string {
  return pick(content?.welcomeBody, DEFAULT_WELCOME_BODY);
}

// --- Fan / visitor walkthrough -------------------------------------------

function fanTourSteps(content?: TourContent | null): DriveStep[] {
  return applyOverrides(FAN_STEP_DEFS, content?.fanSteps);
}

export function launchFanTour(
  navigate?: (to: string) => void,
  currentLocation?: string,
  content?: TourContent | null,
): void {
  // The fan tour highlights home-page sections, so make sure we're on the
  // seniors home before driving. Give the page a beat to render first.
  const onHome = currentLocation === "/" || currentLocation === "";
  if (!onHome && navigate) {
    navigate("/");
    window.setTimeout(() => runTour(fanTourSteps(content)), 400);
    return;
  }
  runTour(fanTourSteps(content));
}

// --- Admin walkthrough ----------------------------------------------------

function adminTourSteps(content?: TourContent | null): DriveStep[] {
  return applyOverrides(ADMIN_STEP_DEFS, content?.adminSteps);
}

export function launchAdminTour(content?: TourContent | null): void {
  runTour(adminTourSteps(content));
}
