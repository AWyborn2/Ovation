/**
 * Round 3 retest, P0 1: dev's server drew downloads with the published app's
 * older render page, so Team List names came out blank. The server now refuses
 * a render page from a different build rather than draw a card missing names.
 */
import { describe, expect, it } from "vitest";
import { CARD_RENDER_CONTRACT } from "@workspace/scorecard/render-contract";
import { checkHarnessContract, HarnessContractError } from "./card-video-renderer";

const URL = "https://ovation.example/__card-render";

describe("render harness contract", () => {
  it("draws with a harness from this build", () => {
    expect(() => checkHarnessContract(URL, CARD_RENDER_CONTRACT)).not.toThrow();
  });

  it("refuses a harness built before the contract existed", () => {
    expect(() => checkHarnessContract(URL, null)).toThrow(HarnessContractError);
    expect(() => checkHarnessContract(URL, undefined)).toThrow(/ovation\.example/);
  });

  it("refuses a harness from another version", () => {
    expect(() => checkHarnessContract(URL, CARD_RENDER_CONTRACT - 1)).toThrow(
      /different version of the app/,
    );
  });
});
