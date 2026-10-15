import { describe, expect, it } from "vitest";
import { guardRevertedPrivacy, planJuniorParticipantPatch } from "./junior-privacy";

/**
 * Junior privacy override lifecycle (junior PlayHQ sync review: adversarial P1,
 * security P2). An override names a private child publicly; it must never survive
 * the player becoming public, or it would silently name them the next time they
 * are made private (by an admin or by the sync).
 */

const NOW = new Date("2026-10-14T08:00:00.000Z");
const SET_AT = new Date("2026-09-01T00:00:00.000Z");

const privateOverridden = {
  displayName: "Ollie Green",
  isPrivate: true,
  privacyOverride: true,
  privacyOverrideBy: "Coach",
  privacyOverrideAt: SET_AT,
};

describe("planJuniorParticipantPatch", () => {
  it("making an overridden player public clears the override in the same journalled patch", () => {
    const plan = planJuniorParticipantPatch(privateOverridden, { isPrivate: false }, "Admin", NOW);
    expect(plan).toEqual({
      ok: true,
      set: {
        isPrivate: false,
        privacyOverride: false,
        privacyOverrideBy: null,
        privacyOverrideAt: null,
      },
      patch: {
        is_private: false,
        privacy_override: false,
        privacy_override_by: null,
        privacy_override_at: null,
      },
      prev: {
        is_private: true,
        privacy_override: true,
        privacy_override_by: "Coach",
        privacy_override_at: SET_AT.toISOString(),
      },
    });
  });

  it("make public then make private: the old override does not come back", () => {
    const first = planJuniorParticipantPatch(privateOverridden, { isPrivate: false }, "Admin", NOW);
    if (!first.ok) throw new Error("expected a plan");
    const afterPublic = { ...privateOverridden, ...first.set } as typeof privateOverridden;
    const second = planJuniorParticipantPatch(afterPublic, { isPrivate: true }, "Admin", NOW);
    if (!second.ok) throw new Error("expected a plan");
    expect({ ...afterPublic, ...second.set }).toMatchObject({
      isPrivate: true,
      privacyOverride: false,
    });
  });

  it("refuses to switch the override on for a player who will not be private", () => {
    expect(
      planJuniorParticipantPatch(
        { ...privateOverridden, isPrivate: false, privacyOverride: false },
        { privacyOverride: true },
        "Admin",
        NOW,
      ),
    ).toEqual({ ok: false, error: "Only a private player's name can be overridden" });
    expect(
      planJuniorParticipantPatch(
        privateOverridden,
        { isPrivate: false, privacyOverride: true },
        "Admin",
        NOW,
      ),
    ).toMatchObject({ ok: false });
  });

  it("switching the override on for a private player records who and when", () => {
    const plan = planJuniorParticipantPatch(
      {
        ...privateOverridden,
        privacyOverride: false,
        privacyOverrideBy: null,
        privacyOverrideAt: null,
      },
      { privacyOverride: true },
      "Admin",
      NOW,
    );
    expect(plan).toMatchObject({
      ok: true,
      set: { privacyOverride: true, privacyOverrideBy: "Admin", privacyOverrideAt: NOW },
      patch: { privacy_override: true, privacy_override_at: NOW.toISOString() },
      prev: { privacy_override: false },
    });
  });

  it("a rename alone leaves privacy untouched", () => {
    const plan = planJuniorParticipantPatch(
      privateOverridden,
      { displayName: "Oli Green" },
      "A",
      NOW,
    );
    expect(plan).toEqual({
      ok: true,
      set: { displayName: "Oli Green" },
      patch: { display_name: "Oli Green" },
      prev: { display_name: "Ollie Green" },
    });
  });

  it("an empty body plans nothing", () => {
    expect(planJuniorParticipantPatch(privateOverridden, {}, "A", NOW)).toEqual({
      ok: true,
      set: {},
      patch: {},
      prev: {},
    });
  });
});

describe("guardRevertedPrivacy", () => {
  it("does not restore an override onto a participant who is not private", () => {
    // Reverting the 'override off' correction of a player who has since been made public.
    expect(
      guardRevertedPrivacy(
        { privacyOverride: true, privacyOverrideBy: "Coach", privacyOverrideAt: SET_AT },
        { isPrivate: false, privacyOverride: false },
      ),
    ).toEqual({ privacyOverride: false, privacyOverrideBy: null, privacyOverrideAt: null });
  });

  it("clears a live override when the revert makes the participant public", () => {
    expect(
      guardRevertedPrivacy({ isPrivate: false }, { isPrivate: true, privacyOverride: true }),
    ).toEqual({
      isPrivate: false,
      privacyOverride: false,
      privacyOverrideBy: null,
      privacyOverrideAt: null,
    });
  });

  it("restores private-with-override together", () => {
    const set = {
      isPrivate: true,
      privacyOverride: true,
      privacyOverrideBy: "Coach",
      privacyOverrideAt: SET_AT,
    };
    expect(guardRevertedPrivacy(set, { isPrivate: false, privacyOverride: false })).toEqual(set);
  });

  it("leaves a revert that does not touch privacy alone", () => {
    expect(
      guardRevertedPrivacy({ displayName: "Ollie" }, { isPrivate: false, privacyOverride: false }),
    ).toEqual({ displayName: "Ollie" });
  });
});
