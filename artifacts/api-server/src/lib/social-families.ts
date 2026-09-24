import type { SocialSettingsRow } from "@workspace/db";

/**
 * Card families (Social Studio automation, R1/R2).
 *
 * Every one of the 17 card types belongs to one of four families. Admins
 * switch automation on or off per family and, within a family, per grade.
 * Ad-hoc types (player, record, new signing…) still carry a family so the
 * queue can filter them, but no engine auto-drafts them.
 */
export const SOCIAL_FAMILIES = ["results", "achievements", "roundup", "matchday"] as const;
export type SocialFamily = (typeof SOCIAL_FAMILIES)[number];

export const CARD_KIND_FAMILY = {
  matchSummary: "results",
  bigMoment: "results",
  premiership: "results",
  milestone: "achievements",
  debut: "achievements",
  century: "achievements",
  fiveFor: "achievements",
  record: "achievements",
  player: "achievements",
  weekendWrap: "roundup",
  gradeLeader: "roundup",
  ladder: "roundup",
  clubLeaderboard: "roundup",
  matchDay: "matchday",
  teamList: "matchday",
  countdown: "matchday",
  newSigning: "matchday",
} as const satisfies Record<string, SocialFamily>;

export type CardKind = keyof typeof CARD_KIND_FAMILY;

export function familyOfKind(kind: unknown): SocialFamily | null {
  return typeof kind === "string" && kind in CARD_KIND_FAMILY
    ? CARD_KIND_FAMILY[kind as CardKind]
    : null;
}

export function isSocialFamily(value: unknown): value is SocialFamily {
  return typeof value === "string" && (SOCIAL_FAMILIES as readonly string[]).includes(value);
}

/** Per-family switch plus per-grade overrides; a grade absent from `grades` uses the default. */
export type FamilySetting = { enabled: boolean; grades: Record<string, boolean> };
export type FamilyConfig = Record<SocialFamily, FamilySetting>;

type SettingsLike = Pick<
  SocialSettingsRow,
  "engineMatchSummary" | "engineMilestone" | "engineRoundUp" | "matchSummaryGradeConfig"
> & { familyConfig?: unknown };

/**
 * The effective family config. A tenant that has never saved one (null
 * column) gets it derived from the legacy engine flags, so behaviour is
 * unchanged until an admin touches the family switches: match results follow
 * the match-summary engine and its per-grade config, achievements follow the
 * milestone engine, round-ups the round-up engine; match day starts off.
 */
export function resolveFamilyConfig(settings: SettingsLike | null): FamilyConfig {
  const legacy = legacyFamilyConfig(settings);
  const stored = settings?.familyConfig;
  if (!stored || typeof stored !== "object") return legacy;
  return normalizeFamilyConfig(stored, legacy);
}

function legacyFamilyConfig(settings: SettingsLike | null): FamilyConfig {
  const gradeConfig = settings?.matchSummaryGradeConfig ?? {};
  const resultGrades: Record<string, boolean> = {};
  for (const [grade, v] of Object.entries(gradeConfig)) {
    if (v && typeof v.enabled === "boolean") resultGrades[grade] = v.enabled;
  }
  return {
    results: { enabled: settings?.engineMatchSummary ?? false, grades: resultGrades },
    achievements: { enabled: settings?.engineMilestone ?? false, grades: {} },
    roundup: { enabled: settings?.engineRoundUp ?? false, grades: {} },
    matchday: { enabled: false, grades: {} },
  };
}

/**
 * Coerce an untrusted (stored or submitted) config onto the full shape,
 * falling back to `base` for any family or field that is missing or malformed.
 */
export function normalizeFamilyConfig(input: unknown, base: FamilyConfig): FamilyConfig {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = {} as FamilyConfig;
  for (const family of SOCIAL_FAMILIES) {
    const raw = src[family] as Partial<FamilySetting> | undefined;
    const grades: Record<string, boolean> = { ...base[family].grades };
    if (raw && typeof raw.grades === "object" && raw.grades !== null) {
      for (const [grade, on] of Object.entries(raw.grades)) {
        if (typeof on === "boolean") grades[grade] = on;
      }
    }
    out[family] = {
      enabled: typeof raw?.enabled === "boolean" ? raw.enabled : base[family].enabled,
      grades,
    };
  }
  return out;
}

/**
 * Should `family` draft for this grade? The family switch wins; then an
 * explicit per-grade override; otherwise seniors on and juniors off (junior
 * drafting is opt-in per grade, KTD15).
 */
export function familyAllows(
  config: FamilyConfig,
  family: SocialFamily,
  grade: string | null,
  junior: boolean,
): boolean {
  const setting = config[family];
  if (!setting.enabled) return false;
  const key = grade ?? "";
  if (key in setting.grades) return setting.grades[key];
  return !junior;
}

/**
 * Keep the legacy engine flags and the family config in step, so the current
 * settings screen and the family switches never disagree. Given a settings
 * patch, returns the extra columns to write alongside it.
 */
export function syncFamilySettings(
  current: SettingsLike,
  patch: Partial<SettingsLike> & { familyConfig?: unknown },
): Partial<
  Pick<
    SocialSettingsRow,
    "engineMatchSummary" | "engineMilestone" | "engineRoundUp" | "matchSummaryGradeConfig"
  >
> & {
  familyConfig?: FamilyConfig;
} {
  if (patch.familyConfig !== undefined) {
    const config = normalizeFamilyConfig(patch.familyConfig, resolveFamilyConfig(current));
    return {
      familyConfig: config,
      engineMatchSummary: config.results.enabled,
      engineMilestone: config.achievements.enabled,
      engineRoundUp: config.roundup.enabled,
      matchSummaryGradeConfig: Object.fromEntries(
        Object.entries(config.results.grades).map(([g, enabled]) => [g, { enabled }]),
      ),
    };
  }
  // A legacy flag changed on a tenant that already saved a family config:
  // carry the change into the config so the flag isn't silently ignored.
  if (current.familyConfig == null) return {};
  const config = resolveFamilyConfig(current);
  let changed = false;
  const flags = [
    ["engineMatchSummary", "results"],
    ["engineMilestone", "achievements"],
    ["engineRoundUp", "roundup"],
  ] as const;
  for (const [flag, family] of flags) {
    const value = patch[flag];
    if (typeof value === "boolean" && value !== config[family].enabled) {
      config[family] = { ...config[family], enabled: value };
      changed = true;
    }
  }
  if (patch.matchSummaryGradeConfig) {
    config.results = {
      ...config.results,
      grades: Object.fromEntries(
        Object.entries(patch.matchSummaryGradeConfig).map(([g, v]) => [g, v.enabled]),
      ),
    };
    changed = true;
  }
  return changed ? { familyConfig: config } : {};
}
