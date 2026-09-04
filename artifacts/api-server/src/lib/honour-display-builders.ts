/**
 * Honour-display board builders — barrel.
 *
 * The builders were one 1,950-line module; they now live under
 * `lib/honour-display/`, split by board family:
 *
 *  - `settings.ts`      settings row + kiosk token helpers
 *  - `types.ts`         board / grid / display DTO shapes
 *  - `shared.ts`        grade order, season-grid composition, display resolution
 *  - `premierships.ts`  premiership list + grid
 *  - `records.ts`       centuries, five-fors, partnerships, records, milestones,
 *                       most games, notable-tenure leaderboards
 *  - `people.ts`        life members, captains, committee
 *  - `awards.ts`        award winners, award points, team of the decade
 *  - `composites.ts`    composite "columns" boards + custom grids
 *  - `assemble.ts`      assembleBoards, grid catalog, brand
 *
 * Builders take `tenantId` (and, where the read path matters, a
 * `DataSource` from lib/tenant) explicitly — never `req` — so they are
 * unit-testable. This barrel keeps the original import path working.
 */
export * from "./honour-display/settings";
export * from "./honour-display/types";
export * from "./honour-display/shared";
export * from "./honour-display/premierships";
export * from "./honour-display/records";
export * from "./honour-display/people";
export * from "./honour-display/awards";
export * from "./honour-display/composites";
export * from "./honour-display/assemble";
