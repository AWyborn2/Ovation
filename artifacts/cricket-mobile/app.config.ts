import { type ConfigContext, type ExpoConfig } from "expo/config";

/**
 * Expo app config, parameterised per tenant at build time (plan.md §3.10).
 * Replaces the old hard-coded `app.json` ("HHCC Mobile"). One codebase, one
 * build per club — the store identity comes from these variables:
 *
 *   EXPO_PUBLIC_TENANT_NAME  display name shown under the icon  (default "Ovation")
 *   EXPO_PUBLIC_TENANT_SLUG  Expo slug + deep-link scheme          (default "ovation")
 *   EXPO_PUBLIC_BUNDLE_ID    iOS bundleIdentifier / Android package
 *                            (default `app.ovation.<slug>`, slug reduced to
 *                            [a-z0-9] so it is a valid Android package segment)
 *
 * The same `EXPO_PUBLIC_*` variables are inlined into the JS bundle, so the app
 * can read them at runtime too (see `lib/onboarding.ts`). Runtime brand copy
 * (club name, tagline, colours) is NOT set here — it comes from
 * `GET /tenant-brand` via `lib/tenant-brand.tsx`.
 */

const DEFAULT_NAME = "Ovation";
const DEFAULT_SLUG = "ovation";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const tenantName = env("EXPO_PUBLIC_TENANT_NAME") ?? DEFAULT_NAME;
const tenantSlug = (env("EXPO_PUBLIC_TENANT_SLUG") ?? DEFAULT_SLUG).toLowerCase();
const bundleId =
  env("EXPO_PUBLIC_BUNDLE_ID") ?? `app.ovation.${tenantSlug.replace(/[^a-z0-9]/g, "")}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: tenantName,
  slug: tenantSlug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: tenantSlug,
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/icon.png",
    resizeMode: "contain",
    backgroundColor: "#0B0F1A",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: bundleId,
  },
  android: {
    package: bundleId,
  },
  web: {
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    [
      "expo-router",
      {
        origin: "https://replit.com/",
      },
    ],
    "expo-font",
    "expo-web-browser",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
