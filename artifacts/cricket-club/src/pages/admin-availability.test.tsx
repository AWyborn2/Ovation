import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { renderAt } from "../test/render";
import type {
  AvailabilityRoundStatus,
  AvailabilitySettings,
  SquadImportResult,
  SquadMember,
  SquadMemberDetail,
} from "@workspace/api-client-react";
import AdminAvailability from "./admin-availability";

/**
 * Admin → Availability (plan 2026-10-06-002 U10): schedule settings show the server's
 * validation message, the import summary shows counts and skip reasons, and contact
 * values never appear outside the edit drawer.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SETTINGS: AvailabilitySettings = {
  enabled: false,
  smsEnabled: true,
  sendDow: 1,
  sendTime: "18:00",
  reminderDow: 3,
  reminderTime: "18:00",
  cutoffDow: 4,
  cutoffTime: "20:00",
  finaliseDow: 5,
  finaliseTime: "12:00",
  selectionRule: "captains_own_grade",
  updatedAt: null,
};

const ROUND: AvailabilityRoundStatus = {
  enabled: false,
  roundId: null,
  weekendDate: "2026-10-10",
  sendAt: "2026-10-05T10:00:00.000Z",
  reminderAt: "2026-10-07T10:00:00.000Z",
  cutoffAt: "2026-10-08T12:00:00.000Z",
  finaliseAt: "2026-10-09T04:00:00.000Z",
  sendStartedAt: null,
  sendCompletedAt: null,
  reminderStartedAt: null,
  reminderCompletedAt: null,
  cutoffStartedAt: null,
  cutoffCompletedAt: null,
  counts: { yes: 0, maybe: 0, no: 0, none: 0, late: 0, total: 0 },
};

const presence = (over = {}) => ({
  hasName: true,
  hasMobile: true,
  hasEmail: true,
  smsOptedOut: false,
  ...over,
});
const none = { hasName: false, hasMobile: false, hasEmail: false, smsOptedOut: false };

const MEMBER: SquadMember = {
  id: 7,
  playhqProfileId: "p-7",
  firstName: "Jordan",
  lastName: "Hale",
  preferredName: null,
  section: "junior",
  active: true,
  activeSetByAdmin: false,
  under18: true,
  gradeHint: "D Grade",
  teamName: null,
  ageGroup: "U16",
  isPrivate: false,
  linkedPlayerId: null,
  linkedPlayerName: null,
  account: none,
  guardian1: presence({ smsOptedOut: true }),
  guardian2: presence({ hasMobile: false }),
  contactChangeFlag: true,
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const DETAIL: SquadMemberDetail = {
  id: 7,
  playhqProfileId: "p-7",
  firstName: "Jordan",
  lastName: "Hale",
  preferredName: null,
  dateOfBirth: "2011-02-03",
  section: "junior",
  active: true,
  activeSetByAdmin: false,
  under18: true,
  gradeHint: "D Grade",
  teamName: null,
  ageGroup: "U16",
  isPrivate: false,
  linkedPlayerId: null,
  linkedPlayerName: null,
  account: { name: null, mobile: null, email: null, smsOptedOut: false },
  guardian1: {
    name: "Sam Hale",
    mobile: "0412345678",
    email: "sam.hale@example.com",
    smsOptedOut: true,
  },
  guardian2: { name: "Alex Hale", mobile: null, email: "alex@example.com", smsOptedOut: false },
  contactChangeFlag: true,
  contactChangedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

type Reply = { status?: number; body: unknown };
type Handler = (url: string, method: string) => Reply | undefined;

/** A fetch stub that can answer by method and with error statuses. */
function installFetch(handler: Handler) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      const reply = handler(url, method) ?? defaults(url);
      const status = reply.status ?? 200;
      if (status === 204) return new Response(null, { status });
      return new Response(JSON.stringify(reply.body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

function defaults(url: string): Reply {
  if (url.includes("/availability/settings")) return { body: SETTINGS };
  if (url.includes("/availability/rounds/current")) return { body: ROUND };
  if (url.includes("/squad/player-search")) return { body: [] };
  if (/\/squad\/\d+/.test(url)) return { body: DETAIL };
  if (url.includes("/squad")) return { body: [MEMBER] };
  return { body: null };
}

describe("admin availability", () => {
  it("shows the server's message when the cut-off is set before the send", async () => {
    const message = "The cut-off must come after the send in the same week.";
    const calls = installFetch((url, method) =>
      url.includes("/availability/settings") && method === "PUT"
        ? { status: 400, body: { error: message } }
        : undefined,
    );
    renderAt(<AdminAvailability />, "/admin/availability");

    const day = await screen.findByLabelText("Cut-off day");
    fireEvent.change(day, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));

    const alert = await screen.findByTestId("settings-error");
    expect(alert.textContent).toBe(message);
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toContain("/api/availability/settings");
  });

  it("disables Run now while the club has availability off", async () => {
    installFetch(() => undefined);
    renderAt(<AdminAvailability />, "/admin/availability");
    expect(await screen.findByTestId("round-disabled")).toBeTruthy();
    const run = screen.getByRole("button", { name: "Run Send requests now" }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
  });

  it("shows a 409 from a Run now step", async () => {
    installFetch((url, method) => {
      if (url.includes("/availability/rounds/current/send") && method === "POST")
        return { status: 409, body: { error: "The send step has already run this round." } };
      if (url.includes("/availability/rounds/current"))
        return { body: { ...ROUND, enabled: true } };
      return undefined;
    });
    renderAt(<AdminAvailability />, "/admin/availability");
    fireEvent.click(await screen.findByRole("button", { name: "Run Send requests now" }));
    fireEvent.click(await screen.findByRole("button", { name: "Run now" }));
    const alert = await screen.findByTestId("round-error");
    expect(alert.textContent).toBe("The send step has already run this round.");
  });

  it("shows the import summary with counts and skip reasons", async () => {
    const result: SquadImportResult = {
      season: "2026/27",
      created: 12,
      updated: 30,
      deactivated: 2,
      linked: 5,
      contactsKept: 1,
      skipped: [
        { line: 4, name: "Pat Coach", reason: "not_a_player" },
        { line: 9, name: "Lee Old", reason: "inactive_status" },
        { line: 11, name: "Kim Gone", reason: "inactive_status" },
      ],
      skippedByReason: [
        { reason: "inactive_status", count: 2 },
        { reason: "not_a_player", count: 1 },
      ],
    };
    const calls = installFetch((url, method) =>
      url.includes("/squad/import") && method === "POST" ? { body: result } : undefined,
    );
    renderAt(<AdminAvailability />, "/admin/availability");

    const input = (await screen.findByLabelText(/PlayHQ participant export/i)) as HTMLInputElement;
    const file = new File(["Profile ID,First Name\n"], "participants.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    const summary = await screen.findByTestId("import-summary");
    const s = within(summary);
    expect(s.getByText(/season 2026\/27/)).toBeTruthy();
    const count = (label: string) => s.getByText(label).nextElementSibling?.textContent;
    expect(count("Added")).toBe("12");
    expect(count("Updated")).toBe("30");
    expect(count("Stood down")).toBe("2");
    expect(count("Skipped")).toBe("3");
    expect(s.getByTestId("import-contacts-kept").textContent).toMatch(/1 member changed/);
    expect(s.getByText("Registration not active: 2")).toBeTruthy();
    expect(s.getByText("Not registered as a player: 1")).toBeTruthy();
    expect(s.getByText(/Line 4: Pat Coach/)).toBeTruthy();
    expect(calls.some((c) => c.url.includes("/squad/import") && c.method === "POST")).toBe(true);
  });

  it("renders no contact values outside the edit drawer", async () => {
    const calls = installFetch(() => undefined);
    renderAt(<AdminAvailability />, "/admin/availability");

    const row = await screen.findByTestId("squad-row-7");
    const r = within(row);
    expect(r.getByText("Jordan Hale")).toBeTruthy();
    expect(r.getByText("SMS opted out")).toBeTruthy();
    expect(r.getByText("Contact changed")).toBeTruthy();
    expect(r.getByText("No mobile")).toBeTruthy();

    // The detail (with contact values) is only requested once the drawer opens.
    expect(calls.some((c) => /\/squad\/7/.test(c.url))).toBe(false);
    for (const value of ["0412345678", "sam.hale@example.com", "alex@example.com", "Sam Hale"]) {
      expect(document.body.textContent).not.toContain(value);
      expect(screen.queryByDisplayValue(value)).toBeNull();
    }

    fireEvent.click(r.getByRole("button", { name: "Edit" }));
    const drawer = await screen.findByRole("dialog");
    expect(await within(drawer).findByDisplayValue("0412345678")).toBeTruthy();
    expect(within(drawer).getByDisplayValue("sam.hale@example.com")).toBeTruthy();
    expect(calls.some((c) => /\/squad\/7$/.test(c.url))).toBe(true);
    // Still nothing in the table itself.
    expect(row.textContent).not.toContain("0412345678");
  });

  it("removes a member's details only after confirming", async () => {
    const calls = installFetch((url, method) =>
      /\/squad\/7$/.test(url) && method === "DELETE" ? { status: 204, body: null } : undefined,
    );
    renderAt(<AdminAvailability />, "/admin/availability");
    fireEvent.click(
      within(await screen.findByTestId("squad-row-7")).getByRole("button", { name: "Edit" }),
    );
    const drawer = await screen.findByRole("dialog");
    await within(drawer).findByDisplayValue("0412345678");
    fireEvent.click(within(drawer).getByRole("button", { name: /Remove member/ }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: "Remove details" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
  });

  it("names the linked player in the squad table", async () => {
    installFetch((url) =>
      url.endsWith("/api/squad")
        ? { body: [{ ...MEMBER, linkedPlayerId: 501, linkedPlayerName: "Jordan Wyllie" }] }
        : undefined,
    );
    renderAt(<AdminAvailability />, "/admin/availability");
    const row = await screen.findByTestId("squad-row-7");
    expect(within(row).getByText("Jordan Wyllie")).toBeTruthy();
    expect(row.textContent).not.toContain("#501");
  });

  it("links a club player from the drawer search, never one linked elsewhere, and unlinks", async () => {
    const hits = [
      {
        playerId: 503,
        displayName: "J Barnes",
        lastSeason: "2025/26",
        alreadyLinkedTo: { memberId: 99, name: "Jack Barnes" },
      },
      { playerId: 502, displayName: "J Barnes", lastSeason: "2022/23", alreadyLinkedTo: null },
    ];
    let detail: SquadMemberDetail = {
      ...DETAIL,
      linkedPlayerId: 501,
      linkedPlayerName: "J Wyllie",
    };
    const calls = installFetch((url, method) => {
      if (url.includes("/squad/player-search")) return { body: hits };
      if (/\/squad\/7$/.test(url) && method === "PATCH") return { body: detail };
      if (/\/squad\/7$/.test(url)) return { body: detail };
      return undefined;
    });
    renderAt(<AdminAvailability />, "/admin/availability");
    fireEvent.click(
      within(await screen.findByTestId("squad-row-7")).getByRole("button", { name: "Edit" }),
    );
    const drawer = await screen.findByRole("dialog");
    const d = within(drawer);
    // The current link shows by name, not number.
    expect(await d.findByText("J Wyllie")).toBeTruthy();

    const box = d.getByRole("combobox", { name: "Club player" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "ba" } });
    const list = await d.findByRole("listbox", { name: "Club players" });
    const options = await within(list).findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute("aria-disabled")).toBe("true");
    expect(options[0].textContent).toContain("Already linked to Jack Barnes");
    const search = calls.find((c) => c.url.includes("/squad/player-search"));
    expect(search?.url).toContain("q=ba");

    // A player linked to someone else can't be picked.
    fireEvent.mouseDown(options[0]);
    expect(d.getByTestId("linked-player").textContent).toContain("J Wyllie");
    fireEvent.mouseDown(options[1]);
    expect(d.getByTestId("linked-player").textContent).toContain("J Barnes");
    fireEvent.click(d.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ linkedPlayerId: 502 }),
    );

    // Unlink sends null.
    detail = { ...DETAIL, linkedPlayerId: 502, linkedPlayerName: "J Barnes" };
    fireEvent.click(
      within(await screen.findByTestId("squad-row-7")).getByRole("button", { name: "Edit" }),
    );
    const again = within(await screen.findByRole("dialog"));
    fireEvent.click(await again.findByRole("button", { name: "Unlink" }));
    expect(again.getByTestId("linked-player").textContent).toContain("Not linked");
    fireEvent.click(again.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toMatchObject({
        linkedPlayerId: null,
      }),
    );
  });
});
