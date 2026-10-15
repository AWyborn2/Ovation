import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIRT_NUMBER_SETTINGS,
  carriedNumberFor,
  getShirtNumberSettings,
  heldJuniorEntriesToActivate,
  isPlayhqParticipantGuid,
  isValidShirtNumber,
  normaliseParticipantId,
  shirtNumberNamesAgree,
} from "./shirt-numbers";
import {
  juniorShirtNumbersTable,
  shirtNumberSettingsTable,
  shirtNumbersTable,
} from "./schema/shirt_numbers";

/**
 * Shared register rules (season shirt numbers plan, KTD3/KTD5/KTD6/KTD9).
 * The executor is faked: selects resolve by table from in-memory rows and the
 * WHERE clause is ignored, so each fake holds only the rows the real query
 * would return for that tenant, season and person.
 */
function fakeExecutor(rows: Map<unknown, unknown[]>) {
  const reads: unknown[] = [];
  const executor = {
    select() {
      let table: unknown;
      const builder = {
        from(t: unknown) {
          table = t;
          reads.push(t);
          return builder;
        },
        where() {
          return builder;
        },
        limit() {
          return builder;
        },
        then(onFulfilled: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              if (!rows.has(table)) throw new Error("unexpected table read");
              return rows.get(table) ?? [];
            })
            .then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
  return { executor: executor as never, reads };
}

describe("isValidShirtNumber", () => {
  it("accepts 1-3 digits, keeping leading zeros meaningful", () => {
    for (const n of ["0", "7", "00", "07", "23", "100", "999"]) {
      expect(isValidShirtNumber(n)).toBe(true);
    }
  });

  it("rejects empty, long, signed, spaced or non-digit values", () => {
    for (const n of ["", "1000", "-1", " 7", "7 ", "7a", "#7", "1.5", "٣"]) {
      expect(isValidShirtNumber(n)).toBe(false);
    }
  });
});

describe("normaliseParticipantId", () => {
  it("trims and lowercases a PlayHQ GUID", () => {
    expect(normaliseParticipantId("  ABCDEF12-3456-7890-ABCD-EF1234567890 ")).toBe(
      "abcdef12-3456-7890-abcd-ef1234567890",
    );
  });

  it("returns null for missing or blank ids", () => {
    expect(normaliseParticipantId(null)).toBeNull();
    expect(normaliseParticipantId(undefined)).toBeNull();
    expect(normaliseParticipantId("   ")).toBeNull();
  });
});

describe("getShirtNumberSettings", () => {
  it("returns the defaults (feature off, warn, carry) when the tenant has no row", async () => {
    const { executor } = fakeExecutor(new Map([[shirtNumberSettingsTable, []]]));
    await expect(getShirtNumberSettings(executor, 7)).resolves.toEqual({
      enabled: false,
      duplicatePolicy: "warn",
      rolloverPolicy: "carry",
    });
    expect(DEFAULT_SHIRT_NUMBER_SETTINGS).toEqual({
      enabled: false,
      duplicatePolicy: "warn",
      rolloverPolicy: "carry",
    });
  });

  it("returns the tenant's saved settings", async () => {
    const { executor } = fakeExecutor(
      new Map([
        [
          shirtNumberSettingsTable,
          [{ tenantId: 7, enabled: true, duplicatePolicy: "block", rolloverPolicy: "blank" }],
        ],
      ]),
    );
    await expect(getShirtNumberSettings(executor, 7)).resolves.toEqual({
      enabled: true,
      duplicatePolicy: "block",
      rolloverPolicy: "blank",
    });
  });

  it("falls back to a default for an unrecognised stored policy", async () => {
    const { executor } = fakeExecutor(
      new Map([
        [
          shirtNumberSettingsTable,
          [{ tenantId: 7, enabled: true, duplicatePolicy: "odd", rolloverPolicy: "odd" }],
        ],
      ]),
    );
    await expect(getShirtNumberSettings(executor, 7)).resolves.toEqual({
      enabled: true,
      duplicatePolicy: "warn",
      rolloverPolicy: "carry",
    });
  });
});

describe("carriedNumberFor", () => {
  const carry = [{ tenantId: 7, enabled: true, duplicatePolicy: "warn", rolloverPolicy: "carry" }];
  const blank = [{ tenantId: 7, enabled: true, duplicatePolicy: "warn", rolloverPolicy: "blank" }];

  it("returns last season's number for a senior player under carry", async () => {
    const { executor } = fakeExecutor(
      new Map<unknown, unknown[]>([
        [shirtNumberSettingsTable, carry],
        [shirtNumbersTable, [{ number: "07", season: 2025, playerId: 41, participantId: null }]],
      ]),
    );
    await expect(
      carriedNumberFor(executor, { tenantId: 7, side: "senior", season: 2026, playerId: 41 }),
    ).resolves.toBe("07");
  });

  it("returns last season's number for a junior participant under carry", async () => {
    const { executor, reads } = fakeExecutor(
      new Map<unknown, unknown[]>([
        [shirtNumberSettingsTable, carry],
        [juniorShirtNumbersTable, [{ number: "12", season: 2025, participantId: "abc" }]],
      ]),
    );
    await expect(
      carriedNumberFor(executor, {
        tenantId: 7,
        side: "junior",
        season: 2026,
        participantId: "ABC",
      }),
    ).resolves.toBe("12");
    expect(reads).not.toContain(shirtNumbersTable);
  });

  it("returns null under the blank rollover policy without reading the register", async () => {
    const { executor, reads } = fakeExecutor(
      new Map<unknown, unknown[]>([
        [shirtNumberSettingsTable, blank],
        [shirtNumbersTable, [{ number: "07", season: 2025, playerId: 41, participantId: null }]],
      ]),
    );
    await expect(
      carriedNumberFor(executor, { tenantId: 7, side: "senior", season: 2026, playerId: 41 }),
    ).resolves.toBeNull();
    expect(reads).not.toContain(shirtNumbersTable);
  });

  it("honours an explicit rollover policy without reading settings", async () => {
    const { executor, reads } = fakeExecutor(
      new Map<unknown, unknown[]>([
        [shirtNumbersTable, [{ number: "07", season: 2025, playerId: 41, participantId: null }]],
      ]),
    );
    await expect(
      carriedNumberFor(executor, {
        tenantId: 7,
        side: "senior",
        season: 2026,
        playerId: 41,
        rolloverPolicy: "carry",
      }),
    ).resolves.toBe("07");
    expect(reads).not.toContain(shirtNumberSettingsTable);
  });

  it("returns null when the person had no number last season", async () => {
    const { executor } = fakeExecutor(
      new Map<unknown, unknown[]>([
        [shirtNumberSettingsTable, carry],
        [shirtNumbersTable, [{ number: null, season: 2025, playerId: 41, participantId: null }]],
      ]),
    );
    await expect(
      carriedNumberFor(executor, { tenantId: 7, side: "senior", season: 2026, playerId: 41 }),
    ).resolves.toBeNull();
  });

  it("returns null when the person was not on last season's register", async () => {
    const { executor } = fakeExecutor(
      new Map<unknown, unknown[]>([
        [shirtNumberSettingsTable, carry],
        [shirtNumbersTable, []],
      ]),
    );
    await expect(
      carriedNumberFor(executor, { tenantId: 7, side: "senior", season: 2026, playerId: 41 }),
    ).resolves.toBeNull();
  });

  it("returns null without any read when no identity is given", async () => {
    const { executor, reads } = fakeExecutor(new Map());
    await expect(
      carriedNumberFor(executor, { tenantId: 7, side: "senior", season: 2026 }),
    ).resolves.toBeNull();
    await expect(
      carriedNumberFor(executor, {
        tenantId: 7,
        side: "junior",
        season: 2026,
        participantId: "  ",
      }),
    ).resolves.toBeNull();
    expect(reads).toHaveLength(0);
  });
});

describe("shirtNumberNamesAgree (Profile IDs are not trusted when names disagree)", () => {
  it("agrees across case, spacing, hyphens, apostrophes and accents", () => {
    expect(shirtNumberNamesAgree("Noah Dreckow", "  noah   DRECKOW ")).toBe(true);
    expect(shirtNumberNamesAgree("Liam O'Neil", "Liam ONeil")).toBe(true);
    expect(shirtNumberNamesAgree("Ava Smith-Jones", "Ava Smith Jones")).toBe(true);
    expect(shirtNumberNamesAgree("José Ruiz", "Jose Ruiz")).toBe(true);
  });

  it("reads the PlayHQ 'Surname, First' form and ignores middle names", () => {
    expect(shirtNumberNamesAgree("Dreckow, Noah", "Noah Dreckow")).toBe(true);
    expect(shirtNumberNamesAgree("Noah James Dreckow", "Noah Dreckow")).toBe(true);
  });

  it("accepts a preferred name in brackets or quotes, and a lone initial", () => {
    expect(shirtNumberNamesAgree("Christopher (Chris) Walsh", "Chris Walsh")).toBe(true);
    expect(shirtNumberNamesAgree('Edward "Ted" Young', "Ted Young")).toBe(true);
    expect(shirtNumberNamesAgree("B Dreckow", "Ben Dreckow")).toBe(true);
  });

  it("disagrees on a different first name, whatever the surname", () => {
    // Parent and child on one PlayHQ account.
    expect(shirtNumberNamesAgree("Noah Dreckow", "Ben Dreckow")).toBe(false);
    expect(shirtNumberNamesAgree("Christopher Walsh", "Sara Walsh")).toBe(false);
    // Brothers whose ids are crossed.
    expect(shirtNumberNamesAgree("Hayes Buller", "Cohen Buller")).toBe(false);
    expect(shirtNumberNamesAgree("Noah Dreckow", "Noah Smith")).toBe(false);
    expect(shirtNumberNamesAgree("N Dreckow", "Ben Dreckow")).toBe(false);
  });

  it("never agrees on a blank name", () => {
    expect(shirtNumberNamesAgree("", "Noah Dreckow")).toBe(false);
    expect(shirtNumberNamesAgree("Noah Dreckow", null)).toBe(false);
  });
});

describe("isPlayhqParticipantGuid", () => {
  it("accepts a PlayHQ GUID in any casing and rejects anything else", () => {
    expect(isPlayhqParticipantGuid("a0827b9c-1111-4222-8333-444455556666")).toBe(true);
    expect(isPlayhqParticipantGuid("A0827B9C-1111-4222-8333-444455556666")).toBe(true);
    expect(isPlayhqParticipantGuid("12345")).toBe(false);
    expect(isPlayhqParticipantGuid("abc-def")).toBe(false);
    expect(isPlayhqParticipantGuid(null)).toBe(false);
  });
});

describe("heldJuniorEntriesToActivate", () => {
  const P_NOAH = "00000000-0000-4000-8000-000000000001";
  const P_HAYES = "00000000-0000-4000-8000-000000000002";
  const P_ARCHIE = "00000000-0000-4000-8000-000000000003";

  it("activates a held entry only when its participant arrives under the sheet's name", () => {
    const ids = heldJuniorEntriesToActivate(
      [
        { id: 1, participantId: P_NOAH, name: "Noah Dreckow" },
        // The sheet's id is the brother's: the PlayHQ name differs, so it stays held.
        { id: 2, participantId: P_HAYES, name: "Cohen Buller" },
        // Not in the app yet.
        { id: 3, participantId: P_ARCHIE, name: "Archie Nicholson" },
      ],
      [
        { participantId: P_NOAH.toUpperCase(), displayName: "noah dreckow" },
        { participantId: P_HAYES, displayName: "Hayes Buller" },
      ],
    );
    expect(ids).toEqual([1]);
  });

  it("leaves a held entry whose participant has no name yet", () => {
    expect(
      heldJuniorEntriesToActivate(
        [{ id: 1, participantId: P_NOAH, name: "Noah Dreckow" }],
        [{ participantId: P_NOAH, displayName: null }],
      ),
    ).toEqual([]);
  });
});
