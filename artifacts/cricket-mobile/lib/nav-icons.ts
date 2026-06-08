import { Feather } from "@expo/vector-icons";

type FeatherName = keyof typeof Feather.glyphMap;

// Maps a stored nav icon key (the same keys the web app uses, defined in
// ICON_KEYS in artifacts/api-server/src/routes/nav-items.ts) to a Feather icon
// name. Feather has a smaller set than lucide, so several keys degrade to the
// closest available glyph.
export const NAV_ICON_MAP: Record<string, FeatherName> = {
  scrollText: "file-text",
  users: "users",
  clipboardList: "clipboard",
  trophy: "award",
  award: "award",
  crown: "award",
  gitCompare: "git-merge",
  settings: "settings",
  baby: "star",
  calendarDays: "calendar",
  trendingUp: "trending-up",
  star: "star",
  home: "home",
  link: "link",
  fileText: "file-text",
  shoppingBag: "shopping-bag",
  image: "image",
  listChecks: "list",
  barChart3: "bar-chart-2",
  shield: "shield",
  flag: "flag",
  mail: "mail",
  phone: "phone",
  userCog: "user",
  database: "database",
  upload: "upload",
  medal: "award",
  bookOpen: "book-open",
  megaphone: "volume-2",
  layoutGrid: "grid",
  ticket: "tag",
};

// Resolve a nav icon key to a Feather glyph name, falling back to a supplied
// default when the key is missing or unrecognised.
export function navIcon(
  key: string | null | undefined,
  fallback: FeatherName = "chevron-right",
): FeatherName {
  if (!key) return fallback;
  return NAV_ICON_MAP[key] ?? fallback;
}
