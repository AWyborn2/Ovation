import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  FilterChips,
  LeaderRow,
  PageHero,
  ResultsTicker,
  UnderlineTabs,
  initialsOf,
  resultCode,
  type TickerItem,
} from "@/components/broadcast";
import { useSearchParamState } from "@/lib/use-search-param";

afterEach(cleanup);

function withRouter(ui: React.ReactNode, path = "/") {
  const loc = memoryLocation({ path, record: true });
  const utils = render(
    <Router hook={loc.hook} searchHook={loc.searchHook}>
      {ui}
    </Router>,
  );
  return { ...utils, loc };
}

const ITEMS: TickerItem[] = ["A", "B", "C", "F"].map((g, i) => ({
  id: i,
  grade: g,
  line: `HHCC ${i}/200 v MAN 150`,
  result: i % 2 ? "Lost" : "Won",
  href: `/matches/${i}`,
}));

describe("ResultsTicker (Broadcast AE6)", () => {
  it("renders each result twice with the duplicate hidden from AT and the tab order", () => {
    withRouter(<ResultsTicker items={ITEMS} />);
    const track = screen.getByTestId("ticker-track");
    const buttons = track.querySelectorAll("button");
    expect(buttons).toHaveLength(8);
    const hidden = track.querySelectorAll('button[aria-hidden="true"]');
    expect(hidden).toHaveLength(4);
    hidden.forEach((b) => expect(b.getAttribute("tabindex")).toBe("-1"));
    expect((track as HTMLElement).style.animation).toContain("20s");
  });

  it("renders a single static scrollable row under reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      withRouter(<ResultsTicker items={ITEMS} />);
      expect(screen.queryByTestId("ticker-track")).toBeNull();
      expect(screen.getByTestId("ticker-static").querySelectorAll("button")).toHaveLength(4);
    } finally {
      window.matchMedia = original;
    }
  });

  it("renders nothing for zero results", () => {
    const { container } = withRouter(<ResultsTicker items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("navigates to the match on click", () => {
    const { loc } = withRouter(<ResultsTicker items={ITEMS} />);
    fireEvent.click(screen.getAllByText("HHCC 2/200 v MAN 150")[0]);
    expect(loc.history?.at(-1)).toBe("/matches/2");
  });
});

function ChipsWithUrl() {
  const [grade, setGrade] = useSearchParamState("grade", "all");
  return (
    <FilterChips
      label="Grade"
      value={grade}
      onChange={setGrade}
      options={[
        { value: "all", label: "All" },
        { value: "B", label: "B Grade" },
      ]}
    />
  );
}

describe("FilterChips + useSearchParamState", () => {
  it("clicking a chip writes ?grade= to the URL and marks it pressed", () => {
    const { loc } = withRouter(<ChipsWithUrl />, "/players");
    fireEvent.click(screen.getByText("B Grade"));
    expect(loc.history?.at(-1)).toBe("/players?grade=B");
    expect(screen.getByText("B Grade").getAttribute("aria-pressed")).toBe("true");
  });

  it("reads the initial value from the URL", () => {
    withRouter(<ChipsWithUrl />, "/players?grade=B");
    expect(screen.getByText("B Grade").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("All").getAttribute("aria-pressed")).toBe("false");
  });

  it("selecting the default removes the param", () => {
    const { loc } = withRouter(<ChipsWithUrl />, "/players?grade=B");
    fireEvent.click(screen.getByText("All"));
    expect(loc.history?.at(-1)).toBe("/players");
  });
});

function Tabs() {
  const [v, setV] = useState("a");
  return (
    <UnderlineTabs
      label="Innings"
      value={v}
      onChange={setV}
      tabs={[
        { value: "a", label: "First" },
        { value: "b", label: "Second" },
      ]}
    />
  );
}

describe("UnderlineTabs", () => {
  it("arrow keys move selection and focus (roving tabindex)", () => {
    render(<Tabs />);
    const [first, second] = screen.getAllByRole("tab");
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(second.getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[1]);
    fireEvent.keyDown(screen.getAllByRole("tab")[1], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
  });
});

describe("LeaderRow", () => {
  it("sizes the bar against the leader and never produces NaN", () => {
    const { rerender } = render(<LeaderRow rank={2} name="A B" value={50} max={200} />);
    expect(screen.getByTestId("leader-bar").style.width).toBe("25%");
    rerender(<LeaderRow rank={1} name="A B" value={0} max={0} />);
    expect(screen.getByTestId("leader-bar").style.width).toBe("0%");
  });
});

describe("PageHero (Broadcast AE5)", () => {
  it("renders a gradient and no <img> when the tenant has no photo", () => {
    render(
      <PageHero variant="home" image={null}>
        <h1>Senior cricket</h1>
      </PageHero>,
    );
    const hero = screen.getByTestId("hero-home");
    expect(hero.querySelector("img")).toBeNull();
    expect(hero.style.background).toContain("gradient");
  });

  it("renders the photo when provided", () => {
    render(
      <PageHero variant="honours" image="/api/storage/objects/wall.webp" fullWidthImage>
        <h1>Honour boards</h1>
      </PageHero>,
    );
    expect(screen.getByTestId("hero-honours").querySelector("img")?.getAttribute("src")).toBe(
      "/api/storage/objects/wall.webp",
    );
  });
});

describe("helpers", () => {
  it("initialsOf handles 'First Last' and 'Last, First'", () => {
    expect(initialsOf("Mitchell Caine")).toBe("MC");
    expect(initialsOf("Caine, Mitchell")).toBe("MC");
    expect(initialsOf("")).toBe("?");
  });

  it("resultCode normalises free-text results", () => {
    expect(resultCode("Won by 6 wickets")).toBe("W");
    expect(resultCode("lost")).toBe("L");
    expect(resultCode("Tie")).toBe("T");
    expect(resultCode("No result")).toBe("NR");
    expect(resultCode(null)).toBeNull();
  });
});
