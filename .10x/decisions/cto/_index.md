# CTO — Index

## Cross-cutting [CONFIRMED 2026-10-07]

- Ovation is a white-label cricket stats-and-history platform; Halls Head is tenant #1, Peel Cricket Association clubs are pilots, WA Premier Cricket is projected into `central`.
- Stack: pnpm TypeScript monorepo — React + Vite + Tailwind web (`artifacts/cricket-club`), Expo mobile, Express 5 + Drizzle + Postgres API (`artifacts/api-server`), OpenAPI-first (`lib/api-spec`), shared view-model `lib/scorecard`, schema `lib/db`.
- Hosting: Replit-managed Postgres and Replit publishing; production migrations are applied by hand before republishing.
- Data governance: no commercialising scraped data; a club publishing its own results to its own Facebook/Instagram is allowed (decision of 6 Oct 2026).
- Billing and entitlements are built but dormant; Meta publishing is built but off pending App Review.

## Active features

- [card-kind-templates](card-kind-templates.md)
