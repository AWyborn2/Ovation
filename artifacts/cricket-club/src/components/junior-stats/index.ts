/**
 * Junior scorecard admin editor — public barrel (plan.md §5.6).
 *
 *   innings-table   generic InningsTable<Line, Patch, AddValues>
 *   batting / bowling   line tables, edit rows and add forms over it
 *   match-meta-form, roster-editor, corrections-panel   the other cards
 *   match-editor    JuniorMatchEditor composing them for one match
 */
export { JuniorMatchEditor } from "./match-editor";
export { InningsTable, type InningsColumn, type InningsLine } from "./innings-table";
export { BattingTable, type BattingPatch, type BattingAddValues } from "./batting";
export { BowlingTable, type BowlingPatch, type BowlingAddValues } from "./bowling";
export { MatchMetaForm } from "./match-meta-form";
export { RosterEditor } from "./roster-editor";
export { CorrectionsPanel } from "./corrections-panel";
