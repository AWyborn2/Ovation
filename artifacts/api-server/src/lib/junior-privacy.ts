/**
 * Junior privacy override rules (KTD12), pure so they unit-test without a database.
 *
 * An override lets a club admin name a private junior publicly. It only ever exists on
 * a private participant: it can only be switched on for a player who is (or is being
 * made) private, and it is cleared whenever the player becomes public — by an admin
 * patch, a journal revert, or (in the sync, `planParticipantWrite`) when privacy
 * tightens. Otherwise an override left from an earlier private spell would silently
 * name the child the next time they are made private, with no fresh decision.
 */

export type JuniorParticipantPrivacyRow = {
  displayName: string | null;
  isPrivate: boolean;
  privacyOverride: boolean;
  privacyOverrideBy: string | null;
  privacyOverrideAt: Date | null;
};

export type JuniorParticipantPatchBody = {
  displayName?: string;
  isPrivate?: boolean;
  privacyOverride?: boolean;
};

export type JuniorParticipantPatchPlan =
  | {
      ok: true;
      /** Drizzle column values to write. */
      set: Record<string, unknown>;
      /** The journalled patch (snake_case, JSON-safe). */
      patch: Record<string, unknown>;
      /** The journalled pre-image of every patched column. */
      prev: Record<string, unknown>;
    }
  | { ok: false; error: string };

/** Plan an admin PATCH of one junior participant, with its journal entry. */
export function planJuniorParticipantPatch(
  participant: JuniorParticipantPrivacyRow,
  body: JuniorParticipantPatchBody,
  adminName: string | null,
  now: Date,
): JuniorParticipantPatchPlan {
  const set: Record<string, unknown> = {};
  const patch: Record<string, unknown> = {};
  const prev: Record<string, unknown> = {};
  if (body.displayName !== undefined) {
    set.displayName = body.displayName;
    patch.display_name = body.displayName;
    prev.display_name = participant.displayName;
  }
  if (body.isPrivate !== undefined) {
    set.isPrivate = body.isPrivate;
    patch.is_private = body.isPrivate;
    prev.is_private = participant.isPrivate;
  }
  const willBePrivate = body.isPrivate ?? participant.isPrivate;
  if (body.privacyOverride && !willBePrivate) {
    return { ok: false, error: "Only a private player's name can be overridden" };
  }
  // A public participant never keeps an override.
  const override = willBePrivate ? (body.privacyOverride ?? participant.privacyOverride) : false;
  if (override !== participant.privacyOverride) {
    const by = override ? adminName : null;
    const at = override ? now : null;
    set.privacyOverride = override;
    set.privacyOverrideBy = by;
    set.privacyOverrideAt = at;
    patch.privacy_override = override;
    patch.privacy_override_by = by;
    patch.privacy_override_at = at?.toISOString() ?? null;
    prev.privacy_override = participant.privacyOverride;
    prev.privacy_override_by = participant.privacyOverrideBy;
    prev.privacy_override_at = participant.privacyOverrideAt?.toISOString() ?? null;
  }
  return { ok: true, set, patch, prev };
}

/**
 * The column values a journal revert writes onto a participant, with the override rule
 * applied: when the participant ends up public, the override is cleared rather than
 * restored (or kept).
 */
export function guardRevertedPrivacy(
  set: Record<string, unknown>,
  current: { isPrivate: boolean; privacyOverride: boolean },
): Record<string, unknown> {
  const isPrivate = "isPrivate" in set ? set.isPrivate === true : current.isPrivate;
  if (isPrivate) return set;
  const override =
    "privacyOverride" in set ? set.privacyOverride === true : current.privacyOverride;
  if (!override) return set;
  return { ...set, privacyOverride: false, privacyOverrideBy: null, privacyOverrideAt: null };
}
