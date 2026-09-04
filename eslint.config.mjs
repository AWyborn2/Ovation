// @ts-check
// Flat config (ESM). Run with `pnpm run lint`.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import unusedImports from "eslint-plugin-unused-imports";

/**
 * Workspace-wide ESLint (flat config).
 *
 * Deliberately starts from the un-typed `recommended` presets so it runs fast
 * and hermetically in CI; `recommended-type-checked` can be layered on per
 * package later. Two project rules matter more than any preset:
 *
 *  1. `no-restricted-imports` on `@workspace/db/central`: every central read
 *     must go through lib/db's central-queries (plan.md §4.1). Only that module,
 *     its tests, the provisioning helper and the platform club lookups may
 *     touch the central handle directly.
 *  2. The `process.env` restriction on api-server code outside its config
 *     module (plan.md §4.2), so new settings are declared in one place.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/generated/**",
      "**/.expo/**",
      "**/static-build/**",
      "attached_assets/**",
      "docs/**",
      ".design-sync/**",
      ".agents/**",
      "scripts/legacy/**",
      "artifacts/cricket-mobile/scripts/**",
      "artifacts/cricket-mobile/server/**",
      "**/*.config.{js,mjs,ts}",
      "**/build.mjs",
      "artifacts/api-server/src/data/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
    plugins: { "unused-imports": unusedImports },
    rules: {
      // Auto-fixable: `eslint --fix` strips imports nothing references.
      "unused-imports/no-unused-imports": "error",
      // The codebase leans on `_`-prefixed intentional unused args and on
      // destructuring to drop keys; keep the rule but make both patterns legal.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // `any` is rare (3 real uses at the time of writing); surface new ones
      // without failing the build on the existing ones.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": "off",
      "prefer-const": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // ── React (website + mobile) ─────────────────────────────────────────────
  {
    files: ["artifacts/cricket-club/**/*.{ts,tsx}", "artifacts/cricket-mobile/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      // Existing code has a number of `exhaustive-deps` suppressions; surface
      // new ones as warnings so they get reviewed rather than blocking merges.
      "react-hooks/exhaustive-deps": "warn",
      // Accessibility findings from plan.md §5.9 are being worked through;
      // warnings keep them visible without gating every PR on the backlog.
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/media-has-caption": "off",
    },
  },

  // ── Central-read funnel ──────────────────────────────────────────────────
  {
    files: ["artifacts/**/*.ts", "scripts/**/*.ts", "lib/**/*.ts"],
    ignores: [
      "lib/db/src/central-queries.ts",
      "lib/db/src/central/**",
      "lib/db/src/provision.ts",
      "lib/db/src/**/*.test.ts",
      "artifacts/api-server/src/lib/central-club.test-helpers.ts",
      "artifacts/api-server/src/routes/platform.ts",
      "artifacts/api-server/src/routes/platform-admin.ts",
      "artifacts/api-server/src/routes/provisioning-exclusions.ts",
      "artifacts/api-server/src/lib/tenant-brand.ts",
      // Ops surfaces need the handle itself: readiness probe + graceful shutdown.
      "artifacts/api-server/src/routes/health.ts",
      "artifacts/api-server/src/index.ts",
      "scripts/src/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@workspace/db/central",
              message:
                "Read the central DB only through @workspace/db/central-queries so every read is club-filtered, cached and tested in one place (plan.md §4.1).",
            },
          ],
        },
      ],
    },
  },

  // ── API server: every environment read goes through src/config.ts ────────
  {
    files: ["artifacts/api-server/src/**/*.ts"],
    ignores: [
      "artifacts/api-server/src/config.ts",
      "artifacts/api-server/src/maintenance/**",
      "artifacts/api-server/src/**/*.test.ts",
      "artifacts/api-server/src/**/*.test-helpers.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
          message:
            "Read environment variables through `env` in src/config.ts so every setting is declared, validated at boot, and listed in .env.example (plan.md §4.2).",
        },
      ],
    },
  },

  // ── Test files: relax rules that fight vitest idioms ─────────────────────
  {
    files: ["**/*.test.{ts,tsx}", "**/test/**/*.{ts,tsx}", "**/*.test-helpers.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
);
