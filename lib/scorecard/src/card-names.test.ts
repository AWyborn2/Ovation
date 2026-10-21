import { describe, expect, it } from "vitest";
import {
  autoCompetitionLabel,
  autoShortTeamName,
  cardNameKey,
  cardTeamCrest,
  resolveCardCrest,
  resolveCardCompetition,
  resolveCardTeamName,
  teamMonogram,
} from "./card-names";

describe("autoShortTeamName", () => {
  // Real central.clubs register names, PCA (1–27) and WA Premier (101–116).
  it.each([
    ["Halls Head Cricket Club", "Halls Head"],
    ["Harvey Benger Cricket Club Inc", "Harvey Benger"],
    ["White Knights Baldivis Cricket Club", "White Knights Baldivis"],
    ["Rockingham Mandurah Cricket Club (Mariners RMDCC)", "Rockingham Mandurah"],
    ["Secret Harbour Dockers Cricket Club", "Secret Harbour Dockers"],
    ["SJ Blues Cricket Club", "SJ Blues"],
    ["Bayswater Morley Districts", "Bayswater Morley Districts"],
    ["Mount Lawley D", "Mount Lawley D"],
    ["Willetton Premier", "Willetton Premier"],
    ["Midland-Guildford", "Midland-Guildford"],
    ["Perth Cricket Club (WA)", "Perth"],
    ["Subiaco-Floreat Cricket Club", "Subiaco-Floreat"],
  ])("register name %s → %s", (raw, short) => {
    expect(autoShortTeamName(raw)).toBe(short);
  });

  // Real PlayHQ team names from central.matches (2024/25–2025/26).
  it.each([
    ["Halls Head A Grade", "Halls Head"],
    ["Halls Head T20 Female A Grade", "Halls Head"],
    ["Halls Head Colts", "Halls Head"],
    ["Halls Head U21 Mixed", "Halls Head"],
    ["SBCC A Grade", "SBCC"],
    ["SBCC Ladies B Grade", "SBCC"],
    ["SBCC E Grade T20", "SBCC"],
    ["MCC Senior Men A Grade", "MCC"],
    ["MCC Senior Women B Grade", "MCC"],
    ["SJ Blues Senior Women", "SJ Blues"],
    ["SJ Blues U21 Mixed SJ Blues U21", "SJ Blues"],
    ["Pinjarra Women's C Grade", "Pinjarra"],
    ["Pinjarra T20", "Pinjarra"],
    ["Waroona Warriors Senior Men A", "Waroona Warriors"],
    ["Waroona Warriors Senior Mixed F", "Waroona Warriors"],
    ["White Knights Baldivis C Grade - Gold", "White Knights Baldivis"],
    ["White Knights Baldivis T20 A Premier", "White Knights Baldivis"],
    ["WKBCC U21 Mixed White Knights Baldivis U21 Colts", "WKBCC"],
    ["Singleton Irwinians - C-T20", "Singleton Irwinians"],
    ["SHDCC Men - B Grade T20", "SHDCC"],
    ["SICC Senior Men SICC PPL-T20", "SICC"],
    ["Falcons  Senior Mixed D GRADE", "Falcons"],
    ["Falcons SMCC B GRADE", "Falcons SMCC"],
    ["Harvey-Benger CC", "Harvey-Benger"],
    ["Perth CC Over 50 Men", "Perth"],
    ["SMCC One Day 2s", "SMCC"],
    ["Rockingham Hornets E Grade", "Rockingham Hornets"],
    // WA
    ["Subiaco-Floreat - U17", "Subiaco-Floreat"],
    ["Subiaco-Floreat U17 Lionesses", "Subiaco-Floreat"],
    ["Melville - 3s", "Melville"],
    ["Perth - A", "Perth"],
    ["Claremont-Nedlands - 2s", "Claremont-Nedlands"],
    ["Gosnells Hawks Gold - Over 60 Men", "Gosnells Hawks Gold"],
    ["Swan Ath 1st XI", "Swan Ath"],
    ["Claremont Nedlands Year 9 Boys Cricketers", "Claremont Nedlands"],
    ["WDJCC U14 Boys Wolves", "WDJCC"],
    // A truncated PlayHQ name, as square cards used to print it.
    ["SJ Blues Senior A Wo", "SJ Blues"],
  ])("team name %s → %s", (raw, short) => {
    expect(autoShortTeamName(raw)).toBe(short);
  });

  it("keeps names with no grade part: sponsors, nicknames, junior sides", () => {
    for (const name of [
      "Spec Savers Livingston Hornets",
      "Prime Global Hornets",
      "Halls Head Hawks",
      "Centurions",
      "Y05 CN Lightning",
    ]) {
      expect(autoShortTeamName(name)).toBe(name);
    }
  });

  it("never comes back empty", () => {
    expect(autoShortTeamName("Cricket Club")).toBe("Cricket Club");
    expect(autoShortTeamName("Colts")).toBe("Colts");
    expect(autoShortTeamName("")).toBe("");
    expect(autoShortTeamName(null)).toBe("");
  });

  it("is deterministic and stable when applied twice", () => {
    for (const raw of ["MCC Senior Men A Grade", "Perth Cricket Club (WA)", "Melville - 3s"]) {
      const once = autoShortTeamName(raw);
      expect(autoShortTeamName(once)).toBe(once);
    }
  });
});

describe("autoCompetitionLabel", () => {
  it.each([
    ["A Grade", "A Grade"],
    // A grade's own words stay: "Women's A" is the club's call, not automatic.
    ["Female A Grade", "Female A Grade"],
    ["Senior Female B Grade", "Senior Female B Grade"],
    ["ID Athletic PCA Colts Competition", "ID Athletic PCA Colts"],
    ["01. Men's First Grade", "Men's First Grade"],
    ["Women's 1st Grade", "Women's 1st Grade"],
    ["A Grade Wyllie Cup Summer 2025/26", "A Grade Wyllie Cup"],
    ["", ""],
  ])("%s → %s", (raw, label) => {
    expect(autoCompetitionLabel(raw)).toBe(label);
  });
});

describe("resolving with the club's names", () => {
  const names = {
    teams: {
      [cardNameKey("SJ Blues Senior Women")]: "SJ Blues",
      [cardNameKey("MCC Senior Men A Grade")]: "Mandurah",
    },
    crests: { [cardNameKey("MCC Senior Men A Grade")]: "https://example.test/mcc.png" },
    competitions: { [cardNameKey("Female A Grade")]: "Women's A" },
  };

  it("an override wins, then the automatic name", () => {
    expect(resolveCardTeamName(names, "MCC Senior Men A Grade")).toBe("Mandurah");
    expect(resolveCardTeamName(names, "mcc  senior men a grade")).toBe("Mandurah");
    expect(resolveCardTeamName(names, "MCC Senior Men B Grade")).toBe("MCC");
    expect(resolveCardTeamName(null, "Pinjarra Women's C Grade")).toBe("Pinjarra");
  });

  it("competition labels resolve the same way", () => {
    expect(resolveCardCompetition(names, "FEMALE A GRADE")).toBe("Women's A");
    expect(resolveCardCompetition(names, "Female B Grade")).toBe("Female B Grade");
    expect(resolveCardCompetition(undefined, "A Grade")).toBe("A Grade");
  });

  it("crests come from the map only", () => {
    expect(cardTeamCrest(names, "MCC Senior Men A Grade")).toBe("https://example.test/mcc.png");
    expect(cardTeamCrest(names, "Pinjarra")).toBeNull();
  });

  it("the club's own crest choice wins over the input and the map", () => {
    const chosen = {
      crests: { [cardNameKey("Rockingham Hornets")]: "https://example.test/hornets.png" },
      crestOverrides: {
        [cardNameKey("Murdoch University Melville")]: "/api/storage/objects/uploads/mumcc",
        [cardNameKey("Rockingham Hornets")]: "",
      },
    };
    // An uploaded or picked crest replaces whatever the input carried.
    expect(
      resolveCardCrest(chosen, "Murdoch University Melville", "https://example.test/wrong.png"),
    ).toBe("/api/storage/objects/uploads/mumcc");
    // "Use initials badge": no crest at all, even with one in the input or the map.
    expect(resolveCardCrest(chosen, "Rockingham Hornets", "https://example.test/x.png")).toBeNull();
    // No choice: the input's crest, else the map's.
    expect(resolveCardCrest(names, "Pinjarra", "https://example.test/p.png")).toBe(
      "https://example.test/p.png",
    );
    expect(resolveCardCrest(names, "MCC Senior Men A Grade", null)).toBe(
      "https://example.test/mcc.png",
    );
    expect(resolveCardCrest(null, "Pinjarra")).toBeNull();
  });
});

describe("teamMonogram", () => {
  it.each([
    ["White Knights", "WK"],
    ["Melville", "ME"],
    ["Subiaco-Floreat", "SF"],
    ["SJ Blues", "SB"],
    ["", ""],
  ])("%s → %s", (name, mono) => {
    expect(teamMonogram(name)).toBe(mono);
  });
});
