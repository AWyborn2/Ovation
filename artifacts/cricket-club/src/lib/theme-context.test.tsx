import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, useThemeMode } from "./theme-context";

function mockMatchMedia(matches: boolean) {
  let listeners: Array<() => void> = [];
  const mql = {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      listeners = listeners.filter((l) => l !== cb);
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql),
  );
  return {
    mql,
    fireChange: (next: boolean) => {
      mql.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

function Probe() {
  const { mode, preference, setPreference, toggle } = useThemeMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="preference">{preference}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={() => setPreference("system")}>system</button>
    </div>
  );
}

describe("ThemeProvider / useThemeMode", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves to dark on first render when the OS prefers dark and nothing is stored (AE1)", () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("resolves to light on first render when the OS prefers light and nothing is stored", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists an explicit toggle across a fresh mount, overriding OS preference (AE2)", () => {
    mockMatchMedia(true); // OS prefers dark
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      screen.getByText("toggle").click();
    });
    expect(screen.getByTestId("mode").textContent).toBe("light");
    unmount();

    // Fresh mount, same localStorage, OS still "dark" — should stay light.
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("light");
    expect(screen.getByTestId("preference").textContent).toBe("light");
  });

  it("live-updates when the stored preference is system and the OS preference changes", () => {
    const { fireChange } = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("mode").textContent).toBe("light");
    act(() => {
      fireChange(true);
    });
    expect(screen.getByTestId("mode").textContent).toBe("dark");
  });

  it("stops tracking the OS once an explicit choice is made", () => {
    const { fireChange } = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    act(() => {
      screen.getByText("toggle").click(); // explicit -> dark
    });
    expect(screen.getByTestId("mode").textContent).toBe("dark");
    act(() => {
      fireChange(false); // OS flips back to light; should NOT affect us now
    });
    expect(screen.getByTestId("mode").textContent).toBe("dark");
  });
});
