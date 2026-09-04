/**
 * Shared option lists for the honours-display admin editors.
 */

/**
 * Web-safe title-font stacks an admin can pick per club / skin / board. Kept to
 * stacks that don't need a web-font load so they render the same on the TV.
 */
export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Default (skin)", value: "" },
  { label: "Serif — Georgia", value: 'Georgia, "Times New Roman", serif' },
  { label: "Sans — System", value: "system-ui, -apple-system, sans-serif" },
  { label: "Condensed — Arial Narrow", value: '"Arial Narrow", Arial, sans-serif' },
  { label: "Slab — Rockwell", value: 'Rockwell, Georgia, serif' },
  { label: "Mono — Courier", value: '"Courier New", monospace' },
];

export const TEXT_SIZES = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] as const;

/** Skin choice shape shared by the per-board and custom-grid selects. */
export type SkinOption = { value: string; label: string };
