import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

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

// --- Fan / visitor walkthrough -------------------------------------------

function fanTourSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: "Welcome to the club portal",
        description:
          "A quick lap around the ground. This tour points out where to find players, matches, records and honour boards. You can stop any time by pressing Esc.",
      },
    },
    {
      element: '[data-tour="section-toggle"]',
      popover: {
        title: "Seniors & Juniors",
        description:
          "Switch between the senior and junior sides of the club here. Each side has its own players, matches and premierships — they're kept completely separate.",
        side: "bottom",
        align: "end",
      },
    },
    {
      element: '[data-tour="main-nav"]',
      popover: {
        title: "Main navigation",
        description:
          "Jump to Honour Boards, Players, Matches, Grades, Records, Premierships and Compare. On a phone these live behind the menu button.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: '[data-tour="home-totals"]',
      popover: {
        title: "Club at a glance",
        description:
          "Career totals across every grade — players, games, runs, wickets and the number of grades the club fields.",
        side: "bottom",
        align: "center",
      },
    },
    {
      element: '[data-tour="quick-links"]',
      popover: {
        title: "Quick links",
        description:
          "Shortcuts straight to the most-visited sections of the portal.",
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="recent-matches"]',
      popover: {
        title: "Recent matches",
        description:
          "The latest game from each grade. Tap any card for a full digital scorecard.",
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="top-performers"]',
      popover: {
        title: "Top performers",
        description:
          "Leading run scorers and wicket takers. Use the season picker and grade chips to slice the lists.",
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="help-button"]',
      popover: {
        title: "Replay any time",
        description:
          "Lost? Re-open this tour whenever you like from the Help button up here. Enjoy exploring the club's history!",
        side: "bottom",
        align: "end",
      },
    },
    {
      popover: {
        title: "A note on the numbers",
        description:
          "Stats reflect what club admins have recorded after each round, so the latest games may take a little while to appear. Some older seasons are still being backfilled and may be incomplete, and a handful of junior players are kept private and hidden.",
      },
    },
  ];
}

export function launchFanTour(
  navigate?: (to: string) => void,
  currentLocation?: string,
): void {
  // The fan tour highlights home-page sections, so make sure we're on the
  // seniors home before driving. Give the page a beat to render first.
  const onHome = currentLocation === "/" || currentLocation === "";
  if (!onHome && navigate) {
    navigate("/");
    window.setTimeout(() => runTour(fanTourSteps()), 400);
    return;
  }
  runTour(fanTourSteps());
}

// --- Admin walkthrough ----------------------------------------------------

function adminTourSteps(): DriveStep[] {
  return [
    {
      popover: {
        title: "Admin tools",
        description:
          "This area is only visible to signed-in admins. Here's what each group of tools manages.",
      },
    },
    {
      element: '[data-tour="admin-nav"]',
      popover: {
        title: "Admin menu",
        description:
          "Everything you manage lives in this menu. We'll walk through each group next.",
        side: "right",
        align: "start",
      },
    },
    {
      element: '[data-tour="admin-nav-/admin/import"]',
      popover: {
        title: "Import",
        description:
          "Upload a PlayCricket combined CSV for a whole season, or a single match scorecard. This is how new results and stats get into the portal.",
        side: "right",
        align: "center",
      },
    },
    {
      element: '[data-tour="admin-nav-/admin/people"]',
      popover: {
        title: "People",
        description:
          "Manage players and their stats, plus committee members, captains, junior office bearers and non-player officials.",
        side: "right",
        align: "center",
      },
    },
    {
      element: '[data-tour="admin-nav-/admin/honours"]',
      popover: {
        title: "Honours & Records",
        description:
          "Curate premierships, awards, Team of the Decade, the cap register, life members and junior premierships.",
        side: "right",
        align: "center",
      },
    },
    {
      element: '[data-tour="admin-nav-/admin/social"]',
      popover: {
        title: "Social Media",
        description:
          "The branded share-card factory — build and review cards for milestones, results and junior highlights.",
        side: "right",
        align: "center",
      },
    },
    {
      element: '[data-tour="admin-nav-/admin/settings"]',
      popover: {
        title: "Display & Settings",
        description:
          "Control defaults and display options for the public pages — Matches, Records, honour & milestone boards, trading cards and site navigation.",
        side: "right",
        align: "center",
      },
    },
    {
      popover: {
        title: "That's the tour",
        description:
          "Changes you make here flow straight to the public portal. You can re-open this tour any time from the Help button in the header.",
      },
    },
  ];
}

export function launchAdminTour(): void {
  runTour(adminTourSteps());
}
