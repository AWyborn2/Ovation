import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import AdminSocialCreate from "@/pages/admin-social-create";
import { renderAt } from "@/test/render";

/**
 * Create a card's "Download image" (Ash, 28 Oct 2026): the card as previewed
 * downloads straight away as a PNG; the export window stays behind "More
 * export options".
 */
const saveFile = vi.fn(async () => {});
vi.mock("@/lib/save-files", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  saveFile: (...args: unknown[]) => saveFile(...(args as [])),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  saveFile.mockClear();
});

function stubApi() {
  const stills: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/card-renders/still")) {
        stills.push(JSON.parse(String(init?.body)));
        return new Response(new Blob(["png"], { type: "image/png" }), {
          headers: { "content-type": "image/png" },
        });
      }
      // Nothing else is needed: the page falls back to the club's brand.
      return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
    }),
  );
  return stills;
}

describe("Create a card: Download image", () => {
  it("renders the previewed card and saves it as a PNG at the chosen size", async () => {
    const stills = stubApi();
    renderAt(<AdminSocialCreate />, "/admin/social/create");
    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "milestone" } });
    fireEvent.click(await screen.findByRole("button", { name: "Download image" }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const [blob, name] = saveFile.mock.calls[0] as unknown as [Blob, string];
    expect(blob.type).toBe("image/png");
    expect(name).toMatch(/\.png$/);
    expect(stills).toHaveLength(1);
    const body = stills[0] as { input: { kind: string }; options: { size: string } };
    expect(body.input.kind).toBe("milestone");
    expect(body.options.size).toBe("portrait");
    expect(screen.getByRole("button", { name: /More export options/ })).toBeTruthy();
  });
});
