import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  activePreset,
  applyStatsView,
  inStatsRange,
  mergeStatsView,
  parseSeasonYear,
  parseStatsView,
  rangeLabel,
  rangePresets,
  seasonLabel,
  useStatsView,
} from "./use-stats-view";

const SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

function renderStatsView(path: string) {
  const loc = memoryLocation({ path, record: true });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Router, { hook: loc.hook, searchHook: loc.searchHook, children });
  const hook = renderHook(() => useStatsView(), { wrapper });
  const url = () => loc.history!.at(-1)!;
  return { ...hook, loc, url };
}

describe("parseStatsView", () => {
  it("reads ?from=2023&to=2025&d=bowl as 2023–2025, bowling", () => {
    expect(parseStatsView("?from=2023&to=2025&d=bowl")).toEqual({
      from: 2023,
      to: 2025,
      d: "bowl",
    });
  });

  it("defaults to Career and batting", () => {
    expect(parseStatsView("")).toEqual({ from: null, to: null, d: "bat" });
  });

  it("ignores junk params and orders an inverted range", () => {
    expect(parseStatsView("from=abc&to=20&d=keep")).toEqual({ from: null, to: null, d: "bat" });
    expect(parseStatsView("from=2025&to=2021")).toMatchObject({ from: 2021, to: 2025 });
  });
});

describe("mergeStatsView / applyStatsView", () => {
  const base = { from: 2021, to: 2023, d: "bat" as const };

  it("setting From later than To pushes To forward", () => {
    expect(mergeStatsView(base, { from: 2025 })).toMatchObject({ from: 2025, to: 2025 });
  });

  it("setting To earlier than From pulls From back", () => {
    expect(mergeStatsView(base, { to: 2019 })).toMatchObject({ from: 2019, to: 2019 });
  });

  it("an inverted pair set together is swapped", () => {
    expect(mergeStatsView(base, { from: 2024, to: 2020 })).toMatchObject({ from: 2020, to: 2024 });
  });

  it("Career clears from/to and keeps unrelated params", () => {
    const qs = applyStatsView("a=12&from=2021&to=2023&d=bowl", { from: null, to: null });
    const p = new URLSearchParams(qs);
    expect(p.get("a")).toBe("12");
    expect(p.has("from")).toBe(false);
    expect(p.has("to")).toBe(false);
    expect(p.get("d")).toBe("bowl");
  });

  it("batting is written as the absence of d", () => {
    expect(applyStatsView("d=bowl&b=4", { d: "bat" })).toBe("b=4");
  });
});

describe("presets and labels", () => {
  it("builds Career · Last 3 · latest · previous from the page's season list", () => {
    const presets = rangePresets([2023, null, 2025, 2024, 2021, 2025]);
    expect(presets.map((p) => p.label)).toEqual(["Career", "Last 3 seasons", "2025/26", "2024/25"]);
    expect(presets[1].patch).toEqual({ from: 2023, to: 2025 });
  });

  it("omits presets the season list can't support", () => {
    expect(rangePresets([2025]).map((p) => p.key)).toEqual(["career", "latest"]);
    expect(rangePresets([]).map((p) => p.key)).toEqual(["career"]);
  });

  it("recognises the active preset, else custom", () => {
    expect(activePreset({ from: null, to: null, d: "bat" }, SEASONS)).toBe("career");
    expect(activePreset({ from: 2023, to: 2025, d: "bat" }, SEASONS)).toBe("last3");
    expect(activePreset({ from: 2024, to: 2024, d: "bat" }, SEASONS)).toBe("previous");
    expect(activePreset({ from: 2020, to: 2022, d: "bat" }, SEASONS)).toBe("custom");
  });

  it("labels the range", () => {
    expect(rangeLabel({ from: null, to: null, d: "bat" })).toBe("Career");
    expect(rangeLabel({ from: 2024, to: 2024, d: "bat" })).toBe("2024/25");
    expect(rangeLabel({ from: 2023, to: 2025, d: "bat" })).toBe("2023/24 to 2025/26");
    expect(seasonLabel(2009)).toBe("2009/10");
    expect(seasonLabel(2099)).toBe("2099/00");
  });

  it("parses free-text seasons to their start year", () => {
    expect(parseSeasonYear("2023/24")).toBe(2023);
    expect(parseSeasonYear("2023-24")).toBe(2023);
    expect(parseSeasonYear("Season 2019/20")).toBe(2019);
    expect(parseSeasonYear(2021)).toBe(2021);
    expect(parseSeasonYear("n/a")).toBeNull();
    expect(parseSeasonYear(null)).toBeNull();
  });

  it("filters seasons inclusively; Career keeps all, baseline only in Career", () => {
    const view = { from: 2021, to: 2023, d: "bat" as const };
    expect([2020, 2021, 2022, 2023, 2024].filter((s) => inStatsRange(s, view))).toEqual([
      2021, 2022, 2023,
    ]);
    expect(inStatsRange(null, view)).toBe(false);
    expect(inStatsRange(null, { from: null, to: null, d: "bat" })).toBe(true);
    expect(inStatsRange(1990, { from: null, to: null, d: "bat" })).toBe(true);
  });
});

describe("useStatsView", () => {
  it("reads the view from the URL", () => {
    const { result } = renderStatsView("/players/7?from=2023&to=2025&d=bowl");
    expect(result.current.view).toEqual({ from: 2023, to: 2025, d: "bowl" });
    expect(result.current.label).toBe("2023/24 to 2025/26");
  });

  it("Last 3 seasons leaves both from and to in the URL, in ONE navigation", () => {
    const { result, loc, url } = renderStatsView("/players/7");
    const before = loc.history!.length;
    act(() => result.current.setView({ from: 2023, to: 2025 }));
    expect(loc.history!.length - before).toBeLessThanOrEqual(1);
    const p = new URLSearchParams(url().split("?")[1]);
    expect(p.get("from")).toBe("2023");
    expect(p.get("to")).toBe("2025");
    expect(result.current.view).toMatchObject({ from: 2023, to: 2025 });
  });

  it("changes range and discipline together without one overwriting the other", () => {
    const { result, url } = renderStatsView("/compare?a=12&b=9");
    act(() => result.current.setView({ from: 2024, to: 2024, d: "bowl" }));
    const p = new URLSearchParams(url().split("?")[1]);
    expect(Object.fromEntries(p)).toEqual({ a: "12", b: "9", from: "2024", to: "2024", d: "bowl" });
  });

  it("Career clears from/to and keeps a=12", () => {
    const { result, url } = renderStatsView("/compare?a=12&from=2021&to=2023");
    act(() => result.current.setView({ from: null, to: null }));
    expect(url()).toBe("/compare?a=12");
    expect(result.current.view).toMatchObject({ from: null, to: null });
  });

  it("round-trips: a copied URL restores the same view", () => {
    const first = renderStatsView("/players/7");
    act(() => first.result.current.setView({ from: 2020, to: 2022, d: "bowl" }));
    const copied = first.url();
    first.unmount();
    const second = renderStatsView(copied);
    expect(second.result.current.view).toEqual({ from: 2020, to: 2022, d: "bowl" });
  });
});
