/**
 * Look families (Ovation Match Graphics, plan 2026-10-23, M3–M4): a design
 * system's looks share a `family` ("Ovation Match Graphics"), and the library
 * shows them together. A look's label carries its family where it stands
 * alone ("Ovation Match Graphics · Broadcast").
 */

type LookLike = { slug: string; name: string; family?: string | null };

/** A look's name, with its family in front when it has one. */
export const lookLabel = (look: LookLike): string =>
  look.family ? `${look.family} · ${look.name}` : look.name;

/** The value a look select uses for a whole family. */
export const FAMILY_PREFIX = "family:";

/**
 * The looks in their order, each family's looks moved up to where its first
 * look is, so a family reads as one block.
 */
export function groupFamilies<T extends LookLike>(looks: readonly T[]): T[] {
  const out: T[] = [];
  const placed = new Set<string>();
  for (const look of looks) {
    if (placed.has(look.slug)) continue;
    const members = look.family ? looks.filter((m) => m.family === look.family) : [look];
    for (const member of members) {
      if (placed.has(member.slug)) continue;
      out.push(member);
      placed.add(member.slug);
    }
  }
  return out;
}

/** The families among `looks`, in order, each with its looks. */
export function lookFamilies<T extends LookLike>(
  looks: readonly T[],
): Array<{ family: string; looks: T[] }> {
  const out: Array<{ family: string; looks: T[] }> = [];
  for (const look of looks) {
    if (!look.family) continue;
    const group = out.find((g) => g.family === look.family);
    if (group) group.looks.push(look);
    else out.push({ family: look.family, looks: [look] });
  }
  return out;
}
