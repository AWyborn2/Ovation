// Name helpers with no database imports, so tests that mock the central reads can use them.

/**
 * A central display name as { givenName, surname }. Central stores names given name first
 * ("Chris Phelps", "C Phelps"); a name still surname first ("Phelps, Chris", the WA load's and
 * PlayHQ's report format) comes back the right way round too. Single word: given name only.
 */
export function splitDisplayName(displayName: string | null | undefined): {
  givenName: string;
  surname: string;
} {
  const raw = (displayName ?? "").trim().replace(/\s+/g, " ");
  const comma = raw.indexOf(",");
  if (comma > 0) {
    const surname = raw.slice(0, comma).trim();
    const givenName = raw.slice(comma + 1).trim();
    if (surname && givenName) return { givenName, surname };
  }
  const parts = raw.split(" ").filter(Boolean);
  if (parts.length === 0) return { givenName: "", surname: "" };
  if (parts.length === 1) return { givenName: parts[0] ?? "", surname: "" };
  return {
    givenName: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1] ?? "",
  };
}

/** A central display name the way people read it: "Phelps, Chris" -> "Chris Phelps". */
export function displayNameForShow(displayName: string | null | undefined): string {
  const { givenName, surname } = splitDisplayName(displayName);
  return [givenName, surname].filter(Boolean).join(" ");
}
