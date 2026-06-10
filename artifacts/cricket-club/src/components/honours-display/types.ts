import type {
  DisplayBoard,
  BoardEntry,
  BoardSquadMember,
  BoardEntryMeta,
  HonourBrand,
  HonourDisplaySettings,
  HonourDisplayBundle,
} from "@workspace/api-client-react";

export type {
  DisplayBoard,
  BoardEntry,
  BoardSquadMember,
  BoardEntryMeta,
  HonourBrand,
  HonourDisplaySettings,
  HonourDisplayBundle,
};

export type TemplateId = "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7";

export const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: "p1", label: "P1 · Heritage Timber" },
  { id: "p2", label: "P2 · Club Colours" },
  { id: "p3", label: "P3 · Glass / Etched" },
  { id: "p4", label: "P4 · Modern Minimal" },
  { id: "p5", label: "P5 · Broadcast" },
  { id: "p6", label: "P6 · Interactive" },
  { id: "p7", label: "P7 · App Style" },
];

export const LEDGER_PAGE_SIZE = 80;
