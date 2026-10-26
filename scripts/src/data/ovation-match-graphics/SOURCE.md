# Ovation Match Graphics: the vendored source

Ash's **Ovation Match Graphics** design system, copied as published so the
converter (`scripts/src/convert-match-graphics.ts`) can be re-run and reviewed
without the artifact (plan `docs/plans/2026-10-23-ovation-match-graphics-plan.md`, M1).

- Source: Design System artifact `https://claude.ai/artifact/8TgcuZ3ZxL4g9HvPU6Ejqg`,
  version `1792725573-5e13`. Its tokens say they were synced on 21 Oct 2026. Its last change was
  made on 22 Oct 2026 ("Split the seven looks into 51 per-look layer components plus Stage").
- Files, unchanged:
  - `bundle.js`, the React 18 bundle that assigns `window.OvationMatch`
  - `index.d.ts`, the props of every component
  - `bundle.css`, which loads the four Google fonts
  - `tokens.json`, the colours, type styles, spacing, radii, shadows and canvas sizes
  - `README.md`, the design system's own rules
  - `previews/<Component>.html`, each component's preview card
- To update: read the artifact's files again, copy them over these, then re-run the converter
  and raise each bundle's `version`.

ESLint and Prettier skip this folder, because it's kept exactly as published.
