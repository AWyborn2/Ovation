import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import LandingPage from "@/pages/landing/landing-page";
import DirectoryPage from "@/pages/landing/directory-page";
import SignupPage from "@/pages/landing/signup-page";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Landing (Broadcast U20)", () => {
  it("renders the Broadcast hero, feature tiles and platform chrome only", () => {
    installApiMock();
    const { container } = renderAt(<LandingPage />, "/");
    expect(screen.getByTestId("hero-home")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/stats and history/);
    expect(screen.getAllByTestId("landing-feature")).toHaveLength(4);
    expect(screen.getByTestId("platform-wordmark").textContent).toBe("Ovation");
    // Platform brand only: no club Layout, no tenant token overrides inline.
    expect(container.querySelector("[data-full-bleed], .bc-page")).toBeNull();
    expect(container.innerHTML).not.toMatch(/--primary:/);
  });
});

describe("Directory", () => {
  const CLUBS = [
    {
      slug: "hallshead",
      name: "Halls Head Cricket Club",
      shortName: "HHCC",
      url: "https://hallshead.example",
    },
    {
      slug: "mandurah",
      name: "Mandurah Cricket Club",
      shortName: "MCC",
      url: "https://mandurah.example",
    },
  ];

  it("lists clubs and filters by search", async () => {
    installApiMock({ "/api/platform/directory-clubs": CLUBS });
    renderAt(<DirectoryPage />, "/directory");
    expect(await screen.findAllByTestId("directory-club")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Search clubs"), { target: { value: "mand" } });
    const left = screen.getAllByTestId("directory-club");
    expect(left).toHaveLength(1);
    expect(left[0].textContent).toContain("Mandurah");
  });
});

describe("Signup", () => {
  const AVAILABLE = [
    {
      centralClubId: 12,
      name: "Mandurah Cricket Club",
      shortName: "MCC",
      suggestedSlug: "mandurah",
    },
  ];

  it("keeps validation: submit stays disabled until the address, email and password are valid", async () => {
    installApiMock({
      "/api/platform/available-clubs": AVAILABLE,
      "/api/platform/slug-available": { available: false, reason: "That address is taken." },
    });
    renderAt(<SignupPage />, "/signup");
    expect(screen.getByTestId("signup-card")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Mandurah Cricket Club/ }));
    expect(await screen.findByText("That address is taken.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Create my club's site" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("submits through the existing signup mutation", async () => {
    installApiMock({
      "/api/platform/available-clubs": AVAILABLE,
      "/api/platform/slug-available": { available: true },
      "/api/platform/signup": { redirectUrl: "https://mandurah.example/admin" },
    });
    const mocked = globalThis.fetch;
    const posts: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if ((init?.method ?? "GET") === "POST") posts.push(url);
      return mocked(input, init);
    });
    renderAt(<SignupPage />, "/signup");
    fireEvent.click(await screen.findByRole("button", { name: /Mandurah Cricket Club/ }));
    fireEvent.change(screen.getByLabelText("Admin email"), { target: { value: "sec@mcc.org.au" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    const submit = screen.getByRole("button", { name: "Create my club's site" });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(posts.some((u) => u.endsWith("/api/platform/signup"))).toBe(true));
    expect(await screen.findByText("Your club's site is live!")).toBeTruthy();
  });
});
