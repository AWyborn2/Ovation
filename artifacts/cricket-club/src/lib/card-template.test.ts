import { describe, it, expect } from "vitest";
import { CARD_KINDS } from "./share-card";
import { sampleCardInput } from "./sample-card-inputs";
import {
  CARD_FIELD_CATALOG,
  COMMON_FIELDS,
  resolveTextField,
  resolvePackIdForKind,
  listSelectablePacksForKind,
  canonicalPackRowFor,
  nextDefaultForKinds,
  byoDefaultsClearedBy,
  resolveDefaultLayoutTemplate,
  type CardTemplate,
  type TemplateContext,
} from "./card-template";
import { listPackManifests } from "./pack-templates/registry";

const CTX: TemplateContext = {
  clubName: "Sample Club",
  clubUrl: "club.example.com",
  hashtag: "#SampleClub",
};

/**
 * Pack A U2: the card-input model spans 17 kinds — the original 10 (less
 * `newCap`, retired in favour of `debut`, whose fields are a superset) plus the
 * 8 new Pack A kinds — and every kind has a sample input and a field-catalog
 * entry whose scalar text fields all resolve against that sample.
 */
const NEW_KINDS = [
  "matchDay",
  "teamList",
  "weekendWrap",
  "ladder",
  "bigMoment",
  "newSigning",
  "countdown",
  "clubLeaderboard",
] as const;

const EXISTING_KINDS = [
  "milestone",
  "player",
  "record",
  "gradeLeader",
  "premiership",
  "debut",
  "century",
  "fiveFor",
  "matchSummary",
] as const;

describe("card kind coverage", () => {
  it("CARD_KINDS covers all 17 kinds", () => {
    expect(CARD_KINDS).toHaveLength(17);
    for (const kind of [...EXISTING_KINDS, ...NEW_KINDS]) {
      expect(CARD_KINDS).toContain(kind);
    }
  });

  it("no longer carries the retired newCap kind", () => {
    expect(CARD_KINDS as string[]).not.toContain("newCap");
  });

  it("has a sample input for every kind", () => {
    for (const kind of CARD_KINDS) {
      expect(sampleCardInput(kind).kind, kind).toBe(kind);
    }
  });

  it("has a field-catalog entry for every kind", () => {
    for (const kind of CARD_KINDS) {
      expect(CARD_FIELD_CATALOG[kind], kind).toBeDefined();
      expect(CARD_FIELD_CATALOG[kind].length, kind).toBeGreaterThan(0);
    }
  });

  it("keeps the existing 10 kinds' sample shapes stable", () => {
    const shapes = Object.fromEntries(
      EXISTING_KINDS.map((k) => [k, Object.keys(sampleCardInput(k)).sort()]),
    );
    expect(shapes).toEqual({
      milestone: [
        "currentValue",
        "headline",
        "kind",
        "milestoneLabel",
        "playerName",
        "threshold",
        "tierIndex",
        "tierLabel",
      ],
      player: ["gradesPlayed", "headline", "kind", "playerName", "stats"],
      record: ["grade", "headline", "kind", "playerName", "title", "value"],
      gradeLeader: ["category", "grade", "headline", "kind", "playerName", "value"],
      premiership: ["competition", "grade", "headline", "kind", "mom", "result", "year"],
      debut: [
        "capNumber",
        "grade",
        "headline",
        "kind",
        "opponent",
        "playerName",
        "round",
        "season",
      ],
      century: [
        "balls",
        "grade",
        "headline",
        "kind",
        "notOut",
        "opponent",
        "playerName",
        "round",
        "runs",
      ],
      fiveFor: [
        "figures",
        "grade",
        "headline",
        "kind",
        "opponent",
        "overs",
        "playerName",
        "round",
        "runsConceded",
        "wickets",
      ],
      matchSummary: [
        "club",
        "date",
        "headline",
        "innings",
        "kind",
        "matchTitle",
        "matchType",
        "opposition",
        "result",
        "resultWinner",
        "venue",
      ],
    });
  });
});

describe("resolveTextField", () => {
  it("resolves every catalogued text field for every kind against its sample", () => {
    for (const kind of CARD_KINDS) {
      const input = sampleCardInput(kind);
      for (const field of [...COMMON_FIELDS, ...CARD_FIELD_CATALOG[kind]]) {
        if (field.type !== "text") continue;
        const value = resolveTextField(input, field.key, CTX);
        expect(typeof value, `${kind}.${field.key}`).toBe("string");
      }
    }
  });

  it("resolves catalogued per-kind text fields to non-empty values from the sample", () => {
    for (const kind of CARD_KINDS) {
      const input = sampleCardInput(kind);
      for (const field of CARD_FIELD_CATALOG[kind]) {
        if (field.type !== "text") continue;
        // The player sample carries three stats; the catalog's fourth slot
        // legitimately resolves to "".
        if (kind === "player" && /^stat4/.test(field.key)) continue;
        const value = resolveTextField(input, field.key, CTX);
        expect(value, `${kind}.${field.key}`).not.toBe("");
      }
    }
  });

  it("resolves the flattened clubLeaderboard leader fields", () => {
    const input = sampleCardInput("clubLeaderboard");
    expect(resolveTextField(input, "leader1Name", CTX)).toBe("Jack Manuel");
    expect(resolveTextField(input, "leader1Value", CTX)).toBe("428");
    expect(resolveTextField(input, "leader4Grade", CTX)).not.toBe("");
    // Beyond the sample's four leaders the slot degrades to "".
    expect(resolveTextField(input, "leader5Name", CTX)).toBe("");
  });

  it('returns "" for fields not present on a kind (multi-kind templates degrade)', () => {
    const input = sampleCardInput("countdown");
    expect(resolveTextField(input, "playerName", CTX)).toBe("");
    expect(resolveTextField(input, "rows", CTX)).toBe("");
  });
});

describe("resolvePackIdForKind", () => {
  // Shares the module-level `tpl` builder with the helper suites below — the
  // two were byte-identical.
  const row = tpl;

  it("returns null when there are no templates (caller uses the default pack)", () => {
    expect(resolvePackIdForKind([], "milestone")).toBeNull();
    expect(resolvePackIdForKind(undefined, "milestone")).toBeNull();
    expect(resolvePackIdForKind(null, "milestone")).toBeNull();
  });

  it("picks the pack row marked default for that kind", () => {
    const templates = [
      row({ id: 1, packId: "broadcast-dark-v1" }),
      row({ id: 2, packId: "gold-foil-v1", defaultForKinds: ["milestone"] }),
    ];
    expect(resolvePackIdForKind(templates, "milestone")).toBe("gold-foil-v1");
    // Another kind has no default → null → renderer's default pack.
    expect(resolvePackIdForKind(templates, "century")).toBeNull();
  });

  it("falls back to the legacy global isDefault flag", () => {
    const templates = [row({ id: 1, packId: "gold-foil-v1", isDefault: true })];
    expect(resolvePackIdForKind(templates, "milestone")).toBe("gold-foil-v1");
  });

  it("ignores non-pack templates — a BYO default must not select a pack", () => {
    const templates = [
      row({ id: 1, source: "background", packId: null, defaultForKinds: ["milestone"] }),
      row({ id: 2, source: "layers", packId: null, isDefault: true }),
    ];
    expect(resolvePackIdForKind(templates, "milestone")).toBeNull();
  });

  it("ignores inactive pack rows and rows scoped to other kinds", () => {
    expect(
      resolvePackIdForKind(
        [row({ packId: "gold-foil-v1", isActive: false, defaultForKinds: ["milestone"] })],
        "milestone",
      ),
    ).toBeNull();
    expect(
      resolvePackIdForKind(
        [row({ packId: "gold-foil-v1", cardKinds: ["century"], isDefault: true })],
        "milestone",
      ),
    ).toBeNull();
  });
});

/**
 * Pack-switcher helpers (plan U2). A template row, defaulted to an active pack
 * row so each test states only the field it is about.
 */
const tpl = (over: Partial<CardTemplate>): CardTemplate =>
  ({
    id: 1,
    name: "row",
    cardKinds: [],
    isActive: true,
    isDefault: false,
    source: "pack",
    packId: null,
    defaultForKinds: [],
    ...over,
  }) as CardTemplate;

const REGISTERED = listPackManifests().map((m) => m.packId);

describe("listSelectablePacksForKind", () => {
  it("returns nothing for empty / undefined / null template lists", () => {
    expect(listSelectablePacksForKind([], "milestone")).toEqual([]);
    expect(listSelectablePacksForKind(undefined, "milestone")).toEqual([]);
    expect(listSelectablePacksForKind(null, "milestone")).toEqual([]);
  });

  it("offers only source:'pack' rows — a BYO row is never offered as a pack", () => {
    const templates = [
      tpl({ id: 1, source: "layers", packId: "gold-foil-v1", defaultForKinds: ["milestone"] }),
      tpl({ id: 2, source: "background", packId: "bold-type-v1" }),
    ];
    expect(listSelectablePacksForKind(templates, "milestone")).toEqual([]);
  });

  it("lists a pack once even though it materialises three variant rows", () => {
    const templates = [
      tpl({ id: 1, packId: "gold-foil-v1", packVariant: "square" }),
      tpl({ id: 2, packId: "gold-foil-v1", packVariant: "portrait" }),
      tpl({ id: 3, packId: "gold-foil-v1", packVariant: "story" }),
    ];
    expect(listSelectablePacksForKind(templates, "milestone")).toEqual(["gold-foil-v1"]);
  });

  it("does not offer a pack whose rows are scoped to other kinds", () => {
    const templates = [tpl({ id: 1, packId: "gold-foil-v1", cardKinds: ["century"] })];
    expect(listSelectablePacksForKind(templates, "milestone")).toEqual([]);
    expect(listSelectablePacksForKind(templates, "century")).toEqual(["gold-foil-v1"]);
  });

  it("offers a pack whose rows carry no kind scope (empty = all kinds)", () => {
    const templates = [tpl({ id: 1, packId: "gold-foil-v1", cardKinds: [] })];
    expect(listSelectablePacksForKind(templates, "milestone")).toEqual(["gold-foil-v1"]);
  });

  it("does not offer an inactive pack row", () => {
    const templates = [tpl({ id: 1, packId: "gold-foil-v1", isActive: false })];
    expect(listSelectablePacksForKind(templates, "milestone")).toEqual([]);
    // One active variant is enough for the pack to be offered.
    expect(
      listSelectablePacksForKind(
        [...templates, tpl({ id: 2, packId: "gold-foil-v1" })],
        "milestone",
      ),
    ).toEqual(["gold-foil-v1"]);
  });

  it("orders by listPackManifests() registration order, not row order", () => {
    // Rows deliberately supplied in reverse registration order.
    const templates = [...REGISTERED].reverse().map((packId, i) => tpl({ id: i + 1, packId }));
    expect(listSelectablePacksForKind(templates, "milestone")).toEqual([...REGISTERED]);
  });

  it("is stable across calls", () => {
    const templates = REGISTERED.map((packId, i) => tpl({ id: i + 1, packId }));
    const first = listSelectablePacksForKind(templates, "milestone");
    const second = listSelectablePacksForKind(templates, "milestone");
    expect(second).toEqual(first);
  });

  it("appends unregistered packs last, ordered by lowest row id", () => {
    const templates = [
      tpl({ id: 9, packId: "zzz-withdrawn-v1" }),
      tpl({ id: 7, packId: "aaa-withdrawn-v1" }),
      tpl({ id: 3, packId: REGISTERED[1] }),
      tpl({ id: 1, packId: REGISTERED[0] }),
    ];
    expect(listSelectablePacksForKind(templates, "milestone")).toEqual([
      REGISTERED[0],
      REGISTERED[1],
      "aaa-withdrawn-v1",
      "zzz-withdrawn-v1",
    ]);
  });

  it("ignores pack rows with no packId", () => {
    expect(listSelectablePacksForKind([tpl({ id: 1, packId: null })], "milestone")).toEqual([]);
  });
});

describe("canonicalPackRowFor", () => {
  it("returns null for empty / undefined / null template lists", () => {
    expect(canonicalPackRowFor([], "gold-foil-v1")).toBeNull();
    expect(canonicalPackRowFor(undefined, "gold-foil-v1")).toBeNull();
    expect(canonicalPackRowFor(null, "gold-foil-v1")).toBeNull();
  });

  it("returns the lowest-id active row when several variants exist", () => {
    const templates = [
      tpl({ id: 7, packId: "gold-foil-v1", packVariant: "story" }),
      tpl({ id: 3, packId: "gold-foil-v1", packVariant: "square" }),
      tpl({ id: 9, packId: "gold-foil-v1", packVariant: "portrait" }),
    ];
    expect(canonicalPackRowFor(templates, "gold-foil-v1")?.id).toBe(3);
    // Deterministic: the same row on every call, so repeated claims target one row.
    expect(canonicalPackRowFor(templates, "gold-foil-v1")).toBe(
      canonicalPackRowFor(templates, "gold-foil-v1"),
    );
  });

  it("skips inactive rows when choosing the lowest id", () => {
    const templates = [
      tpl({ id: 2, packId: "gold-foil-v1", isActive: false }),
      tpl({ id: 4, packId: "gold-foil-v1" }),
    ];
    expect(canonicalPackRowFor(templates, "gold-foil-v1")?.id).toBe(4);
  });

  it("returns null for an unknown packId", () => {
    const templates = [tpl({ id: 1, packId: "gold-foil-v1" })];
    expect(canonicalPackRowFor(templates, "bold-type-v1")).toBeNull();
  });

  it("returns null when the pack's only rows are inactive", () => {
    const templates = [
      tpl({ id: 1, packId: "gold-foil-v1", isActive: false }),
      tpl({ id: 2, packId: "gold-foil-v1", isActive: false }),
    ];
    expect(canonicalPackRowFor(templates, "gold-foil-v1")).toBeNull();
  });

  it("never returns a non-pack row carrying the same packId", () => {
    const templates = [
      tpl({ id: 1, source: "layers", packId: "gold-foil-v1" }),
      tpl({ id: 5, packId: "gold-foil-v1" }),
    ];
    expect(canonicalPackRowFor(templates, "gold-foil-v1")?.id).toBe(5);
  });

  it("ignores a row's kind scope — variants share the pack's cardKinds", () => {
    const templates = [tpl({ id: 2, packId: "gold-foil-v1", cardKinds: ["century"] })];
    expect(canonicalPackRowFor(templates, "gold-foil-v1")?.id).toBe(2);
  });
});

describe("nextDefaultForKinds", () => {
  it("adds the kind when absent", () => {
    expect(nextDefaultForKinds(tpl({ defaultForKinds: ["century"] }), "milestone")).toEqual([
      "century",
      "milestone",
    ]);
  });

  it("is a no-op when the kind is already claimed (no duplicates)", () => {
    expect(
      nextDefaultForKinds(tpl({ defaultForKinds: ["century", "milestone"] }), "milestone"),
    ).toEqual(["century", "milestone"]);
  });

  it("tolerates a missing / null defaultForKinds array", () => {
    expect(nextDefaultForKinds(tpl({ defaultForKinds: [] }), "milestone")).toEqual(["milestone"]);
    expect(
      nextDefaultForKinds({ defaultForKinds: undefined as unknown as string[] }, "milestone"),
    ).toEqual(["milestone"]);
    expect(nextDefaultForKinds(null, "milestone")).toEqual(["milestone"]);
  });

  it("does not mutate the row's array", () => {
    const row = tpl({ defaultForKinds: ["century"] });
    nextDefaultForKinds(row, "milestone");
    expect(row.defaultForKinds).toEqual(["century"]);
  });
});

describe("byoDefaultsClearedBy", () => {
  it("returns nothing for empty / undefined / null template lists or no kinds", () => {
    expect(byoDefaultsClearedBy([], ["milestone"])).toEqual([]);
    expect(byoDefaultsClearedBy(undefined, ["milestone"])).toEqual([]);
    expect(byoDefaultsClearedBy(null, ["milestone"])).toEqual([]);
    expect(
      byoDefaultsClearedBy([tpl({ source: "layers", defaultForKinds: ["milestone"] })], []),
    ).toEqual([]);
  });

  it("returns a layers template holding a default for a claimed kind", () => {
    const byo = tpl({
      id: 4,
      source: "layers",
      packId: null,
      name: "Custom milestone",
      defaultForKinds: ["milestone"],
    });
    expect(byoDefaultsClearedBy([byo], ["milestone", "century"]).map((t) => t.id)).toEqual([4]);
  });

  it("excludes pack rows — a pack claim is not a cost the admin is warned about", () => {
    const templates = [
      tpl({ id: 1, packId: "gold-foil-v1", defaultForKinds: ["milestone"] }),
      tpl({ id: 2, source: "background", packId: null, defaultForKinds: ["milestone"] }),
    ];
    expect(byoDefaultsClearedBy(templates, ["milestone"]).map((t) => t.id)).toEqual([2]);
  });

  it("excludes templates defaulted only for kinds that are not being claimed", () => {
    const templates = [
      tpl({ id: 1, source: "layers", packId: null, defaultForKinds: ["century"] }),
      tpl({ id: 2, source: "layers", packId: null, defaultForKinds: [] }),
    ];
    expect(byoDefaultsClearedBy(templates, ["milestone"])).toEqual([]);
  });

  it("includes an inactive BYO row — clearDefaultKinds does not filter on isActive", () => {
    const templates = [
      tpl({
        id: 3,
        source: "layers",
        packId: null,
        isActive: false,
        defaultForKinds: ["milestone"],
      }),
    ];
    expect(byoDefaultsClearedBy(templates, ["milestone"]).map((t) => t.id)).toEqual([3]);
  });
});

/**
 * Plan U4: the export modal's default-layout effect. Writing pack claims (U3)
 * must not change which template the modal pre-selects — `null` here means the
 * modal keeps `layoutId` at null, i.e. the built-in layout, and takes its pack
 * from `resolvePackIdForKind` like every other call site.
 */
describe("resolveDefaultLayoutTemplate", () => {
  it("returns null for empty / undefined / null template lists", () => {
    expect(resolveDefaultLayoutTemplate([], "milestone")).toBeNull();
    expect(resolveDefaultLayoutTemplate(undefined, "milestone")).toBeNull();
    expect(resolveDefaultLayoutTemplate(null, "milestone")).toBeNull();
  });

  it("stays built-in when a pack row claims the kind", () => {
    const templates = [
      tpl({ id: 1, packId: "gold-foil-v1", defaultForKinds: ["milestone"] }),
      tpl({
        id: 2,
        packId: "gold-foil-v1",
        packVariant: "portrait",
        defaultForKinds: ["milestone"],
      }),
    ];
    expect(resolveDefaultLayoutTemplate(templates, "milestone")).toBeNull();
    // The pack decision is still readable — it just is not the layout choice.
    expect(resolvePackIdForKind(templates, "milestone")).toBe("gold-foil-v1");
  });

  it("still pre-selects a layers template claiming the kind", () => {
    const templates = [
      tpl({ id: 1, packId: "gold-foil-v1", defaultForKinds: ["milestone"] }),
      tpl({ id: 2, source: "layers", packId: null, defaultForKinds: ["milestone"] }),
    ];
    expect(resolveDefaultLayoutTemplate(templates, "milestone")?.id).toBe(2);
  });

  it("still pre-selects a background template claiming the kind", () => {
    const templates = [
      tpl({ id: 5, source: "background", packId: null, defaultForKinds: ["milestone"] }),
    ];
    expect(resolveDefaultLayoutTemplate(templates, "milestone")?.id).toBe(5);
  });

  it("falls back to the legacy isDefault flag on a non-pack template", () => {
    const templates = [tpl({ id: 4, source: "layers", packId: null, isDefault: true })];
    expect(resolveDefaultLayoutTemplate(templates, "milestone")?.id).toBe(4);
  });

  it("never falls back to a pack row carrying isDefault", () => {
    const templates = [tpl({ id: 1, packId: "gold-foil-v1", isDefault: true })];
    expect(resolveDefaultLayoutTemplate(templates, "milestone")).toBeNull();
  });

  it("prefers a defaultForKinds claim over the legacy isDefault flag", () => {
    const templates = [
      tpl({ id: 1, source: "layers", packId: null, isDefault: true }),
      tpl({ id: 2, source: "layers", packId: null, defaultForKinds: ["milestone"] }),
    ];
    expect(resolveDefaultLayoutTemplate(templates, "milestone")?.id).toBe(2);
  });

  it("ignores inactive rows and rows scoped to other kinds", () => {
    expect(
      resolveDefaultLayoutTemplate(
        [
          tpl({
            id: 1,
            source: "layers",
            packId: null,
            isActive: false,
            defaultForKinds: ["milestone"],
          }),
        ],
        "milestone",
      ),
    ).toBeNull();
    expect(
      resolveDefaultLayoutTemplate(
        [tpl({ id: 1, source: "layers", packId: null, cardKinds: ["century"], isDefault: true })],
        "milestone",
      ),
    ).toBeNull();
  });
});
