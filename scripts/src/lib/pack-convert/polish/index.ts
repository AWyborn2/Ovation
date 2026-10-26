/**
 * Look polish (ADR-011 §5, L4-C): each look's edits to its converted
 * documents, applied after mapping so a re-conversion keeps them. The bundle
 * JSON the converter writes is still what ships; this is how it's made.
 */
import type { TemplateDocumentV2 } from "@workspace/scorecard/kind-templates";
import { boldType } from "./bold-type";
import { goldFoil } from "./gold-foil";
import { neonNight } from "./neon-night";
import { sunset } from "./sunset";

export interface LookPolish {
  /** `look.json`'s description and place in the library. */
  description: string;
  displayOrder: number;
  /** Half-days of polish logged so far (the report records it). */
  halfDays: number;
  /** Edits one kind's document in place; returns what it did, for the report. */
  apply(doc: TemplateDocumentV2, kind: string): string[];
}

/** Polish by look slug. A look without one is a raw conversion. */
export const LOOK_POLISH: Readonly<Record<string, LookPolish>> = {
  "gold-foil": goldFoil,
  "bold-type": boldType,
  "neon-night": neonNight,
  sunset,
};
