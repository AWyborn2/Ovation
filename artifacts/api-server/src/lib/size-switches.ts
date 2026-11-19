/**
 * A club's output-size switches (portrait and story sizes plan, Stage 6, D3).
 *
 * Portrait (the feed) and Story are the sizes new designs come in. Square and
 * Landscape are older sizes: a club may switch one off, but never back on,
 * because new designs have no boxes on them. And a club always keeps a feed
 * size (Portrait or Square): switching Square off with Portrait off switches
 * Portrait on in the same save, as migration 0083 does, and Portrait can't be
 * switched off while Square is off.
 */

export type SizeSwitchState = {
  sizeSquare: boolean;
  sizePortrait: boolean;
  sizeStory: boolean;
  sizeLandscape: boolean;
};

export type SizeSwitchPatch = Partial<Record<keyof SizeSwitchState, boolean | undefined>>;

const OLDER: { key: "sizeSquare" | "sizeLandscape"; label: string }[] = [
  { key: "sizeSquare", label: "Square" },
  { key: "sizeLandscape", label: "Landscape" },
];

/**
 * Checks a settings save's size switches against what the club has now.
 * Returns the switches to write (the patch's, plus Portrait when Square goes
 * off without it), or an error to refuse the save with.
 */
export function checkSizeSwitches(
  current: SizeSwitchState,
  patch: SizeSwitchPatch,
): { columns: Partial<SizeSwitchState> } | { error: string } {
  for (const { key, label } of OLDER) {
    if (patch[key] === true && !current[key]) {
      return {
        error: `${label} is an older size: it can't be switched back on. New designs come in Portrait and Story.`,
      };
    }
  }
  const columns: Partial<SizeSwitchState> = {};
  for (const key of ["sizeSquare", "sizePortrait", "sizeStory", "sizeLandscape"] as const) {
    if (typeof patch[key] === "boolean") columns[key] = patch[key];
  }
  const square = columns.sizeSquare ?? current.sizeSquare;
  const portrait = columns.sizePortrait ?? current.sizePortrait;
  if (!square && !portrait) {
    if (columns.sizePortrait === false) {
      return { error: "Portrait is your feed size, so it stays on." };
    }
    // Square going off (or already off) with Portrait off: Portrait on.
    if (columns.sizeSquare === false) columns.sizePortrait = true;
  }
  return { columns };
}
