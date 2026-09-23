import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within } from "@testing-library/react";
import AdminBranding from "@/pages/admin-branding";
import { ThemeProvider } from "@/lib/theme-context";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BRAND = {
  name: "Demo Cricket Club",
  shortName: "Demo CC",
  tagline: "Est. 1991",
  logoUrl: null,
  faviconUrl: null,
  primaryColour: "#F59E0B",
  backgroundColour: "#1A3350",
  juniorsColour: "#2A4060",
  backgroundUrl: null,
  useNavyBase: false,
  badgeStyle: "diamond",
  themeOverrides: null,
  heroImages: { home: "https://img.example.com/home.webp" },
};

function renderBranding() {
  installApiMock({ "/api/tenant-brand": BRAND });
  return renderAt(
    <ThemeProvider>
      <AdminBranding />
    </ThemeProvider>,
    "/admin/settings/branding",
  );
}

describe("Branding live preview (Broadcast U16)", () => {
  it("leaf page renders an h2, not a second h1", async () => {
    const { container } = renderBranding();
    expect(await screen.findByRole("heading", { level: 2, name: "Branding" })).toBeTruthy();
    expect(container.querySelector("h1")).toBeNull();
  });

  it("previews the header and the home hero with the tenant photo", async () => {
    renderBranding();
    const preview = await screen.findByTestId("branding-live-preview");
    expect(within(preview).getByTestId("branding-preview-header").textContent).toContain(
      "Demo Cricket Club",
    );
    const hero = within(preview).getByTestId("hero-home");
    expect(hero.querySelector("img")?.getAttribute("src")).toBe(
      "https://img.example.com/home.webp",
    );
  });

  it("reflects an unsaved accent change and name edit before saving", async () => {
    renderBranding();
    const preview = await screen.findByTestId("branding-live-preview");
    const before = preview.style.getPropertyValue("--primary");
    fireEvent.click(screen.getByTestId("swatch-accent-purple"));
    expect(preview.style.getPropertyValue("--primary")).not.toBe(before);

    fireEvent.change(screen.getByTestId("input-brand-name"), {
      target: { value: "Renamed CC" },
    });
    expect(within(preview).getByTestId("branding-preview-header").textContent).toContain(
      "Renamed CC",
    );
  });
});
