/**
 * A club's crest choice for a team on cards, as an admin sends it: checked
 * here once for the senior and the junior name settings alike.
 *
 *   - "upload":   an image the club uploaded to its own storage
 *                 (`/api/storage/objects/...`, the club photo / sponsor logo pattern);
 *   - "known":    a crest Ovation already knows (a PlayHQ organisation logo
 *                 from `centralKnownCrests`), never an arbitrary url;
 *   - "initials": the initials badge, no image;
 *   - null:       back to the automatic crest.
 */

import type { CrestSource } from "@workspace/db";
import type { CrestChoice } from "./names";

/** An object the club uploaded through the storage routes. */
const UPLOADED_OBJECT = /^\/api\/storage\/objects\/[A-Za-z0-9][A-Za-z0-9/_.-]{0,500}$/;

export type CrestChoiceCheck =
  { ok: true; choice: CrestChoice | null } | { ok: false; error: string };

export async function checkCrestChoice(
  crestSource: CrestSource | null,
  crestUrl: string | null | undefined,
): Promise<CrestChoiceCheck> {
  if (crestSource === null) return { ok: true, choice: null };
  if (crestSource === "initials") return { ok: true, choice: { crestSource, crestUrl: null } };
  const url = (crestUrl ?? "").trim();
  if (crestSource === "upload") {
    if (!UPLOADED_OBJECT.test(url) || url.includes(".."))
      return { ok: false, error: "Upload the crest image first." };
    return { ok: true, choice: { crestSource, crestUrl: url } };
  }
  const { centralKnownCrests } = await import("@workspace/db/central-queries");
  const known = await centralKnownCrests();
  if (!url || !known.some((c) => c.logoUrl === url))
    return { ok: false, error: "That crest isn't one Ovation knows. Pick one from the list." };
  return { ok: true, choice: { crestSource, crestUrl: url } };
}
