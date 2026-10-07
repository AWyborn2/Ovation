/** Value rules shared by the shirt-number register screens and the team-list editor. */

const SHIRT_NUMBER_PATTERN = /^[0-9]{1,3}$/;

/** True for a valid shirt number: 1-3 ASCII digits, leading zeros kept. */
export function isValidShirtNumber(value: string): boolean {
  return SHIRT_NUMBER_PATTERN.test(value);
}

/** A PlayHQ participant GUID trimmed and lowercased; blank or missing is null. */
export function normaliseGuid(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return v === "" ? null : v;
}

/** A name compared case- and spacing-insensitively. */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
