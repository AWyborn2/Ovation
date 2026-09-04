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
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === "production" && !cfg.SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "is required in production",
      });
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
