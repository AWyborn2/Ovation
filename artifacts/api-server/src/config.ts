import { z } from "zod";

/**
 * The single place the API server reads its environment.
 *
 * Two layers:
 *
 *  1. `env.X()` accessors — one per variable, read from `process.env` at CALL
 *     time. Several suites flip variables mid-run (`CENTRAL_READS`,
 *     `PLATFORM_HOSTS`, `SESSION_SECRET`, …), so nothing here is snapshotted.
 *     Every accessor is declared below, which is the point: the ESLint
 *     `no-restricted-syntax` rule forbids `process.env` anywhere else in
 *     `src/`, so a new setting has to be added here (and to `.env.example`).
 *
 *  2. `validateConfigAtBoot()` — a zod pass over the variables that must be
 *     present or well-formed before the server listens. It throws a single
 *     readable error listing every problem instead of failing on the first
 *     request that happens to need the value.
 */

const optional = (name: string): string | undefined => {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
};

export const env = {
  // ── Databases ────────────────────────────────────────────────────────────
  DATABASE_URL: () => optional("DATABASE_URL"),
  CENTRAL_DATABASE_URL: () => optional("CENTRAL_DATABASE_URL"),

  // ── Server ───────────────────────────────────────────────────────────────
  PORT: () => optional("PORT"),
  NODE_ENV: () => optional("NODE_ENV"),
  LOG_LEVEL: () => optional("LOG_LEVEL"),
  isProduction: () => process.env.NODE_ENV === "production",

  // ── Sessions / seeding ───────────────────────────────────────────────────
  SESSION_SECRET: () => optional("SESSION_SECRET"),
  ADMIN_PASSWORD: () => optional("ADMIN_PASSWORD"),
  PLATFORM_ADMIN_EMAIL: () => optional("PLATFORM_ADMIN_EMAIL"),
  PLATFORM_ADMIN_PASSWORD: () => optional("PLATFORM_ADMIN_PASSWORD"),

  // ── Tenancy ──────────────────────────────────────────────────────────────
  PLATFORM_HOSTS: () => optional("PLATFORM_HOSTS"),
  PLATFORM_BASE_DOMAIN: () => optional("PLATFORM_BASE_DOMAIN"),
  DEFAULT_TENANT_ID: () => optional("DEFAULT_TENANT_ID"),
  PROXY_SHARED_SECRET: () => optional("PROXY_SHARED_SECRET"),
  /** `X-Forwarded-Host` is honoured unless explicitly set to "0". */
  trustForwardedHost: () => process.env.TRUST_FORWARDED_HOST !== "0",
  /** The x-tenant-id dev switcher on the published *.replit.app host (opt-in). */
  tenantHeaderOnPublishedHost: () => process.env.TENANT_HEADER_ON_PUBLISHED_HOST === "1",
  SIGNUP_MODE: () => optional("SIGNUP_MODE"),
  REPLIT_DOMAINS: () => optional("REPLIT_DOMAINS"),
  REPLIT_DEV_DOMAIN: () => optional("REPLIT_DEV_DOMAIN"),

  // ── Central reads / caches ───────────────────────────────────────────────
  /** Incident kill-switch: `CENTRAL_READS=0`. */
  centralReadsDisabled: () => process.env.CENTRAL_READS === "0",
  MILESTONES_CACHE_TTL_MS: () => optional("MILESTONES_CACHE_TTL_MS"),
  TENANT_ACTIVITY_THROTTLE_MS: () => optional("TENANT_ACTIVITY_THROTTLE_MS"),

  // ── Billing (dormant) ────────────────────────────────────────────────────
  billingEnabled: () => process.env.BILLING_ENABLED === "true",
  STRIPE_SECRET_KEY: () => optional("STRIPE_SECRET_KEY"),

  // ── Object storage ───────────────────────────────────────────────────────
  PUBLIC_OBJECT_SEARCH_PATHS: () => optional("PUBLIC_OBJECT_SEARCH_PATHS"),
  PRIVATE_OBJECT_DIR: () => optional("PRIVATE_OBJECT_DIR"),

  // ── Card video rendering ─────────────────────────────────────────────────
  RENDER_HARNESS_URL: () => optional("RENDER_HARNESS_URL"),
  RENDER_HARNESS_ORIGIN: () => optional("RENDER_HARNESS_ORIGIN"),
  PUPPETEER_EXECUTABLE_PATH: () => optional("PUPPETEER_EXECUTABLE_PATH"),
  CHROMIUM_PATH: () => optional("CHROMIUM_PATH"),

  // ── Social Studio drafting sweep ─────────────────────────────────────────
  /** Shared secret for POST /api/internal/draft-sweep; unset = endpoint closed. */
  SOCIAL_SWEEP_SECRET: () => optional("SOCIAL_SWEEP_SECRET"),

  // ── Card kind templates (plan 2026-10-07-002, ADR-003) ───────────────────
  /**
   * Release switch: "all", or a comma-separated list of tenant ids. Unset (the
   * default) keeps every club on design packs, so republishing main is safe
   * while the starter designs are incomplete.
   */
  KIND_TEMPLATES: () => optional("KIND_TEMPLATES"),

  // ── Meta publishing (plan 2026-10-06-001) ────────────────────────────────
  /** Platform kill switch: connect and publish run only when this is "1". */
  metaPublishingEnabled: () => process.env.META_PUBLISHING_ENABLED === "1",
  META_APP_ID: () => optional("META_APP_ID"),
  META_APP_SECRET: () => optional("META_APP_SECRET"),
  /** Facebook Login for Business configuration id (replaces `scope`). */
  META_LOGIN_CONFIG_ID: () => optional("META_LOGIN_CONFIG_ID"),
  /** Pinned Graph API version (KTD14). */
  META_GRAPH_VERSION: () => optional("META_GRAPH_VERSION") ?? "v26.0",
  /** Page-token encryption key: 32 random bytes, base64 (KTD2). */
  SOCIAL_TOKEN_KEY: () => optional("SOCIAL_TOKEN_KEY"),
  SOCIAL_TOKEN_KEY_VERSION: () => optional("SOCIAL_TOKEN_KEY_VERSION"),
  /** The key being rotated out, as "<version>:<base64>"; decrypt only. */
  SOCIAL_TOKEN_KEY_PREVIOUS: () => optional("SOCIAL_TOKEN_KEY_PREVIOUS"),
  /** Absolute https origin for image URLs Meta fetches and the OAuth callback. */
  SOCIAL_PUBLIC_ORIGIN: () => optional("SOCIAL_PUBLIC_ORIGIN"),
  /** Shared secret for POST /api/internal/publish-sweep; unset = endpoint closed. */
  SOCIAL_PUBLISH_SECRET: () => optional("SOCIAL_PUBLISH_SECRET"),

  // ── PlayHQ scheduled sync ────────────────────────────────────────────────
  /** Shared secret for POST /api/internal/playhq/ingest; unset = endpoint closed. */
  PLAYHQ_SYNC_SECRET: () => optional("PLAYHQ_SYNC_SECRET"),
  /**
   * The playhq-scoped write role (scripts/sql/playhq-ingest-role.sql). Read by
   * @workspace/db/playhq-ingest's pool; declared here so it is listed with the rest.
   */
  PLAYHQ_INGEST_DATABASE_URL: () => optional("PLAYHQ_INGEST_DATABASE_URL"),
  /**
   * PlayHQ → central stats projection after each ingest: off (default), dry (compute and log,
   * write nothing) or on (docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md).
   */
  CENTRAL_PROJECTION: (): "off" | "dry" | "on" => {
    const v = optional("CENTRAL_PROJECTION");
    return v === "dry" || v === "on" ? v : "off";
  },
  /**
   * The central_projector write role (scripts/sql/central-projector.sql). Read by
   * @workspace/db/playhq-ingest's projector pool; declared here so it is listed with the rest.
   */
  CENTRAL_PROJECTOR_DATABASE_URL: () => optional("CENTRAL_PROJECTOR_DATABASE_URL"),
  /** Where PlayHQ sync incident alerts go; falls back to PLATFORM_ADMIN_EMAIL. */
  PLATFORM_ALERT_EMAIL: () => optional("PLATFORM_ALERT_EMAIL"),

  // ── Email (Resend) ───────────────────────────────────────────────────────
  /** Resend API key; unset = email off (notifications stay in-app). */
  RESEND_API_KEY: () => optional("RESEND_API_KEY"),
  /** Sender, e.g. "Ovation <studio@ovation.example>". Unset = email off. */
  EMAIL_FROM: () => optional("EMAIL_FROM"),

  // ── SMS (Twilio or ClickSend) ────────────────────────────────────────────
  /**
   * "twilio" or "clicksend". Unset = whichever is fully configured, Twilio
   * first when both are (so adding ClickSend keys never silently moves an
   * existing Twilio setup); neither configured = SMS off (email only).
   */
  SMS_PROVIDER: () => optional("SMS_PROVIDER"),
  /** Twilio account SID and auth token; either unset = SMS off (email only). */
  TWILIO_ACCOUNT_SID: () => optional("TWILIO_ACCOUNT_SID"),
  TWILIO_AUTH_TOKEN: () => optional("TWILIO_AUTH_TOKEN"),
  /**
   * Sender: a two-way-capable Australian number in E.164, or a Messaging
   * Service SID (preferred when both are set). Never an alphanumeric sender
   * ID — those are one-way, so STOP replies would not opt anyone out.
   */
  TWILIO_FROM: () => optional("TWILIO_FROM"),
  TWILIO_MESSAGING_SERVICE_SID: () => optional("TWILIO_MESSAGING_SERVICE_SID"),
  /** ClickSend API username and key (HTTP basic auth); either unset = ClickSend off. */
  CLICKSEND_USERNAME: () => optional("CLICKSEND_USERNAME"),
  CLICKSEND_API_KEY: () => optional("CLICKSEND_API_KEY"),
  /**
   * Sender: the club's own verified mobile in E.164 (ClickSend "own number").
   * Replies, STOP included, go to that phone and never reach us, so messages
   * sent this way carry a link-based opt-out instead. Unset = ClickSend off.
   */
  CLICKSEND_FROM: () => optional("CLICKSEND_FROM"),

  // ── Studio tools (U19) ───────────────────────────────────────────────────
  /** Photoroom API key for background removal; unset = the tool is off (404). */
  PHOTOROOM_API_KEY: () => optional("PHOTOROOM_API_KEY"),
  // ── Google Drive photo import ────────────────────────────────────────────
  /** Google Picker OAuth client id; all three unset = the import is hidden (404). */
  GOOGLE_DRIVE_CLIENT_ID: () => optional("GOOGLE_DRIVE_CLIENT_ID"),
  /** Browser API key for the Google Picker (restrict it to this site). */
  GOOGLE_DRIVE_API_KEY: () => optional("GOOGLE_DRIVE_API_KEY"),
  /** Google Cloud project number, so drive.file covers the picked files. */
  GOOGLE_DRIVE_APP_ID: () => optional("GOOGLE_DRIVE_APP_ID"),
  /**
   * Open-Meteo commercial API key. Unset = the free, non-commercial API (no
   * key needed); set before Ovation charges clubs (KTD14 licence note).
   */
  OPEN_METEO_API_KEY: () => optional("OPEN_METEO_API_KEY"),
} as const;

const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().nonnegative();

/**
 * Shape of the environment the server needs at boot. Everything is optional in
 * development so a fresh clone can start with just the databases; production
 * (`NODE_ENV=production`) additionally requires SESSION_SECRET.
 */
const BootSchema = z
  .object({
    DATABASE_URL: z.string().url({ message: "must be a postgres:// URL" }),
    CENTRAL_DATABASE_URL: z.string().url({ message: "must be a postgres:// URL" }),
    PORT: positiveInt,
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    SESSION_SECRET: z.string().min(16, "must be at least 16 characters").optional(),
    SIGNUP_MODE: z.enum(["pca", "off"]).optional(),
    BILLING_ENABLED: z.enum(["true", "false"]).optional(),
    DEFAULT_TENANT_ID: positiveInt.optional(),
    TRUST_FORWARDED_HOST: z.enum(["0", "1"]).optional(),
    TENANT_HEADER_ON_PUBLISHED_HOST: z.enum(["0", "1"]).optional(),
    CENTRAL_READS: z.enum(["0", "1"]).optional(),
    MILESTONES_CACHE_TTL_MS: nonNegativeInt.optional(),
    TENANT_ACTIVITY_THROTTLE_MS: nonNegativeInt.optional(),
    PLATFORM_HOSTS: z.string().optional(),
    PLATFORM_BASE_DOMAIN: z.string().optional(),
    PROXY_SHARED_SECRET: z.string().min(16, "must be at least 16 characters").optional(),
    CENTRAL_PROJECTION: z.enum(["off", "dry", "on"]).optional(),
    SMS_PROVIDER: z.enum(["twilio", "clicksend"]).optional(),
    META_PUBLISHING_ENABLED: z.enum(["0", "1"]).optional(),
    KIND_TEMPLATES: z
      .string()
      // Spaces and stray commas are fine ("1, 7," reads as 1 and 7), exactly
      // as the switch itself parses it.
      .regex(/^\s*(all|[\d\s,]*)\s*$/, 'must be "all" or a comma-separated list of tenant ids')
      .optional(),
    META_APP_ID: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
    META_LOGIN_CONFIG_ID: z.string().optional(),
    SOCIAL_TOKEN_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64")
      .optional(),
    SOCIAL_TOKEN_KEY_VERSION: positiveInt.optional(),
    SOCIAL_PUBLIC_ORIGIN: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://"), "must be an https:// origin")
      .optional(),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === "production" && !cfg.SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "is required in production",
      });
    }
    // Meta publishing fails closed (KTD2): switched on means every piece it
    // needs is present, or the server refuses to start.
    if (cfg.META_PUBLISHING_ENABLED === "1") {
      const required = [
        "META_APP_ID",
        "META_APP_SECRET",
        "META_LOGIN_CONFIG_ID",
        "SOCIAL_TOKEN_KEY",
        "SOCIAL_PUBLIC_ORIGIN",
      ] as const;
      for (const key of required) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: "is required when META_PUBLISHING_ENABLED=1",
          });
        }
      }
    }
  });

export type BootConfig = z.infer<typeof BootSchema>;

/**
 * Validate the boot-time environment. Empty strings count as unset. Throws one
 * error naming every offending variable; returns the parsed values otherwise.
 */
export function validateConfigAtBoot(source: NodeJS.ProcessEnv = process.env): BootConfig {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(BootSchema._def.schema.shape)) {
    const v = source[key];
    if (v !== undefined && v !== "") input[key] = v;
  }
  const result = BootSchema.safeParse(input);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".") || "(env)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example.`);
  }
  return result.data;
}
