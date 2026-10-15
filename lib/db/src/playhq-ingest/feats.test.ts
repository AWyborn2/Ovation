import { describe, it, expect } from "vitest";
import { detectFeats, detectFiveCatches, detectHatTricks, type FeatBall } from "./feats";

const BOWLER = "b1";
let seq = 0;
function ball(over: Partial<FeatBall> = {}): FeatBall {
  seq += 1;
  return {
    innings: 1,
    seq,
    overNumber: Math.ceil(seq / 6),
    bowlerId: BOWLER,
    bowlerName: "A Spinner",
    isWicket: false,
    dismissalType: null,
    dismissedId: null,
    dismissedName: null,
    wides: 0,
    noBalls: 0,
    ...over,
  };
}
const wicket = (how: string, over: Partial<FeatBall> = {}) =>
  ball({ isWicket: true, dismissalType: how, dismissedName: "Batter", ...over });
const dot = (over: Partial<FeatBall> = {}) => ball(over);

describe("detectHatTricks", () => {
  it("three consecutive bowler-credited wickets give one hat-trick (AE3)", () => {
    seq = 0;
    const feats = detectHatTricks([
      dot(),
      wicket("Bowled"),
      wicket("Caught"),
      wicket("LBW"),
      dot(),
    ]);
    expect(feats).toHaveLength(1);
    expect(feats[0]).toMatchObject({ kind: "hatTrick", participantId: BOWLER, innings: 1 });
    expect(feats[0].detail).toMatchObject({
      kind: "hatTrick",
      wickets: [
        { seq: 2, how: "bowled" },
        { seq: 3, how: "caught" },
        { seq: 4, how: "lbw" },
      ],
    });
  });

  it("a wide between two of the wickets does not break it (AE3)", () => {
    seq = 0;
    const feats = detectHatTricks([
      wicket("Bowled"),
      wicket("Caught"),
      dot({ wides: 1 }),
      wicket("Stumped"),
    ]);
    expect(feats).toHaveLength(1);
  });

  it("a caught-and-bowled middle wicket counts", () => {
    seq = 0;
    expect(
      detectHatTricks([wicket("Bowled"), wicket("Caught & Bowled"), wicket("Hit Wicket")]),
    ).toHaveLength(1);
  });

  it("two wickets then a dot ball is no hat-trick", () => {
    seq = 0;
    expect(
      detectHatTricks([wicket("Bowled"), wicket("Caught"), dot(), wicket("LBW")]),
    ).toHaveLength(0);
  });

  it("a run out as the middle wicket is no hat-trick", () => {
    seq = 0;
    expect(detectHatTricks([wicket("Bowled"), wicket("Run Out"), wicket("Caught")])).toHaveLength(
      0,
    );
  });

  it("an unknown dismissal type never credits the bowler", () => {
    seq = 0;
    expect(
      detectHatTricks([wicket("Bowled"), wicket("Retired Hurt"), wicket("Caught")]),
    ).toHaveLength(0);
  });

  it("spanning the end of one over and the start of the bowler's next is detected", () => {
    seq = 0;
    const balls: FeatBall[] = [];
    for (let i = 0; i < 4; i++) balls.push(dot());
    balls.push(wicket("Bowled"), wicket("Caught")); // balls 5 and 6 of over 1
    // Another bowler's over in between.
    for (let i = 0; i < 6; i++) balls.push(dot({ bowlerId: "b2", bowlerName: "Other" }));
    balls.push(wicket("LBW")); // first ball of the bowler's next over
    const feats = detectHatTricks(balls);
    expect(feats).toHaveLength(1);
    expect(feats[0].detail).toMatchObject({ wickets: [{ over: 1 }, { over: 1 }, { over: 3 }] });
  });

  it("four in a row is one hat-trick, not two", () => {
    seq = 0;
    expect(
      detectHatTricks([wicket("Bowled"), wicket("Caught"), wicket("LBW"), wicket("Stumped")]),
    ).toHaveLength(1);
  });

  it("wickets in different innings never join up", () => {
    seq = 0;
    expect(
      detectHatTricks([wicket("Bowled"), wicket("Caught"), wicket("LBW", { innings: 2 })]),
    ).toHaveLength(0);
  });

  it("no balls gives no hat-trick (AE4)", () => {
    expect(detectHatTricks([])).toHaveLength(0);
  });
});

describe("detectFiveCatches", () => {
  it("five total catches in an innings is a feat; stumpings don't count", () => {
    const feats = detectFiveCatches([
      { innings: 1, participantId: "k1", playerName: "Keeper", totalCatches: 3 },
      { innings: 2, participantId: "k1", playerName: "Keeper", totalCatches: 5 },
      { innings: 1, participantId: "f1", playerName: "Slip", totalCatches: 4 },
    ]);
    expect(feats).toEqual([
      {
        kind: "fiveCatches",
        innings: 2,
        participantId: "k1",
        playerName: "Keeper",
        detail: { kind: "fiveCatches", catches: 5 },
      },
    ]);
  });
});

describe("detectFeats", () => {
  it("orders feats by innings then kind", () => {
    seq = 0;
    const feats = detectFeats(
      [
        wicket("Bowled", { innings: 2 }),
        wicket("Caught", { innings: 2 }),
        wicket("LBW", { innings: 2 }),
      ],
      [{ innings: 1, participantId: "f1", playerName: "Slip", totalCatches: 6 }],
    );
    expect(feats.map((f) => [f.innings, f.kind])).toEqual([
      [1, "fiveCatches"],
      [2, "hatTrick"],
    ]);
  });
});
